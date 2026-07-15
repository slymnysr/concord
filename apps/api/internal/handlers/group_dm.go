package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/concord/api/internal/middleware"
)

type createGroupDMReq struct {
	UserIDs []string `json:"user_ids"`
	Name    string   `json:"name,omitempty"`
}

func (h *Handler) CreateGroupDM(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req createGroupDMReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if len(req.UserIDs) < 1 || len(req.UserIDs) > 9 {
		writeError(w, http.StatusBadRequest, "invalid_users", "1-9 kullanıcı gerekli (toplam 2-10)")
		return
	}
	others := make(map[int64]bool)
	for _, s := range req.UserIDs {
		id, err := strconv.ParseInt(s, 10, 64)
		if err != nil || id == uid {
			continue
		}
		others[id] = true
	}
	if len(others) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_users", "en az 1 farklı kullanıcı gerekli")
		return
	}

	channelID := h.IDs.Next()
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "Grup Sohbeti"
	}

	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "tx")
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), `
        INSERT INTO channels (id, type, name, position, owner_id)
        VALUES ($1, 'group_dm', $2, 0, $3)
    `, channelID, name, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kanal: "+err.Error())
		return
	}
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO dm_participants (channel_id, user_id) VALUES ($1, $2)`, channelID, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "katılımcı (kurucu)")
		return
	}
	for oid := range others {
		if _, err := tx.Exec(r.Context(),
			`INSERT INTO dm_participants (channel_id, user_id) VALUES ($1, $2)`, channelID, oid); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "katılımcı: "+err.Error())
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "commit")
		return
	}

	for oid := range others {
		h.Events.ToUser(r.Context(), oid, "CHANNEL_CREATE", map[string]any{
			"channel_id": strconv.FormatInt(channelID, 10),
			"type":       "group_dm",
			"name":       name,
		})
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"channel_id": strconv.FormatInt(channelID, 10),
		"name":       name,
	})
}

func (h *Handler) AddGroupDMRecipient(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	var chType string
	var ownerID *int64
	err = h.Pool.QueryRow(r.Context(),
		`SELECT type::text, owner_id FROM channels WHERE id = $1`, channelID).Scan(&chType, &ownerID)
	if err != nil || chType != "group_dm" {
		writeError(w, http.StatusNotFound, "not_found", "grup DM yok")
		return
	}
	if ownerID == nil || *ownerID != uid {
		// Sahip değilse en azından katılımcı olmalı (Discord patterni)
		if ok, _ := h.DMs.IsParticipant(r.Context(), channelID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "yetersiz")
			return
		}
	}
	if _, err := h.Pool.Exec(r.Context(),
		`INSERT INTO dm_participants (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		channelID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "eklenmedi")
		return
	}
	h.Events.ToUser(r.Context(), userID, "CHANNEL_CREATE", map[string]any{
		"channel_id": strconv.FormatInt(channelID, 10),
		"type":       "group_dm",
	})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RemoveGroupDMRecipient(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	var chType string
	var ownerID *int64
	err = h.Pool.QueryRow(r.Context(),
		`SELECT type::text, owner_id FROM channels WHERE id = $1`, channelID).Scan(&chType, &ownerID)
	if err != nil || chType != "group_dm" {
		writeError(w, http.StatusNotFound, "not_found", "grup DM yok")
		return
	}
	// Kendini çıkarabilir veya sahip başkasını
	if userID != uid && (ownerID == nil || *ownerID != uid) {
		writeError(w, http.StatusForbidden, "forbidden", "sadece sahibi başkasını çıkarabilir")
		return
	}
	if _, err := h.Pool.Exec(r.Context(),
		`DELETE FROM dm_participants WHERE channel_id = $1 AND user_id = $2`, channelID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinmedi")
		return
	}
	h.Events.ToUser(r.Context(), userID, "CHANNEL_DELETE", map[string]any{
		"channel_id": strconv.FormatInt(channelID, 10),
	})
	w.WriteHeader(http.StatusNoContent)
}
