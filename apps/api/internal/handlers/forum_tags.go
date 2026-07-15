package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

type forumTagView struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Emoji    *string `json:"emoji,omitempty"`
	Position int32   `json:"position"`
}

// GET /api/v1/channels/{channelID}/forum-tags — forum kanalının kullanılabilir etiketleri.
func (h *Handler) ListForumTags(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	rows, err := h.Pool.Query(r.Context(),
		`SELECT id::text, name, emoji, position FROM forum_tags WHERE channel_id = $1 ORDER BY position, id`, channelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "etiketler alınamadı")
		return
	}
	defer rows.Close()
	out := []forumTagView{}
	for rows.Next() {
		var t forumTagView
		if err := rows.Scan(&t.ID, &t.Name, &t.Emoji, &t.Position); err == nil {
			out = append(out, t)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

type createForumTagReq struct {
	Name  string  `json:"name"`
	Emoji *string `json:"emoji,omitempty"`
}

// POST /api/v1/channels/{channelID}/forum-tags — etiket oluştur (ManageChannels).
func (h *Handler) CreateForumTag(w http.ResponseWriter, r *http.Request) {
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
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageChannels, w) {
		return
	}
	var req createForumTagReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 40 {
		writeError(w, http.StatusBadRequest, "invalid_name", "etiket adı 1-40 karakter")
		return
	}
	// En fazla 20 etiket
	var count int
	_ = h.Pool.QueryRow(r.Context(), `SELECT count(*) FROM forum_tags WHERE channel_id = $1`, channelID).Scan(&count)
	if count >= 20 {
		writeError(w, http.StatusBadRequest, "too_many_tags", "forum başına en fazla 20 etiket")
		return
	}
	id := h.IDs.Next()
	if _, err := h.Pool.Exec(r.Context(),
		`INSERT INTO forum_tags (id, channel_id, name, emoji, position) VALUES ($1, $2, $3, $4, $5)`,
		id, channelID, req.Name, req.Emoji, count); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "etiket eklenemedi")
		return
	}
	h.Events.ToGuild(r.Context(), *ch.GuildID, "CHANNEL_UPDATE", map[string]any{"channel_id": strconv.FormatInt(channelID, 10)})
	writeJSON(w, http.StatusCreated, forumTagView{ID: strconv.FormatInt(id, 10), Name: req.Name, Emoji: req.Emoji, Position: int32(count)})
}

// DELETE /api/v1/forum-tags/{tagID} — etiket sil (ManageChannels).
func (h *Handler) DeleteForumTag(w http.ResponseWriter, r *http.Request) {
	tagID, err := strconv.ParseInt(chi.URLParam(r, "tagID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "tag id")
		return
	}
	// Etiketin kanal+guild'ini bul
	var channelID int64
	if err := h.Pool.QueryRow(r.Context(), `SELECT channel_id FROM forum_tags WHERE id = $1`, tagID).Scan(&channelID); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "etiket yok")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil || ch.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageChannels, w) {
		return
	}
	if _, err := h.Pool.Exec(r.Context(), `DELETE FROM forum_tags WHERE id = $1`, tagID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinemedi")
		return
	}
	h.Events.ToGuild(r.Context(), *ch.GuildID, "CHANNEL_UPDATE", map[string]any{"channel_id": strconv.FormatInt(channelID, 10)})
	w.WriteHeader(http.StatusNoContent)
}
