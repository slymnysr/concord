package handlers

import (
	"context"
	"net/http"
	"strconv"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
	"github.com/go-chi/chi/v5"
)

// computeChannelPerms — sunucu seviyesi izinleri + kanal overrides'ları uygular
// Sırayla: server-level perms → @everyone deny/allow → diğer rol deny/allow → user-specific deny/allow
// Discord'un patternine yakın
func (h *Handler) computeChannelPerms(ctx context.Context, guildID, channelID, userID int64) (uint64, error) {
	base, err := h.Roles.MemberPermissions(ctx, guildID, userID)
	if err != nil {
		return 0, err
	}
	if perms.Has(base, perms.Administrator) {
		return base, nil
	}

	overrides, err := h.ChannelPerms.ForChannel(ctx, channelID)
	if err != nil {
		return 0, err
	}

	// Member'ın rol id'leri
	roleIDs, err := h.Roles.MemberRoleIDs(ctx, guildID, userID)
	if err != nil {
		return 0, err
	}
	roleSet := make(map[int64]bool, len(roleIDs))
	for _, id := range roleIDs {
		roleSet[id] = true
	}

	// @everyone override
	for _, o := range overrides {
		if o.TargetType == "role" {
			// @everyone rolünü bul
			role, _ := h.Roles.ByID(ctx, o.TargetID)
			if role != nil && role.IsEveryone {
				base &= ^uint64(o.Deny)
				base |= uint64(o.Allow)
			}
		}
	}

	// Diğer rol overrides (toplama mantığı: tüm deny'ler birleşik, tüm allow'lar birleşik)
	var roleAllow, roleDeny uint64
	for _, o := range overrides {
		if o.TargetType == "role" && roleSet[o.TargetID] {
			role, _ := h.Roles.ByID(ctx, o.TargetID)
			if role != nil && !role.IsEveryone {
				roleDeny |= uint64(o.Deny)
				roleAllow |= uint64(o.Allow)
			}
		}
	}
	base &= ^roleDeny
	base |= roleAllow

	// User-specific override
	for _, o := range overrides {
		if o.TargetType == "user" && o.TargetID == userID {
			base &= ^uint64(o.Deny)
			base |= uint64(o.Allow)
		}
	}

	return base, nil
}

type upsertOverrideReq struct {
	TargetType string `json:"target_type"`
	TargetID   string `json:"target_id"`
	Allow      string `json:"allow"`
	Deny       string `json:"deny"`
}

func (h *Handler) ListChannelOverrides(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id parse")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ch.GuildID == nil {
		writeError(w, http.StatusBadRequest, "invalid", "DM kanalında override yok")
		return
	}
	if ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	list, err := h.ChannelPerms.ForChannel(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	if list == nil {
		list = []repo.ChannelOverwrite{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) UpsertChannelOverride(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id parse")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID == nil {
		writeError(w, http.StatusBadRequest, "invalid", "DM kanalında override yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageChannels|perms.ManageRoles, w) {
		return
	}
	var req upsertOverrideReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.TargetType != "role" && req.TargetType != "user" {
		writeError(w, http.StatusBadRequest, "bad_request", "target_type 'role' veya 'user'")
		return
	}
	targetID, err := strconv.ParseInt(req.TargetID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "target_id parse")
		return
	}
	allow, _ := strconv.ParseInt(req.Allow, 10, 64)
	deny, _ := strconv.ParseInt(req.Deny, 10, 64)
	o := &repo.ChannelOverwrite{
		ChannelID:  channelID,
		TargetType: req.TargetType,
		TargetID:   targetID,
		Allow:      allow,
		Deny:       deny,
	}
	if err := h.ChannelPerms.Upsert(r.Context(), o); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "yazılamadı")
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (h *Handler) DeleteChannelOverride(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id parse")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID == nil {
		writeError(w, http.StatusBadRequest, "invalid", "DM kanalında override yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageChannels|perms.ManageRoles, w) {
		return
	}
	targetType := chi.URLParam(r, "targetType")
	if targetType != "role" && targetType != "user" {
		writeError(w, http.StatusBadRequest, "bad_request", "target_type 'role' veya 'user'")
		return
	}
	targetID, err := strconv.ParseInt(chi.URLParam(r, "targetID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "target_id parse")
		return
	}
	if err := h.ChannelPerms.Delete(r.Context(), channelID, targetType, targetID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// suppress unused import warnings when these files compile together
var _ = context.Background
