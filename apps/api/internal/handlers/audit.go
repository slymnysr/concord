package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"go.uber.org/zap"
)

type auditEntry struct {
	ID        string          `json:"id"`
	GuildID   string          `json:"guild_id"`
	ActorID   string          `json:"actor_id"`
	TargetID  *string         `json:"target_id,omitempty"`
	Action    string          `json:"action"`
	Reason    *string         `json:"reason,omitempty"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	CreatedAt string          `json:"created_at"`
}

// logAudit — non-blocking, hata loglar
func (h *Handler) logAudit(ctx context.Context, guildID, actorID int64, targetID *int64, action, reason string, metadata any) {
	var meta []byte
	if metadata != nil {
		meta, _ = json.Marshal(metadata)
	}
	var reasonPtr *string
	if reason != "" {
		reasonPtr = &reason
	}
	_, err := h.Pool.Exec(ctx, `
        INSERT INTO audit_logs (id, guild_id, actor_id, target_id, action, reason, metadata)
        VALUES ($1, $2, $3, $4, $5::audit_action, $6, $7)
    `, h.IDs.Next(), guildID, actorID, targetID, action, reasonPtr, meta)
	if err != nil {
		h.logger.Warn("audit log", zap.Error(err), zap.String("action", action))
	}
}

func (h *Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ViewAuditLog, w) {
		return
	}
	action := r.URL.Query().Get("action")
	actorID := r.URL.Query().Get("actor_id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 200 {
		limit = 100
	}

	args := []any{guildID, limit}
	q := `SELECT id::text, guild_id::text, actor_id::text, target_id::text, action::text, reason, metadata, created_at::text
          FROM audit_logs WHERE guild_id = $1`
	if action != "" {
		args = append(args, action)
		q += " AND action = $" + itoa(len(args)) + "::audit_action"
	}
	if actorID != "" {
		if aid, err := strconv.ParseInt(actorID, 10, 64); err == nil {
			args = append(args, aid)
			q += " AND actor_id = $" + itoa(len(args))
		}
	}
	q += " ORDER BY created_at DESC LIMIT $2"

	rows, err := h.Pool.Query(r.Context(), q, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı: "+err.Error())
		return
	}
	defer rows.Close()
	var list []auditEntry
	for rows.Next() {
		var e auditEntry
		var targetNull *string
		var meta []byte
		if err := rows.Scan(&e.ID, &e.GuildID, &e.ActorID, &targetNull, &e.Action, &e.Reason, &meta, &e.CreatedAt); err != nil {
			continue
		}
		e.TargetID = targetNull
		if len(meta) > 0 {
			e.Metadata = meta
		}
		list = append(list, e)
	}
	if list == nil {
		list = []auditEntry{}
	}
	writeJSON(w, http.StatusOK, list)
}
