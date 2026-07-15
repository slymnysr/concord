package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/concord/api/internal/middleware"
)

type sessionView struct {
	ID        string    `json:"id"`
	UserAgent string    `json:"user_agent"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// GET /api/v1/users/me/sessions — kullanıcının aktif oturumları (cihazlar).
func (h *Handler) ListMySessions(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	tokens, err := h.RefreshTokens.ListActiveForUser(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "oturumlar alınamadı")
		return
	}
	out := make([]sessionView, 0, len(tokens))
	for _, t := range tokens {
		ua := ""
		if t.UserAgent != nil {
			ua = *t.UserAgent
		}
		out = append(out, sessionView{
			ID:        strconv.FormatInt(t.ID, 10),
			UserAgent: ua,
			CreatedAt: t.CreatedAt,
			ExpiresAt: t.ExpiresAt,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// DELETE /api/v1/users/me/sessions/{sessionID} — belirli oturumu sonlandır.
func (h *Handler) RevokeMySession(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	id, err := strconv.ParseInt(chi.URLParam(r, "sessionID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "oturum id geçersiz")
		return
	}
	if err := h.RefreshTokens.RevokeByID(r.Context(), id, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "oturum sonlandırılamadı")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/users/me/sessions?except=<id> — mevcut hariç tüm oturumları sonlandır.
func (h *Handler) RevokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	exceptID, _ := strconv.ParseInt(r.URL.Query().Get("except"), 10, 64)
	if err := h.RefreshTokens.RevokeAllExcept(r.Context(), uid, exceptID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "oturumlar sonlandırılamadı")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
