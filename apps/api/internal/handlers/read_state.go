package handlers

import (
	"net/http"
	"strconv"

	"github.com/concord/api/internal/middleware"
)

type readStateReq struct {
	LastMessageID string `json:"last_message_id"`
}

func (h *Handler) AckChannel(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	var req readStateReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	var lastID *int64
	if req.LastMessageID != "" {
		if id, err := strconv.ParseInt(req.LastMessageID, 10, 64); err == nil {
			lastID = &id
		}
	}
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO read_states (user_id, channel_id, last_message_id, mention_count)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (user_id, channel_id) DO UPDATE
        SET last_message_id = EXCLUDED.last_message_id,
            mention_count = 0,
            last_read_at = NOW()
    `, uid, channelID, lastID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type readStateView struct {
	ChannelID     string  `json:"channel_id"`
	LastMessageID *string `json:"last_message_id,omitempty"`
	MentionCount  int     `json:"mention_count"`
	LastReadAt    string  `json:"last_read_at"`
}

func (h *Handler) ListReadStates(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `
        SELECT channel_id::text, last_message_id::text, mention_count, last_read_at::text
        FROM read_states WHERE user_id = $1
    `, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []readStateView{}
	for rows.Next() {
		var v readStateView
		var lastID *string
		if err := rows.Scan(&v.ChannelID, &lastID, &v.MentionCount, &v.LastReadAt); err == nil {
			v.LastMessageID = lastID
			out = append(out, v)
		}
	}
	writeJSON(w, http.StatusOK, out)
}
