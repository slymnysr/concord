package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

type reactionRoleView struct {
	ID        string    `json:"id"`
	GuildID   string    `json:"guild_id"`
	ChannelID string    `json:"channel_id"`
	MessageID string    `json:"message_id"`
	Emoji     string    `json:"emoji"`
	RoleID    string    `json:"role_id"`
	CreatedAt time.Time `json:"created_at"`
}

type createReactionRoleReq struct {
	ChannelID string `json:"channel_id"`
	MessageID string `json:"message_id"`
	Emoji     string `json:"emoji"`
	RoleID    string `json:"role_id"`
}

// GET /api/v1/guilds/:id/reaction-roles
func (h *Handler) ListReactionRoles(w http.ResponseWriter, r *http.Request) {
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
        SELECT id::text, guild_id::text, channel_id::text, message_id::text, emoji, role_id::text, created_at
        FROM reaction_role_bindings WHERE guild_id = $1 ORDER BY created_at DESC
    `, guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer rows.Close()
	out := []reactionRoleView{}
	for rows.Next() {
		var v reactionRoleView
		if err := rows.Scan(&v.ID, &v.GuildID, &v.ChannelID, &v.MessageID, &v.Emoji, &v.RoleID, &v.CreatedAt); err == nil {
			out = append(out, v)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /api/v1/guilds/:id/reaction-roles
func (h *Handler) CreateReactionRole(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageRoles, w) {
		return
	}
	var req createReactionRoleReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Emoji == "" {
		writeError(w, http.StatusBadRequest, "missing_emoji", "emoji gerekli")
		return
	}
	channelID, err := strconv.ParseInt(req.ChannelID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel_id")
		return
	}
	messageID, err := strconv.ParseInt(req.MessageID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message_id")
		return
	}
	roleID, err := strconv.ParseInt(req.RoleID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "role_id")
		return
	}
	id := h.IDs.Next()
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO reaction_role_bindings (id, guild_id, channel_id, message_id, emoji, role_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, id, guildID, channelID, messageID, req.Emoji, roleID, uid)
	if err != nil {
		writeError(w, http.StatusBadRequest, "conflict", "zaten var olabilir")
		return
	}
	writeJSON(w, http.StatusCreated, reactionRoleView{
		ID: int64ToStr(id), GuildID: int64ToStr(guildID),
		ChannelID: req.ChannelID, MessageID: req.MessageID,
		Emoji: req.Emoji, RoleID: req.RoleID, CreatedAt: time.Now(),
	})
}

// DELETE /api/v1/reaction-roles/:id
func (h *Handler) DeleteReactionRole(w http.ResponseWriter, r *http.Request) {
	bindingID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	var guildID int64
	if err := h.Pool.QueryRow(r.Context(), `SELECT guild_id FROM reaction_role_bindings WHERE id = $1`, bindingID).Scan(&guildID); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "bağlama yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageRoles, w) {
		return
	}
	_, _ = h.Pool.Exec(r.Context(), `DELETE FROM reaction_role_bindings WHERE id = $1`, bindingID)
	w.WriteHeader(http.StatusNoContent)
}

// applyReactionRoles — bir guild mesajına emoji ile tepki verilince (add=true) veya
// tepki kaldırılınca (add=false) eşleşen reaction_role_bindings için kullanıcıya
// rolü atar / kaldırır ve GUILD_MEMBER_UPDATE olayı yayınlar.
// Hata durumunda sessizce geçilir: reaction işleminin kendisini bloklamamalı.
func (h *Handler) applyReactionRoles(ctx context.Context, guildID, userID, messageID int64, emoji string, add bool) {
	rows, err := h.Pool.Query(ctx,
		`SELECT role_id FROM reaction_role_bindings WHERE message_id = $1 AND emoji = $2`,
		messageID, emoji)
	if err != nil {
		return
	}
	var roleIDs []int64
	for rows.Next() {
		var rid int64
		if err := rows.Scan(&rid); err == nil {
			roleIDs = append(roleIDs, rid)
		}
	}
	rows.Close()

	for _, rid := range roleIDs {
		if add {
			if err := h.Roles.AssignToMember(ctx, guildID, userID, rid); err == nil {
				h.Events.ToGuild(ctx, guildID, "GUILD_MEMBER_UPDATE", map[string]any{
					"user_id":    userID,
					"role_added": rid,
				})
			}
		} else {
			if err := h.Roles.RemoveFromMember(ctx, guildID, userID, rid); err == nil {
				h.Events.ToGuild(ctx, guildID, "GUILD_MEMBER_UPDATE", map[string]any{
					"user_id":      userID,
					"role_removed": rid,
				})
			}
		}
	}
}
