package handlers

import (
	"net/http"
	"strconv"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/repo"
	"go.uber.org/zap"
)

type openDMReq struct {
	UserID string `json:"user_id"`
}

func (h *Handler) OpenDM(w http.ResponseWriter, r *http.Request) {
	var req openDMReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	otherID, err := strconv.ParseInt(req.UserID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user_id geçersiz")
		return
	}
	me := middleware.UserIDFrom(r.Context())
	if _, err := h.Users.ByID(r.Context(), otherID); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kullanıcı yok")
		return
	}
	// Engelleme: taraflardan biri diğerini engellemişse DM açılamaz (Discord davranışı).
	if otherID != me {
		a, b := me, otherID
		if a > b {
			a, b = b, a
		}
		var blockStatus string
		_ = h.Pool.QueryRow(r.Context(),
			`SELECT status::text FROM friendships WHERE user_a_id = $1 AND user_b_id = $2`, a, b).Scan(&blockStatus)
		if blockStatus == "blocked" {
			writeError(w, http.StatusForbidden, "blocked", "bu kullanıcıyla mesajlaşamazsın")
			return
		}
	}
	// DM gizliliği: hedef "sadece arkadaşlar" ise ve aramızda kabul edilmiş arkadaşlık yoksa engelle.
	// (Kendine DM ve mevcut DM'ler etkilenmez.)
	if otherID != me {
		var allow string
		_ = h.Pool.QueryRow(r.Context(), `SELECT allow_dms_from FROM users WHERE id = $1`, otherID).Scan(&allow)
		if allow == "friends" {
			a, b := me, otherID
			if a > b {
				a, b = b, a
			}
			var friendStatus string
			_ = h.Pool.QueryRow(r.Context(),
				`SELECT status::text FROM friendships WHERE user_a_id = $1 AND user_b_id = $2`, a, b).Scan(&friendStatus)
			// Mevcut DM zaten varsa izin ver (eskiden iletişim kurmuşlar)
			var hasDM bool
			_ = h.Pool.QueryRow(r.Context(), `
				SELECT EXISTS (
					SELECT 1 FROM channels c
					WHERE c.type = 'dm'
					  AND (SELECT count(*) FROM dm_participants p WHERE p.channel_id = c.id) = 2
					  AND EXISTS (SELECT 1 FROM dm_participants WHERE channel_id = c.id AND user_id = $1)
					  AND EXISTS (SELECT 1 FROM dm_participants WHERE channel_id = c.id AND user_id = $2)
				)`, me, otherID).Scan(&hasDM)
			if friendStatus != "accepted" && !hasDM {
				writeError(w, http.StatusForbidden, "dm_restricted", "bu kullanıcı yalnızca arkadaşlarından mesaj alıyor")
				return
			}
		}
	}
	channelID, err := h.DMs.OpenDirect(r.Context(), me, otherID, h.IDs.Next())
	if err != nil {
		h.logger.Error("open dm", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "dm açılamadı")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"channel_id": strconv.FormatInt(channelID, 10)})
}

func (h *Handler) ListMyDMs(w http.ResponseWriter, r *http.Request) {
	me := middleware.UserIDFrom(r.Context())
	list, err := h.DMs.ListForUser(r.Context(), me)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "dm'ler alınamadı")
		return
	}
	if list == nil {
		list = []repo.DMChannel{}
	}
	writeJSON(w, http.StatusOK, list)
}
