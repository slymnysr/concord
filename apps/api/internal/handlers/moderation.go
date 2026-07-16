package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

type banReq struct {
	Reason string `json:"reason,omitempty"`
	// Banlanan üyenin son X saatlik mesajlarını sil (0 = silme; en fazla 168 = 7 gün)
	DeleteMessageHours int32 `json:"delete_message_hours,omitempty"`
}

func (h *Handler) BanMember(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id parse")
		return
	}
	requester := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, requester, perms.BanMembers, w) {
		return
	}
	g, _ := h.Guilds.ByID(r.Context(), guildID)
	if g != nil && g.OwnerID == userID {
		writeError(w, http.StatusBadRequest, "cannot_ban_owner", "sunucu sahibi banlanamaz")
		return
	}
	// Hiyerarşi: kendinden yüksek veya eşit rollü birini banlayamazsın (owner hariç).
	if !h.canModerateTarget(r.Context(), guildID, requester, userID) {
		writeError(w, http.StatusForbidden, "role_hierarchy", "bu üyeyi banlayamazsın (rol hiyerarşisi)")
		return
	}

	var req banReq
	_ = readJSON(r, &req)

	var reason *string
	if req.Reason != "" {
		reason = &req.Reason
	}
	if err := h.Moderation.Ban(r.Context(), &repo.Ban{
		GuildID:  guildID,
		UserID:   userID,
		BannedBy: requester,
		Reason:   reason,
	}); err != nil {
		h.logger.Error("ban", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "ban başarısız")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_REMOVE", map[string]any{"user_id": userID, "reason": "banned"})
	// Son X saatlik mesajları sil (Discord ban seçeneği)
	deletedCount := int64(0)
	if req.DeleteMessageHours > 0 {
		hours := req.DeleteMessageHours
		if hours > 168 {
			hours = 168
		}
		if tag, err := h.Pool.Exec(r.Context(), `
            DELETE FROM messages
            WHERE author_id = $1
              AND channel_id IN (SELECT id FROM channels WHERE guild_id = $2)
              AND created_at > NOW() - make_interval(hours => $3)
        `, userID, guildID, int(hours)); err == nil {
			deletedCount = tag.RowsAffected()
		} else {
			h.logger.Warn("ban mesaj silme", zap.Error(err))
		}
	}
	auditReason := ""
	if reason != nil {
		auditReason = *reason
	}
	h.logAudit(r.Context(), guildID, requester, &userID, "member_ban", auditReason,
		map[string]any{"deleted_messages": deletedCount, "delete_message_hours": req.DeleteMessageHours})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Unban(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id parse")
		return
	}
	requester := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, requester, perms.BanMembers, w) {
		return
	}
	if err := h.Moderation.Unban(r.Context(), guildID, userID); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "ban kaydı yok")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "unban başarısız")
		return
	}
	h.logAudit(r.Context(), guildID, requester, &userID, "member_unban", "", nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListBans(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	requester := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, requester, perms.BanMembers, w) {
		return
	}
	list, err := h.Moderation.ListBans(r.Context(), guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "banlar alınamadı")
		return
	}
	if list == nil {
		list = []repo.Ban{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) KickMember(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id parse")
		return
	}
	requester := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, requester, perms.KickMembers, w) {
		return
	}
	g, _ := h.Guilds.ByID(r.Context(), guildID)
	if g != nil && g.OwnerID == userID {
		writeError(w, http.StatusBadRequest, "cannot_kick_owner", "sunucu sahibi atılamaz")
		return
	}
	if !h.canModerateTarget(r.Context(), guildID, requester, userID) {
		writeError(w, http.StatusForbidden, "role_hierarchy", "bu üyeyi atamazsın (rol hiyerarşisi)")
		return
	}
	if err := h.Moderation.Kick(r.Context(), guildID, userID); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "üye yok")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "kick başarısız")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_REMOVE", map[string]any{"user_id": userID, "reason": "kicked"})
	h.logAudit(r.Context(), guildID, requester, &userID, "member_kick", "", nil)
	w.WriteHeader(http.StatusNoContent)
}

type timeoutReq struct {
	DurationSec int64 `json:"duration_sec"`
}

func (h *Handler) TimeoutMember(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id parse")
		return
	}
	requester := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, requester, perms.ModerateMembers, w) {
		return
	}
	if !h.canModerateTarget(r.Context(), guildID, requester, userID) {
		writeError(w, http.StatusForbidden, "role_hierarchy", "bu üyeye zaman aşımı uygulayamazsın (rol hiyerarşisi)")
		return
	}
	var req timeoutReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	var until *time.Time
	if req.DurationSec > 0 {
		t := time.Now().Add(time.Duration(req.DurationSec) * time.Second)
		until = &t
	}
	if err := h.Moderation.SetTimeout(r.Context(), guildID, userID, until); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "timeout başarısız")
		return
	}
	h.logAudit(r.Context(), guildID, requester, &userID, "member_timeout", "", map[string]any{
		"duration_sec": req.DurationSec,
		"until":        until,
	})
	writeJSON(w, http.StatusOK, map[string]any{"timeout_until": until})
}
