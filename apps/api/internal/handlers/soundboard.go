package handlers

import (
	"net/http"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

type soundView struct {
	ID         string    `json:"id"`
	GuildID    string    `json:"guild_id"`
	Name       string    `json:"name"`
	Emoji      *string   `json:"emoji,omitempty"`
	FileURL    string    `json:"file_url"`
	Volume     float32   `json:"volume"`
	UploaderID string    `json:"uploader_id"`
	CreatedAt  time.Time `json:"created_at"`
}

type createSoundReq struct {
	Name    string  `json:"name"`
	Emoji   string  `json:"emoji,omitempty"`
	FileURL string  `json:"file_url"`
	Volume  float32 `json:"volume,omitempty"`
}

// GET /api/v1/guilds/:id/sounds
func (h *Handler) ListSounds(w http.ResponseWriter, r *http.Request) {
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
        SELECT id::text, guild_id::text, name, emoji, file_url, volume, uploader_id::text, created_at
        FROM guild_sounds WHERE guild_id = $1 ORDER BY created_at DESC
    `, guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer rows.Close()
	out := []soundView{}
	for rows.Next() {
		var s soundView
		if err := rows.Scan(&s.ID, &s.GuildID, &s.Name, &s.Emoji, &s.FileURL, &s.Volume, &s.UploaderID, &s.CreatedAt); err != nil {
			continue
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /api/v1/guilds/:id/sounds
func (h *Handler) CreateSound(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	// Soundboard yönetimi ManageEmojis iznine bağlı (Discord paritesi)
	if !h.requirePerm(r, guildID, uid, perms.ManageEmojis, w) {
		return
	}
	var req createSoundReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Name == "" || len(req.Name) > 32 || req.FileURL == "" {
		writeError(w, http.StatusBadRequest, "invalid", "ad 1-32 karakter, file_url zorunlu")
		return
	}
	if req.Volume == 0 {
		req.Volume = 1.0
	}
	if req.Volume < 0 || req.Volume > 1 {
		writeError(w, http.StatusBadRequest, "invalid_volume", "0.0-1.0")
		return
	}
	var emojiPtr *string
	if req.Emoji != "" {
		emojiPtr = &req.Emoji
	}
	id := h.IDs.Next()
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO guild_sounds (id, guild_id, name, emoji, file_url, volume, uploader_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, id, guildID, req.Name, emojiPtr, req.FileURL, req.Volume, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	v := soundView{
		ID: int64ToStr(id), GuildID: int64ToStr(guildID),
		Name: req.Name, Emoji: emojiPtr, FileURL: req.FileURL, Volume: req.Volume,
		UploaderID: int64ToStr(uid), CreatedAt: time.Now(),
	}
	h.Events.ToGuild(r.Context(), guildID, "SOUNDBOARD_SOUND_CREATE", map[string]any{"sound": v})
	writeJSON(w, http.StatusCreated, v)
}

// DELETE /api/v1/sounds/:id
func (h *Handler) DeleteSound(w http.ResponseWriter, r *http.Request) {
	soundID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	var guildID int64
	if err := h.Pool.QueryRow(r.Context(), `SELECT guild_id FROM guild_sounds WHERE id = $1`, soundID).Scan(&guildID); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "ses yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageEmojis, w) {
		return
	}
	_, _ = h.Pool.Exec(r.Context(), `DELETE FROM guild_sounds WHERE id = $1`, soundID)
	h.Events.ToGuild(r.Context(), guildID, "SOUNDBOARD_SOUND_DELETE", map[string]any{"sound_id": int64ToStr(soundID)})
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/sounds/:id/play  — kanaldaki herkese SOUNDBOARD_PLAY event yayar
func (h *Handler) PlaySound(w http.ResponseWriter, r *http.Request) {
	soundID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	var body struct {
		ChannelID string `json:"channel_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	channelID, err := parseInt64(body.ChannelID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel_id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil || ch.GuildID == nil || (ch.Type != "voice" && ch.Type != "stage") {
		writeError(w, http.StatusBadRequest, "not_voice", "ses veya sahne kanalı olmalı")
		return
	}
	if ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	var s soundView
	err = h.Pool.QueryRow(r.Context(), `
        SELECT id::text, guild_id::text, name, emoji, file_url, volume, uploader_id::text, created_at
        FROM guild_sounds WHERE id = $1
    `, soundID).Scan(&s.ID, &s.GuildID, &s.Name, &s.Emoji, &s.FileURL, &s.Volume, &s.UploaderID, &s.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "ses yok")
		return
	}
	h.Events.ToGuild(r.Context(), *ch.GuildID, "SOUNDBOARD_PLAY", map[string]any{
		"channel_id": int64ToStr(channelID),
		"user_id":    int64ToStr(uid),
		"sound":      s,
	})
	w.WriteHeader(http.StatusNoContent)
}
