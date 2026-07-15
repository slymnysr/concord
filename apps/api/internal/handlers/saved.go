package handlers

import (
	"net/http"

	"github.com/concord/api/internal/middleware"
)

// PUT /messages/{messageID}/save
func (h *Handler) SaveMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ok, _, _ := h.canReadMessage(r, messageID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "bu mesaja erişimin yok")
		return
	}
	if _, err := h.Pool.Exec(r.Context(), `
        INSERT INTO saved_messages (user_id, message_id) VALUES ($1, $2)
        ON CONFLICT (user_id, message_id) DO NOTHING
    `, uid, messageID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /messages/{messageID}/save
func (h *Handler) UnsaveMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if _, err := h.Pool.Exec(r.Context(),
		`DELETE FROM saved_messages WHERE user_id = $1 AND message_id = $2`, uid, messageID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type savedMessageView struct {
	MessageID    string  `json:"message_id"`
	ChannelID    string  `json:"channel_id"`
	AuthorID     string  `json:"author_id"`
	Content      string  `json:"content"`
	AuthorName   string  `json:"author_name"`
	AuthorColor  string  `json:"author_color"`
	AuthorAvatar *string `json:"author_avatar,omitempty"`
	GuildID      *string `json:"guild_id,omitempty"`
	ChannelName  *string `json:"channel_name,omitempty"`
	CreatedAt    string  `json:"created_at"`
	SavedAt      string  `json:"saved_at"`
}

// GET /users/me/saved-messages
func (h *Handler) ListSavedMessages(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `
        SELECT m.id::text, m.channel_id::text, m.author_id::text, m.content,
               u.display_name, u.avatar_color, u.avatar_url,
               c.guild_id::text, c.name,
               m.created_at::text, s.saved_at::text
        FROM saved_messages s
        JOIN messages m ON m.id = s.message_id
        JOIN users u ON u.id = m.author_id
        JOIN channels c ON c.id = m.channel_id
        WHERE s.user_id = $1
        ORDER BY s.saved_at DESC
        LIMIT 100
    `, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []savedMessageView{}
	for rows.Next() {
		var v savedMessageView
		var guildID *string
		if err := rows.Scan(&v.MessageID, &v.ChannelID, &v.AuthorID, &v.Content,
			&v.AuthorName, &v.AuthorColor, &v.AuthorAvatar, &guildID, &v.ChannelName,
			&v.CreatedAt, &v.SavedAt); err != nil {
			continue
		}
		v.GuildID = guildID
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, out)
}
