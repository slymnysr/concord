package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/repo"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

type createInviteReq struct {
	MaxUses      int32 `json:"max_uses,omitempty"`
	ExpiresInSec int64 `json:"expires_in_sec,omitempty"`
}

type inviteChannelBrief struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type invitePreview struct {
	Code        string              `json:"code"`
	Guild       *repo.Guild         `json:"guild"`
	Inviter     *repo.User          `json:"inviter"`
	Channel     *inviteChannelBrief `json:"channel,omitempty"`
	MemberCount int64               `json:"member_count"`
	OnlineCount int64               `json:"online_count"`
	Uses        int32               `json:"uses"`
	MaxUses     *int32              `json:"max_uses,omitempty"`
	ExpiresAt   *time.Time          `json:"expires_at,omitempty"`
}

func (h *Handler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "guild id geçersiz")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ok, _ := h.Guilds.IsMember(r.Context(), guildID, uid)
	if !ok {
		writeError(w, http.StatusForbidden, "forbidden", "sunucu üyesi değilsin")
		return
	}

	var req createInviteReq
	_ = readJSON(r, &req) // body opsiyonel

	inv := &repo.Invite{
		Code:      repo.GenerateInviteCode(),
		GuildID:   guildID,
		InviterID: uid,
	}
	if req.MaxUses > 0 {
		inv.MaxUses = &req.MaxUses
	}
	if req.ExpiresInSec > 0 {
		t := time.Now().Add(time.Duration(req.ExpiresInSec) * time.Second)
		inv.ExpiresAt = &t
	}
	if err := h.Invites.Create(r.Context(), inv); err != nil {
		h.logger.Error("invite create", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "davet oluşturulamadı")
		return
	}
	writeJSON(w, http.StatusCreated, inv)
}

// vanityGuild — kodu guilds.vanity_url_code ile çözer (özel davet bağlantısı, süresiz/sınırsız).
func (h *Handler) vanityGuild(ctx context.Context, code string) (guildID, ownerID int64, ok bool) {
	if code == "" {
		return 0, 0, false
	}
	err := h.Pool.QueryRow(ctx,
		`SELECT id, owner_id FROM guilds WHERE vanity_url_code = $1`, code).Scan(&guildID, &ownerID)
	return guildID, ownerID, err == nil
}

func (h *Handler) GetInvite(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	inv, err := h.Invites.ByCode(r.Context(), code)
	if err != nil {
		// Normal davet değil — vanity URL olabilir (süresiz, sınırsız sentetik davet)
		if gid, owner, ok := h.vanityGuild(r.Context(), code); ok {
			inv = &repo.Invite{Code: code, GuildID: gid, InviterID: owner}
		} else {
			writeError(w, http.StatusNotFound, "not_found", "davet bulunamadı")
			return
		}
	}
	guild, _ := h.Guilds.ByID(r.Context(), inv.GuildID)
	inviter, _ := h.Users.ByID(r.Context(), inv.InviterID)
	// üye sayısı
	var memberCount int64
	_ = h.Pool.QueryRow(r.Context(), `SELECT count(*) FROM guild_members WHERE guild_id = $1`, inv.GuildID).Scan(&memberCount)
	// çevrimiçi üye sayısı (kullanıcı durumu offline değil)
	var onlineCount int64
	_ = h.Pool.QueryRow(r.Context(), `
		SELECT count(*) FROM guild_members gm JOIN users u ON u.id = gm.user_id
		WHERE gm.guild_id = $1 AND u.status IS NOT NULL AND u.status <> 'offline'
	`, inv.GuildID).Scan(&onlineCount)
	// davet kartında gösterilecek varsayılan kanal (ilk metin kanalı)
	var channel *inviteChannelBrief
	{
		var cid int64
		var cname, ctype string
		err := h.Pool.QueryRow(r.Context(), `
			SELECT id, name, type::text FROM channels
			WHERE guild_id = $1 AND type = 'text'
			ORDER BY position ASC, id ASC LIMIT 1
		`, inv.GuildID).Scan(&cid, &cname, &ctype)
		if err == nil {
			channel = &inviteChannelBrief{ID: strconv.FormatInt(cid, 10), Name: cname, Type: ctype}
		}
	}

	writeJSON(w, http.StatusOK, &invitePreview{
		Code:        inv.Code,
		Guild:       guild,
		Inviter:     inviter,
		Channel:     channel,
		MemberCount: memberCount,
		OnlineCount: onlineCount,
		Uses:        inv.Uses,
		MaxUses:     inv.MaxUses,
		ExpiresAt:   inv.ExpiresAt,
	})
}

func (h *Handler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	uid := middleware.UserIDFrom(r.Context())
	guildID, err := h.Invites.AcceptAndJoin(r.Context(), code, uid)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			// Vanity URL ile katılım (normal davet kaydı yok)
			if gid, _, ok := h.vanityGuild(r.Context(), code); ok {
				if banned, _ := h.Moderation.IsBanned(r.Context(), gid, uid); banned {
					writeError(w, http.StatusForbidden, "banned", "bu sunucudan banlandın")
					return
				}
				if _, err := h.Pool.Exec(r.Context(),
					`INSERT INTO guild_members (guild_id, user_id) VALUES ($1, $2) ON CONFLICT (guild_id, user_id) DO NOTHING`,
					gid, uid); err != nil {
					writeError(w, http.StatusInternalServerError, "internal", "katılınamadı")
					return
				}
				guild, _ := h.Guilds.ByID(r.Context(), gid)
				user, _ := h.Users.ByID(r.Context(), uid)
				h.applyAutoRole(r.Context(), guild, uid)
				h.postJoinSystemMessage(r.Context(), guild, uid)
				h.Events.ToGuild(r.Context(), gid, "GUILD_MEMBER_ADD", map[string]any{"user": user, "guild_id": gid})
				writeJSON(w, http.StatusOK, guild)
				return
			}
			writeError(w, http.StatusNotFound, "not_found", "davet bulunamadı")
			return
		}
		switch err.Error() {
		case "invite_expired":
			writeError(w, http.StatusGone, "expired", "davet süresi dolmuş")
		case "invite_exhausted":
			writeError(w, http.StatusGone, "exhausted", "davet kullanım limiti dolmuş")
		case "banned":
			writeError(w, http.StatusForbidden, "banned", "bu sunucudan banlandın")
		default:
			h.logger.Error("accept invite", zap.Error(err))
			writeError(w, http.StatusInternalServerError, "internal", "katılma başarısız")
		}
		return
	}
	guild, _ := h.Guilds.ByID(r.Context(), guildID)
	user, _ := h.Users.ByID(r.Context(), uid)
	h.applyAutoRole(r.Context(), guild, uid)
	h.postJoinSystemMessage(r.Context(), guild, uid)
	h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_ADD", map[string]any{
		"user":     user,
		"guild_id": guildID,
	})
	writeJSON(w, http.StatusOK, guild)
}

// postJoinSystemMessage — system_channel_id ayarlıysa "X sunucuya katıldı" sistem mesajı bırakır.
// Hata katılımı bloklamaz.
func (h *Handler) postJoinSystemMessage(ctx context.Context, guild *repo.Guild, userID int64) {
	if guild == nil || guild.SystemChannelID == nil {
		return
	}
	user, err := h.Users.ByID(ctx, userID)
	if err != nil {
		return
	}
	m := &repo.Message{
		ID:        h.IDs.Next(),
		ChannelID: *guild.SystemChannelID,
		AuthorID:  userID,
		Content:   user.DisplayName + " sunucuya katıldı 👋",
		System:    true,
		CreatedAt: time.Now(),
	}
	if h.Messages.Create(ctx, m) != nil {
		return
	}
	if h.Events != nil {
		h.Events.ToGuild(ctx, guild.ID, "MESSAGE_CREATE", map[string]any{
			"message":    m,
			"channel_id": strconv.FormatInt(*guild.SystemChannelID, 10),
		})
	}
}

// applyAutoRole — sunucunun auto_role_id'si tanımlıysa yeni katılan üyeye otomatik rol atar.
// Hata durumunda sessizce geçilir: katılma işlemini bloklamamalı.
func (h *Handler) applyAutoRole(ctx context.Context, guild *repo.Guild, userID int64) {
	if guild == nil || guild.AutoRoleID == nil {
		return
	}
	if err := h.Roles.AssignToMember(ctx, guild.ID, userID, *guild.AutoRoleID); err == nil {
		h.Events.ToGuild(ctx, guild.ID, "GUILD_MEMBER_UPDATE", map[string]any{
			"user_id":    userID,
			"role_added": *guild.AutoRoleID,
		})
	}
}

func (h *Handler) ListGuildInvites(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ok, _ := h.Guilds.IsMember(r.Context(), guildID, uid)
	if !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	list, err := h.Invites.ForGuild(r.Context(), guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "davetler alınamadı")
		return
	}
	if list == nil {
		list = []repo.Invite{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) DeleteInvite(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	uid := middleware.UserIDFrom(r.Context())
	if err := h.Invites.Delete(r.Context(), code, uid); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "davet yok veya yetkin yok")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "davet silinemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListGuildMembers(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ok, _ := h.Guilds.IsMember(r.Context(), guildID, uid)
	if !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	list, err := h.Members.ForGuild(r.Context(), guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "üyeler alınamadı")
		return
	}
	if list == nil {
		list = []repo.Member{}
	}
	writeJSON(w, http.StatusOK, list)
}
