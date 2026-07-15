package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/repo"
	"go.uber.org/zap"
)

type friendReq struct {
	Username string `json:"username,omitempty"`
	UserID   string `json:"user_id,omitempty"`
}

type reportReq struct {
	Reason string `json:"reason,omitempty"`
}

type noteReq struct {
	Note string `json:"note"`
}

// POST /users/me/verify-email — e-postayı doğrulanmış işaretle (MVP: tek tıkla)
// GET /users/{userID}/note — bu kullanıcı hakkında tuttuğun özel not
func (h *Handler) GetUserNote(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	targetID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id")
		return
	}
	var note string
	_ = h.Pool.QueryRow(r.Context(),
		`SELECT note FROM user_notes WHERE owner_id = $1 AND target_id = $2`, uid, targetID).Scan(&note)
	writeJSON(w, http.StatusOK, map[string]string{"note": note})
}

// PUT /users/{userID}/note — notu kaydet (boş = sil)
func (h *Handler) SetUserNote(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	targetID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id")
		return
	}
	var req noteReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	note := strings.TrimSpace(req.Note)
	if note == "" {
		_, _ = h.Pool.Exec(r.Context(), `DELETE FROM user_notes WHERE owner_id = $1 AND target_id = $2`, uid, targetID)
	} else {
		_, err = h.Pool.Exec(r.Context(), `
            INSERT INTO user_notes (owner_id, target_id, note) VALUES ($1, $2, $3)
            ON CONFLICT (owner_id, target_id) DO UPDATE SET note = EXCLUDED.note, updated_at = NOW()
        `, uid, targetID, note)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /users/{userID}/report — kullanıcı profilini moderasyona bildir
func (h *Handler) ReportUser(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	targetID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id")
		return
	}
	var req reportReq
	_ = readJSON(r, &req)
	_, err = h.Pool.Exec(r.Context(),
		`INSERT INTO user_reports (id, reporter_id, target_id, reason) VALUES ($1, $2, $3, $4)`,
		h.IDs.Next(), uid, targetID, strings.TrimSpace(req.Reason))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "bildirilemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SendFriendRequest(w http.ResponseWriter, r *http.Request) {
	var req friendReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	uid := middleware.UserIDFrom(r.Context())

	var target int64
	if req.UserID != "" {
		v, err := strconv.ParseInt(req.UserID, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "user_id parse")
			return
		}
		target = v
	} else if req.Username != "" {
		// kullanıcı adından çöz
		var id int64
		err := h.Pool.QueryRow(r.Context(),
			`SELECT id FROM users WHERE lower(username) = lower($1)`,
			strings.TrimSpace(req.Username),
		).Scan(&id)
		if err != nil {
			writeError(w, http.StatusNotFound, "not_found", "kullanıcı yok")
			return
		}
		target = id
	} else {
		writeError(w, http.StatusBadRequest, "bad_request", "username veya user_id gerekli")
		return
	}

	if target == uid {
		writeError(w, http.StatusBadRequest, "self", "kendine istek atamazsın")
		return
	}
	if err := h.Friends.SendRequest(r.Context(), uid, target); err != nil {
		h.logger.Error("friend send", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "istek gönderilemedi")
		return
	}
	// Hedef kullanıcıya friend_request bildirimi
	_ = h.Notifications.Create(r.Context(), &repo.Notification{
		ID:      h.IDs.Next(),
		UserID:  target,
		Type:    "friend_request",
		ActorID: &uid,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) AcceptFriend(w http.ResponseWriter, r *http.Request) {
	otherID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if err := h.Friends.Accept(r.Context(), uid, otherID); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "istek yok")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "kabul edilemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// BlockUser — kullanıcıyı engelle (mevcut friendships state'i 'blocked' yap)
func (h *Handler) BlockUser(w http.ResponseWriter, r *http.Request) {
	otherID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if uid == otherID {
		writeError(w, http.StatusBadRequest, "self", "kendini engelleyemezsin")
		return
	}
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO friendships (user_a_id, user_b_id, status, requested_by)
        VALUES (LEAST($1::bigint, $2::bigint), GREATEST($1::bigint, $2::bigint), 'blocked', $1::bigint)
        ON CONFLICT (user_a_id, user_b_id) DO UPDATE
        SET status = 'blocked', requested_by = EXCLUDED.requested_by, updated_at = NOW()
    `, uid, otherID)
	if err != nil {
		h.logger.Error("block", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "engellenemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UnblockUser — engeli kaldır (friendships satırını sil)
func (h *Handler) UnblockUser(w http.ResponseWriter, r *http.Request) {
	otherID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if _, err := h.Pool.Exec(r.Context(), `
        DELETE FROM friendships
        WHERE user_a_id = LEAST($1::bigint, $2::bigint) AND user_b_id = GREATEST($1::bigint, $2::bigint)
          AND status = 'blocked' AND requested_by = $1::bigint
    `, uid, otherID); err != nil {
		h.logger.Error("unblock", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "engel kaldırılamadı")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RemoveFriend(w http.ResponseWriter, r *http.Request) {
	otherID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if err := h.Friends.Remove(r.Context(), uid, otherID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinmedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListFriends(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	list, err := h.Friends.ListForUser(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	if list == nil {
		list = []repo.FriendView{}
	}
	writeJSON(w, http.StatusOK, list)
}
