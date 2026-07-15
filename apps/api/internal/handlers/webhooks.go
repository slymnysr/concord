package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
)

type createWebhookReq struct {
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url,omitempty"`
}

type webhookView struct {
	ID        string `json:"id"`
	ChannelID string `json:"channel_id"`
	GuildID   string `json:"guild_id"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url,omitempty"`
	Token     string `json:"token,omitempty"` // sadece create yanıtında dolu
	CreatedAt string `json:"created_at"`
}

func newWebhookToken() (raw, hash string) {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	raw = base64.RawURLEncoding.EncodeToString(b)
	h := sha256.Sum256([]byte(raw))
	hash = hex.EncodeToString(h[:])
	return
}

func (h *Handler) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil || ch.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageWebhooks, w) {
		return
	}
	var req createWebhookReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 80 {
		writeError(w, http.StatusBadRequest, "invalid_name", "1-80 karakter")
		return
	}
	raw, hash := newWebhookToken()
	id := h.IDs.Next()
	if _, err := h.Pool.Exec(r.Context(), `
        INSERT INTO webhooks (id, channel_id, guild_id, creator_id, name, avatar_url, token_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, id, channelID, *ch.GuildID, uid, req.Name, req.AvatarURL, hash); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "oluşturulamadı")
		return
	}
	h.logAudit(r.Context(), *ch.GuildID, uid, &id, "webhook_create", "", map[string]string{"name": req.Name})
	writeJSON(w, http.StatusCreated, webhookView{
		ID:        strconv.FormatInt(id, 10),
		ChannelID: strconv.FormatInt(channelID, 10),
		GuildID:   strconv.FormatInt(*ch.GuildID, 10),
		Name:      req.Name,
		AvatarURL: req.AvatarURL,
		Token:     raw, // sadece bu yanıtta plain dön, sonra hash'i kalır
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *Handler) ListWebhooks(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil || ch.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageWebhooks, w) {
		return
	}
	rows, err := h.Pool.Query(r.Context(), `
        SELECT id::text, channel_id::text, guild_id::text, name, avatar_url, created_at::text
        FROM webhooks WHERE channel_id = $1
    `, channelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []webhookView{}
	for rows.Next() {
		var v webhookView
		var avatar *string
		if err := rows.Scan(&v.ID, &v.ChannelID, &v.GuildID, &v.Name, &avatar, &v.CreatedAt); err == nil {
			if avatar != nil {
				v.AvatarURL = *avatar
			}
			out = append(out, v)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	webhookID, err := parseID(r, "webhookID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	var guildID int64
	err = h.Pool.QueryRow(r.Context(), `SELECT guild_id FROM webhooks WHERE id = $1`, webhookID).Scan(&guildID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "webhook yok")
		return
	}
	if !h.requirePerm(r, guildID, uid, perms.ManageWebhooks, w) {
		return
	}
	if _, err := h.Pool.Exec(r.Context(), `DELETE FROM webhooks WHERE id = $1`, webhookID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinmedi")
		return
	}
	h.logAudit(r.Context(), guildID, uid, &webhookID, "webhook_delete", "", nil)
	w.WriteHeader(http.StatusNoContent)
}

// === Public webhook execute (auth gerekmez, token doğrulanır) ===

type executeWebhookReq struct {
	Content   string            `json:"content"`
	Username  string            `json:"username,omitempty"`
	AvatarURL string            `json:"avatar_url,omitempty"`
	Embeds    []json.RawMessage `json:"embeds,omitempty"`
}

func (h *Handler) ExecuteWebhook(w http.ResponseWriter, r *http.Request) {
	webhookID, err := strconv.ParseInt(chi.URLParam(r, "webhookID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	token := chi.URLParam(r, "token")
	if token == "" {
		writeError(w, http.StatusUnauthorized, "no_token", "token gerekli")
		return
	}
	hash := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(hash[:])

	var channelID, guildID, creatorID int64
	var wname string
	var wavatar *string
	err = h.Pool.QueryRow(r.Context(), `
        SELECT channel_id, guild_id, creator_id, name, avatar_url
        FROM webhooks WHERE id = $1 AND token_hash = $2
    `, webhookID, tokenHash).Scan(&channelID, &guildID, &creatorID, &wname, &wavatar)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_token", "token geçersiz")
		return
	}
	var req executeWebhookReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if (len(req.Content) == 0 && len(req.Embeds) == 0) || len(req.Content) > 4000 {
		writeError(w, http.StatusBadRequest, "invalid_content", "içerik veya embed gerekli (en fazla 4000 karakter)")
		return
	}

	// Webhook adı/avatarı override
	overrideName := req.Username
	if overrideName == "" {
		overrideName = wname
	}
	overrideAvatar := req.AvatarURL
	if overrideAvatar == "" && wavatar != nil {
		overrideAvatar = *wavatar
	}

	m := &repo.Message{
		ID:        h.IDs.Next(),
		ChannelID: channelID,
		AuthorID:  creatorID, // webhook owner
		Content:   req.Content,
		CreatedAt: time.Now(),
	}
	if err := h.Messages.Create(r.Context(), m); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}
	// Zengin embed'ler (renk/alan/footer)
	h.storeRichEmbeds(r.Context(), m.ID, req.Embeds)
	m.Embeds = req.Embeds // realtime/HTTP yanıtında inline dönsün
	// Webhook isim/avatar override'ını kalıcı sakla + mesaja set et
	var avatarArg *string
	if overrideAvatar != "" {
		avatarArg = &overrideAvatar
	}
	_, _ = h.Pool.Exec(r.Context(),
		`INSERT INTO message_webhook (message_id, username, avatar_url, webhook_id) VALUES ($1, $2, $3, $4)`,
		m.ID, overrideName, avatarArg, webhookID)
	m.WebhookUsername = &overrideName
	if overrideAvatar != "" {
		m.WebhookAvatar = &overrideAvatar
	}
	// Publish with override fields
	if h.Events != nil {
		h.Events.ToGuild(r.Context(), guildID, "MESSAGE_CREATE", map[string]any{
			"message":          m,
			"channel_id":       strconv.FormatInt(channelID, 10),
			"webhook_id":       strconv.FormatInt(webhookID, 10),
			"webhook_username": overrideName,
			"webhook_avatar":   overrideAvatar,
		})
	}
	writeJSON(w, http.StatusCreated, m)
}

var _ = errors.New
