package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

type stickerView struct {
	ID          string    `json:"id"`
	GuildID     string    `json:"guild_id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	Tags        *string   `json:"tags,omitempty"`
	URL         string    `json:"url"`
	Format      string    `json:"format"`
	CreatorID   string    `json:"creator_id"`
	CreatedAt   time.Time `json:"created_at"`
}

type createStickerReq struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Tags        string `json:"tags,omitempty"`
	URL         string `json:"url"`
	Format      string `json:"format,omitempty"`
}

// GET /api/v1/guilds/:id/stickers
func (h *Handler) ListStickers(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.Pool.Query(r.Context(), `
        SELECT id::text, guild_id::text, name, description, tags, url, format, creator_id::text, created_at
        FROM guild_stickers WHERE guild_id = $1 ORDER BY created_at DESC
    `, guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer rows.Close()
	out := []stickerView{}
	for rows.Next() {
		var s stickerView
		if err := rows.Scan(&s.ID, &s.GuildID, &s.Name, &s.Description, &s.Tags, &s.URL, &s.Format, &s.CreatorID, &s.CreatedAt); err == nil {
			out = append(out, s)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /api/v1/guilds/:id/stickers
func (h *Handler) CreateSticker(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageEmojis, w) {
		return
	}
	var req createStickerReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if len(req.Name) < 2 || len(req.Name) > 30 || req.URL == "" {
		writeError(w, http.StatusBadRequest, "invalid", "ad 2-30 karakter + URL zorunlu")
		return
	}
	if req.Format == "" {
		req.Format = "png"
	}
	if req.Format != "png" && req.Format != "apng" && req.Format != "lottie" {
		writeError(w, http.StatusBadRequest, "invalid_format", "png|apng|lottie")
		return
	}
	id := h.IDs.Next()
	var descPtr, tagsPtr *string
	if req.Description != "" {
		descPtr = &req.Description
	}
	if req.Tags != "" {
		tagsPtr = &req.Tags
	}
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO guild_stickers (id, guild_id, name, description, tags, url, format, creator_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, id, guildID, req.Name, descPtr, tagsPtr, req.URL, req.Format, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	v := stickerView{
		ID: int64ToStr(id), GuildID: int64ToStr(guildID),
		Name: req.Name, Description: descPtr, Tags: tagsPtr, URL: req.URL, Format: req.Format,
		CreatorID: int64ToStr(uid), CreatedAt: time.Now(),
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_STICKERS_UPDATE", map[string]any{"sticker": v})
	writeJSON(w, http.StatusCreated, v)
}

// DELETE /api/v1/stickers/:id
func (h *Handler) DeleteSticker(w http.ResponseWriter, r *http.Request) {
	stickerID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	var guildID int64
	if err := h.Pool.QueryRow(r.Context(), `SELECT guild_id FROM guild_stickers WHERE id = $1`, stickerID).Scan(&guildID); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "sticker yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageEmojis, w) {
		return
	}
	_, _ = h.Pool.Exec(r.Context(), `DELETE FROM guild_stickers WHERE id = $1`, stickerID)
	h.Events.ToGuild(r.Context(), guildID, "GUILD_STICKERS_UPDATE", map[string]any{"deleted": int64ToStr(stickerID)})
	w.WriteHeader(http.StatusNoContent)
}

// === Push Notifications ===

type pushSubReq struct {
	Endpoint string `json:"endpoint"`
	P256DH   string `json:"p256dh"`
	Auth     string `json:"auth"`
	// "web" (VAPID şifreli Web Push) veya "expo" (Expo Push Service → FCM/APNs).
	// Boşsa p256dh/auth varlığına bakılır — eski web istemcileri platform göndermiyor.
	Platform string `json:"platform"`
}

// PUT /api/v1/users/me/push-subscriptions
func (h *Handler) SubscribePush(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req pushSubReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "missing", "endpoint gerekli")
		return
	}
	// Platform ayrımı: Web Push payload'ı p256dh/auth ile ŞİFRELENİR (protokol gereği
	// zorunlu); Expo token'ının böyle bir anahtarı YOKTUR. Üçünü birden zorunlu tutmak
	// mobil kaydı her seferinde 400'lüyordu → hiçbir cihaz kayıtlı olmuyordu.
	platform := req.Platform
	if platform == "" {
		platform = "web"
		if req.P256DH == "" && req.Auth == "" {
			platform = "expo"
		}
	}
	switch platform {
	case "web":
		if req.P256DH == "" || req.Auth == "" {
			writeError(w, http.StatusBadRequest, "missing", "web push için p256dh + auth gerekli")
			return
		}
	case "expo":
		if !strings.HasPrefix(req.Endpoint, "ExponentPushToken[") && !strings.HasPrefix(req.Endpoint, "ExpoPushToken[") {
			writeError(w, http.StatusBadRequest, "bad_token", "geçersiz Expo push token'ı")
			return
		}
	default:
		writeError(w, http.StatusBadRequest, "bad_platform", "platform 'web' veya 'expo' olmalı")
		return
	}

	var p256, auth *string
	if req.P256DH != "" {
		p256 = &req.P256DH
	}
	if req.Auth != "" {
		auth = &req.Auth
	}
	_, err := h.Pool.Exec(r.Context(), `
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, platform)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, endpoint) DO UPDATE
        SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent,
            platform = EXCLUDED.platform, failed_at = NULL
    `, uid, req.Endpoint, p256, auth, r.UserAgent(), platform)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/users/me/push-subscriptions
func (h *Handler) UnsubscribePush(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	endpoint := r.URL.Query().Get("endpoint")
	if endpoint == "" {
		_, _ = h.Pool.Exec(r.Context(), `DELETE FROM push_subscriptions WHERE user_id = $1`, uid)
	} else {
		_, _ = h.Pool.Exec(r.Context(), `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, uid, endpoint)
	}
	w.WriteHeader(http.StatusNoContent)
}
