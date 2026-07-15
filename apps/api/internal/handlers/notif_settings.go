package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/concord/api/internal/middleware"
)

type notifSettingsReq struct {
	NotifLevel       string `json:"notif_level,omitempty"` // 'all' | 'mentions' | 'nothing'
	MuteUntilSec     int64  `json:"mute_until_sec,omitempty"`
	SuppressEveryone *bool  `json:"suppress_everyone,omitempty"`
	SuppressRoles    *bool  `json:"suppress_roles,omitempty"`
}

func validNotifLevel(s string) bool {
	return s == "" || s == "all" || s == "mentions" || s == "nothing"
}

// PUT /api/v1/guilds/:id/notif-settings
func (h *Handler) UpdateGuildNotifSettings(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ok, _ := h.Guilds.IsMember(r.Context(), guildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	var req notifSettingsReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !validNotifLevel(req.NotifLevel) {
		writeError(w, http.StatusBadRequest, "invalid_level", "all|mentions|nothing")
		return
	}
	level := req.NotifLevel
	if level == "" {
		level = "all"
	}
	var muteUntil *time.Time
	if req.MuteUntilSec > 0 {
		t := time.Now().Add(time.Duration(req.MuteUntilSec) * time.Second)
		muteUntil = &t
	}
	suppressEveryone := false
	if req.SuppressEveryone != nil {
		suppressEveryone = *req.SuppressEveryone
	}
	suppressRoles := false
	if req.SuppressRoles != nil {
		suppressRoles = *req.SuppressRoles
	}
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO user_guild_settings (user_id, guild_id, notif_level, muted_until, suppress_everyone, suppress_roles)
        VALUES ($1, $2, $3::notif_level, $4, $5, $6)
        ON CONFLICT (user_id, guild_id) DO UPDATE
        SET notif_level = EXCLUDED.notif_level,
            muted_until = EXCLUDED.muted_until,
            suppress_everyone = EXCLUDED.suppress_everyone,
            suppress_roles = EXCLUDED.suppress_roles
    `, uid, guildID, level, muteUntil, suppressEveryone, suppressRoles)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PUT /api/v1/channels/:id/notif-settings
func (h *Handler) UpdateChannelNotifSettings(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID != nil {
		if ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
			return
		}
	} else if ok, _ := h.DMs.IsParticipant(r.Context(), channelID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "katılımcı değilsin")
		return
	}
	var req notifSettingsReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !validNotifLevel(req.NotifLevel) {
		writeError(w, http.StatusBadRequest, "invalid_level", "all|mentions|nothing")
		return
	}
	var muteUntil *time.Time
	if req.MuteUntilSec > 0 {
		t := time.Now().Add(time.Duration(req.MuteUntilSec) * time.Second)
		muteUntil = &t
	}
	var levelPtr *string
	if req.NotifLevel != "" {
		levelPtr = &req.NotifLevel
	}
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO user_channel_settings (user_id, channel_id, notif_level, muted_until)
        VALUES ($1, $2, $3::notif_level, $4)
        ON CONFLICT (user_id, channel_id) DO UPDATE
        SET notif_level = EXCLUDED.notif_level,
            muted_until = EXCLUDED.muted_until
    `, uid, channelID, levelPtr, muteUntil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/v1/users/me/settings
func (h *Handler) GetMySettings(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	type guildS struct {
		GuildID          string  `json:"guild_id"`
		NotifLevel       string  `json:"notif_level"`
		MutedUntil       *string `json:"muted_until,omitempty"`
		SuppressEveryone bool    `json:"suppress_everyone"`
		SuppressRoles    bool    `json:"suppress_roles"`
	}
	type chanS struct {
		ChannelID  string  `json:"channel_id"`
		NotifLevel *string `json:"notif_level,omitempty"`
		MutedUntil *string `json:"muted_until,omitempty"`
	}
	out := struct {
		Guilds   []guildS `json:"guilds"`
		Channels []chanS  `json:"channels"`
	}{Guilds: []guildS{}, Channels: []chanS{}}

	if rows, err := h.Pool.Query(r.Context(), `
        SELECT guild_id::text, notif_level::text, muted_until::text, suppress_everyone, suppress_roles
        FROM user_guild_settings WHERE user_id = $1
    `, uid); err == nil {
		defer rows.Close()
		for rows.Next() {
			var g guildS
			var muted *string
			if err := rows.Scan(&g.GuildID, &g.NotifLevel, &muted, &g.SuppressEveryone, &g.SuppressRoles); err == nil {
				g.MutedUntil = muted
				out.Guilds = append(out.Guilds, g)
			}
		}
	}
	if rows, err := h.Pool.Query(r.Context(), `
        SELECT channel_id::text, notif_level::text, muted_until::text
        FROM user_channel_settings WHERE user_id = $1
    `, uid); err == nil {
		defer rows.Close()
		for rows.Next() {
			var c chanS
			var muted, level *string
			if err := rows.Scan(&c.ChannelID, &level, &muted); err == nil {
				c.NotifLevel = level
				c.MutedUntil = muted
				out.Channels = append(out.Channels, c)
			}
		}
	}
	writeJSON(w, http.StatusOK, out)
}

var _ = strconv.Itoa
