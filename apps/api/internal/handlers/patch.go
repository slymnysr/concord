package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
	"go.uber.org/zap"
)

// === GUILD UPDATE ===

type updateGuildReq struct {
	Name        *string `json:"name,omitempty"`
	IconText    *string `json:"icon_text,omitempty"`
	IconColor   *string `json:"icon_color,omitempty"`
	IconURL     *string `json:"icon_url,omitempty"`
	BannerURL   *string `json:"banner_url,omitempty"`
	Description *string `json:"description,omitempty"`
	IsPublic    *bool   `json:"is_public,omitempty"`
	OwnerID     *string `json:"owner_id,omitempty"`
	VanityURLCode     *string `json:"vanity_url_code,omitempty"`
	AfkChannelID      *string `json:"afk_channel_id,omitempty"`
	AfkTimeoutSec     *int32  `json:"afk_timeout_sec,omitempty"`
	SystemChannelID   *string `json:"system_channel_id,omitempty"`
	VerificationLevel *int32  `json:"verification_level,omitempty"`
	ExplicitContentFilter *int32 `json:"explicit_content_filter,omitempty"`
	AutoRoleID        *string `json:"auto_role_id,omitempty"`
}

func (h *Handler) UpdateGuild(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageGuild, w) {
		return
	}
	var req updateGuildReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	// Dinamik UPDATE
	sets := []string{}
	args := []any{guildID}
	addSet := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+itoa(len(args)))
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if len(name) < 2 || len(name) > 64 {
			writeError(w, http.StatusBadRequest, "invalid_name", "2-64 karakter")
			return
		}
		addSet("name", name)
	}
	if req.IconText != nil {
		addSet("icon_text", *req.IconText)
	}
	if req.IconColor != nil {
		addSet("icon_color", *req.IconColor)
	}
	if req.IconURL != nil {
		addSet("icon_url_v2", *req.IconURL)
	}
	if req.BannerURL != nil {
		addSet("banner_url", *req.BannerURL)
	}
	if req.Description != nil {
		addSet("description", *req.Description)
	}
	if req.IsPublic != nil {
		addSet("is_public", *req.IsPublic)
	}
	if req.VanityURLCode != nil {
		v := strings.TrimSpace(*req.VanityURLCode)
		if v == "" {
			addSet("vanity_url_code", nil)
		} else {
			addSet("vanity_url_code", v)
		}
	}
	if req.VerificationLevel != nil {
		addSet("verification_level", *req.VerificationLevel)
	}
	if req.ExplicitContentFilter != nil {
		addSet("explicit_content_filter", *req.ExplicitContentFilter)
	}
	if req.AfkChannelID != nil {
		if *req.AfkChannelID == "" {
			addSet("afk_channel_id", nil)
		} else if id, e := strconv.ParseInt(*req.AfkChannelID, 10, 64); e == nil {
			addSet("afk_channel_id", id)
		}
	}
	if req.AfkTimeoutSec != nil {
		v := *req.AfkTimeoutSec
		if v < 60 {
			v = 60
		}
		if v > 3600 {
			v = 3600
		}
		addSet("afk_timeout_sec", v)
	}
	if req.SystemChannelID != nil {
		if *req.SystemChannelID == "" {
			addSet("system_channel_id", nil)
		} else if id, e := strconv.ParseInt(*req.SystemChannelID, 10, 64); e == nil {
			addSet("system_channel_id", id)
		}
	}
	if req.AutoRoleID != nil {
		if *req.AutoRoleID == "" {
			addSet("auto_role_id", nil)
		} else if id, e := strconv.ParseInt(*req.AutoRoleID, 10, 64); e == nil {
			// Rol bu sunucuya ait olmalı
			var belongs bool
			_ = h.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM roles WHERE id = $1 AND guild_id = $2)`, id, guildID).Scan(&belongs)
			if !belongs {
				writeError(w, http.StatusBadRequest, "invalid_role", "rol bu sunucuya ait değil")
				return
			}
			addSet("auto_role_id", id)
		}
	}
	if req.OwnerID != nil {
		// Sahipliği yalnızca mevcut sahip devredebilir; yeni sahip üye olmalı
		g, gerr := h.Guilds.ByID(r.Context(), guildID)
		if gerr != nil || g.OwnerID != uid {
			writeError(w, http.StatusForbidden, "forbidden", "sahipliği yalnızca mevcut sahip devredebilir")
			return
		}
		newOwner, perr := strconv.ParseInt(*req.OwnerID, 10, 64)
		if perr != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "owner_id parse")
			return
		}
		if ok, _ := h.Guilds.IsMember(r.Context(), guildID, newOwner); !ok {
			writeError(w, http.StatusBadRequest, "not_member", "yeni sahip sunucu üyesi olmalı")
			return
		}
		addSet("owner_id", newOwner)
	}
	if len(sets) == 0 {
		writeError(w, http.StatusBadRequest, "nothing_to_update", "değişiklik yok")
		return
	}

	q := "UPDATE guilds SET " + strings.Join(sets, ", ") + " WHERE id = $1"
	if _, err := h.Pool.Exec(r.Context(), q, args...); err != nil {
		h.logger.Error("guild update", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "güncellenmedi")
		return
	}
	g, _ := h.Guilds.ByID(r.Context(), guildID)
	h.Events.ToGuild(r.Context(), guildID, "GUILD_UPDATE", map[string]any{"guild": g})
	h.logAudit(r.Context(), guildID, uid, nil, "guild_update", "", req)
	writeJSON(w, http.StatusOK, g)
}

// === CHANNEL UPDATE ===

type updateChannelReq struct {
	Name         *string `json:"name,omitempty"`
	Topic        *string `json:"topic,omitempty"`
	Position     *int32  `json:"position,omitempty"`
	NSFW         *bool   `json:"nsfw,omitempty"`
	RateLimitSec *int32  `json:"rate_limit_sec,omitempty"`
	AutoArchiveMinutes *int32 `json:"auto_archive_minutes,omitempty"`
	ParentID     *string `json:"parent_id,omitempty"`
	Bitrate      *int32  `json:"bitrate,omitempty"`
	UserLimit    *int32  `json:"user_limit,omitempty"`
}

func (h *Handler) UpdateChannel(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID == nil {
		// Grup DM: yalnızca isim değiştirilebilir, sahip veya katılımcı yapabilir (Discord davranışı)
		if ch.Type != "group_dm" {
			writeError(w, http.StatusBadRequest, "invalid", "DM kanalı güncellenemez")
			return
		}
		if ok, _ := h.DMs.IsParticipant(r.Context(), ch.ID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "bu grubun üyesi değilsin")
			return
		}
		var req updateChannelReq
		if err := readJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
		if req.Name == nil {
			writeError(w, http.StatusBadRequest, "invalid", "grup DM'de yalnızca isim değiştirilebilir")
			return
		}
		n := strings.TrimSpace(*req.Name)
		if n == "" || len(n) > 100 {
			writeError(w, http.StatusBadRequest, "invalid_name", "1-100 karakter")
			return
		}
		if _, err := h.Pool.Exec(r.Context(), `UPDATE channels SET name = $2 WHERE id = $1`, ch.ID, n); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "güncellenemedi")
			return
		}
		ch.Name = n
		// Tüm katılımcılara bildir (DM sidebar adını günceller)
		if rows, err := h.Pool.Query(r.Context(), `SELECT user_id FROM dm_participants WHERE channel_id = $1`, ch.ID); err == nil {
			defer rows.Close()
			for rows.Next() {
				var pid int64
				if rows.Scan(&pid) == nil {
					h.Events.ToUser(r.Context(), pid, "CHANNEL_UPDATE", map[string]any{
						"channel_id": strconv.FormatInt(ch.ID, 10),
						"name":       n,
					})
				}
			}
		}
		writeJSON(w, http.StatusOK, ch)
		return
	}
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageChannels, w) {
		return
	}
	var req updateChannelReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	sets := []string{}
	args := []any{channelID}
	addSet := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+itoa(len(args)))
	}
	if req.Name != nil {
		n := strings.TrimSpace(*req.Name)
		if n == "" || len(n) > 100 {
			writeError(w, http.StatusBadRequest, "invalid_name", "1-100 karakter")
			return
		}
		addSet("name", n)
	}
	if req.Topic != nil {
		addSet("topic", *req.Topic)
	}
	if req.Position != nil {
		addSet("position", *req.Position)
	}
	if req.NSFW != nil {
		addSet("nsfw", *req.NSFW)
	}
	if req.RateLimitSec != nil {
		val := *req.RateLimitSec
		if val < 0 || val > 21600 {
			writeError(w, http.StatusBadRequest, "invalid_rate", "0-21600 sn")
			return
		}
		addSet("rate_limit_sec", val)
	}
	if req.AutoArchiveMinutes != nil {
		addSet("auto_archive_minutes", *req.AutoArchiveMinutes)
	}
	if req.Bitrate != nil {
		addSet("bitrate", *req.Bitrate)
	}
	if req.UserLimit != nil {
		addSet("user_limit", *req.UserLimit)
	}
	if req.ParentID != nil {
		if *req.ParentID == "" {
			addSet("parent_id", nil)
		} else {
			pid, err := strconv.ParseInt(*req.ParentID, 10, 64)
			if err != nil {
				writeError(w, http.StatusBadRequest, "bad_request", "parent_id parse")
				return
			}
			addSet("parent_id", pid)
		}
	}
	if len(sets) == 0 {
		writeError(w, http.StatusBadRequest, "nothing_to_update", "değişiklik yok")
		return
	}

	q := "UPDATE channels SET " + strings.Join(sets, ", ") + " WHERE id = $1"
	if _, err := h.Pool.Exec(r.Context(), q, args...); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "güncellenmedi")
		return
	}
	updated, _ := h.Channels.ByID(r.Context(), channelID)
	h.Events.ToGuild(r.Context(), *ch.GuildID, "CHANNEL_UPDATE", map[string]any{"channel": updated})
	h.logAudit(r.Context(), *ch.GuildID, uid, &channelID, "channel_update", "", req)
	writeJSON(w, http.StatusOK, updated)
}

// === USER ME UPDATE (profil) ===

type updateMeReq struct {
	DisplayName *string `json:"display_name,omitempty"`
	Bio         *string `json:"bio,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	BannerURL   *string `json:"banner_url,omitempty"`
	AvatarColor *string `json:"avatar_color,omitempty"`
	Pronouns    *string `json:"pronouns,omitempty"`
	AccentColor *string `json:"accent_color,omitempty"`
	AvatarDecoration *string `json:"avatar_decoration,omitempty"`
}

func (h *Handler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req updateMeReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	sets := []string{}
	args := []any{uid}
	addSet := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+itoa(len(args)))
	}
	if req.DisplayName != nil {
		n := strings.TrimSpace(*req.DisplayName)
		if n == "" || len(n) > 100 {
			writeError(w, http.StatusBadRequest, "invalid_name", "1-100 karakter")
			return
		}
		addSet("display_name", n)
	}
	if req.Bio != nil {
		if len(*req.Bio) > 500 {
			writeError(w, http.StatusBadRequest, "invalid_bio", "max 500 karakter")
			return
		}
		addSet("bio", *req.Bio)
	}
	if req.AvatarURL != nil {
		addSet("avatar_url", *req.AvatarURL)
	}
	if req.BannerURL != nil {
		addSet("banner_url", *req.BannerURL)
	}
	if req.Pronouns != nil {
		addSet("pronouns", strings.TrimSpace(*req.Pronouns))
	}
	if req.AccentColor != nil {
		addSet("accent_color", *req.AccentColor)
	}
	if req.AvatarDecoration != nil {
		d := strings.TrimSpace(*req.AvatarDecoration)
		if d == "" {
			addSet("avatar_decoration", nil)
		} else {
			addSet("avatar_decoration", d)
		}
	}
	if req.AvatarColor != nil {
		addSet("avatar_color", *req.AvatarColor)
	}
	if len(sets) == 0 {
		writeError(w, http.StatusBadRequest, "nothing_to_update", "değişiklik yok")
		return
	}
	q := "UPDATE users SET " + strings.Join(sets, ", ") + " WHERE id = $1"
	if _, err := h.Pool.Exec(r.Context(), q, args...); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "güncellenmedi")
		return
	}
	u, err := h.Users.ByID(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	// Tüm kullanıcının üyesi olduğu sunuculara USER_UPDATE yay
	rows, err := h.Pool.Query(r.Context(), `SELECT guild_id FROM guild_members WHERE user_id = $1`, uid)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var gid int64
			if err := rows.Scan(&gid); err == nil {
				h.Events.ToGuild(r.Context(), gid, "USER_UPDATE", map[string]any{"user": u})
			}
		}
	}
	writeJSON(w, http.StatusOK, u)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf []byte
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	return string(buf)
}

var _ = errors.New
var _ = repo.User{}
