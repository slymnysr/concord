package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

type createRoleReq struct {
	Name        string `json:"name"`
	Color       int32  `json:"color"`
	Permissions string `json:"permissions"`
	Hoist       bool   `json:"hoist"`
	Mentionable bool   `json:"mentionable"`
	Icon        string `json:"icon,omitempty"`
}

func (h *Handler) ListRoles(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ok, _ := h.Guilds.IsMember(r.Context(), guildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	list, err := h.Roles.ForGuild(r.Context(), guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "roller alınamadı")
		return
	}
	if list == nil {
		list = []repo.Role{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) CreateRole(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageRoles, w) {
		return
	}

	var req createRoleReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if len(req.Name) < 1 || len(req.Name) > 100 {
		writeError(w, http.StatusBadRequest, "invalid_name", "rol adı 1-100 karakter")
		return
	}

	var permsValue int64
	if req.Permissions != "" {
		v, err := strconv.ParseInt(req.Permissions, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "permissions sayı olmalı")
			return
		}
		permsValue = v
	}
	// Yetki yükseltme engeli: sahip olmadığın izinlerle rol oluşturamazsın (owner/admin hariç).
	if permsValue != 0 {
		actorPerms, _ := h.Roles.MemberPermissions(r.Context(), guildID, uid)
		g, _ := h.Guilds.ByID(r.Context(), guildID)
		unrestricted := (g != nil && g.OwnerID == uid) || perms.Has(actorPerms, perms.Administrator)
		if !unrestricted && uint64(permsValue)&^actorPerms != 0 {
			writeError(w, http.StatusForbidden, "perm_escalation", "sahip olmadığın izinlerle rol oluşturamazsın")
			return
		}
	}

	// Yeni rol, mevcut en yüksek position'ın bir üstüne (anlamlı hiyerarşi için).
	// Owner ilk rolleri oluşturur → 1,2,3...; böylece "kendinden düşük rolü yönet" kuralı işler.
	var nextPos int32
	_ = h.Pool.QueryRow(r.Context(), `SELECT COALESCE(MAX(position), 0) + 1 FROM roles WHERE guild_id = $1`, guildID).Scan(&nextPos)

	role := &repo.Role{
		ID:          h.IDs.Next(),
		GuildID:     guildID,
		Name:        req.Name,
		Color:       req.Color,
		Position:    nextPos,
		Permissions: permsValue,
		Hoist:       req.Hoist,
		Mentionable: req.Mentionable,
	}
	if req.Icon != "" {
		icon := req.Icon
		role.Icon = &icon
	}
	if err := h.Roles.Create(r.Context(), role); err != nil {
		h.logger.Error("role create", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "rol oluşturulamadı")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_ROLE_CREATE", map[string]any{"role": role})
	h.logAudit(r.Context(), guildID, uid, &role.ID, "role_create", "", map[string]string{"name": role.Name})
	writeJSON(w, http.StatusCreated, role)
}

type updateRoleReq struct {
	Name        *string `json:"name,omitempty"`
	Color       *int32  `json:"color,omitempty"`
	Permissions *string `json:"permissions,omitempty"`
	Hoist       *bool   `json:"hoist,omitempty"`
	Mentionable *bool   `json:"mentionable,omitempty"`
	Position    *int32  `json:"position,omitempty"`
	Icon        *string `json:"icon,omitempty"`
}

func (h *Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	roleID, err := parseID(r, "roleID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "role id parse")
		return
	}
	role, err := h.Roles.ByID(r.Context(), roleID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "rol yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, role.GuildID, uid, perms.ManageRoles, w) {
		return
	}
	// Hiyerarşi: düzenlenen rol, düzenleyenin en yüksek rolünden düşük olmalı (owner hariç).
	if !h.canManageRolePosition(r.Context(), role.GuildID, uid, role.Position) {
		writeError(w, http.StatusForbidden, "role_hierarchy", "bu rolü düzenleyemezsin (hiyerarşi)")
		return
	}
	// Owner / Administrator kendi izin setiyle sınırlı değil; diğerleri yalnızca SAHİP OLDUĞU izinleri verebilir.
	actorPerms, _ := h.Roles.MemberPermissions(r.Context(), role.GuildID, uid)
	g, _ := h.Guilds.ByID(r.Context(), role.GuildID)
	unrestricted := (g != nil && g.OwnerID == uid) || perms.Has(actorPerms, perms.Administrator)

	var req updateRoleReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	if req.Name != nil {
		role.Name = *req.Name
	}
	if req.Color != nil {
		role.Color = *req.Color
	}
	if req.Permissions != nil {
		v, err := strconv.ParseInt(*req.Permissions, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "permissions sayı olmalı")
			return
		}
		// Yetki yükseltme engeli: yeni EKLENEN bitler, düzenleyenin sahip olmadığı bir izni içeremez.
		if !unrestricted {
			added := uint64(v) &^ uint64(role.Permissions)
			if added&^actorPerms != 0 {
				writeError(w, http.StatusForbidden, "perm_escalation", "sahip olmadığın izinleri bir role veremezsin")
				return
			}
		}
		role.Permissions = v
	}
	if req.Hoist != nil {
		role.Hoist = *req.Hoist
	}
	if req.Mentionable != nil {
		role.Mentionable = *req.Mentionable
	}
	if req.Position != nil {
		// Rolü kendi en yüksek rolünün üstüne taşıyamazsın (owner hariç).
		if !h.canManageRolePosition(r.Context(), role.GuildID, uid, *req.Position) {
			writeError(w, http.StatusForbidden, "role_hierarchy", "rolü kendi seviyenin üstüne taşıyamazsın")
			return
		}
		role.Position = *req.Position
	}
	if req.Icon != nil {
		ic := strings.TrimSpace(*req.Icon)
		if ic == "" {
			role.Icon = nil
		} else {
			role.Icon = &ic
		}
	}

	if err := h.Roles.Update(r.Context(), role); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "rol güncellenemedi")
		return
	}
	h.Events.ToGuild(r.Context(), role.GuildID, "GUILD_ROLE_UPDATE", map[string]any{"role": role})
	h.logAudit(r.Context(), role.GuildID, uid, &role.ID, "role_update", "", nil)
	writeJSON(w, http.StatusOK, role)
}

func (h *Handler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	roleID, err := parseID(r, "roleID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "role id parse")
		return
	}
	role, err := h.Roles.ByID(r.Context(), roleID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "rol yok")
		return
	}
	if role.IsEveryone {
		writeError(w, http.StatusBadRequest, "cannot_delete_everyone", "@everyone silinemez")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, role.GuildID, uid, perms.ManageRoles, w) {
		return
	}
	if !h.canManageRolePosition(r.Context(), role.GuildID, uid, role.Position) {
		writeError(w, http.StatusForbidden, "role_hierarchy", "bu rolü silemezsin (hiyerarşi)")
		return
	}
	if err := h.Roles.Delete(r.Context(), roleID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "rol silinemedi")
		return
	}
	h.Events.ToGuild(r.Context(), role.GuildID, "GUILD_ROLE_DELETE", map[string]any{"role_id": roleID})
	h.logAudit(r.Context(), role.GuildID, uid, &roleID, "role_delete", "", nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) AssignRole(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "guild id parse")
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id parse")
		return
	}
	roleID, err := strconv.ParseInt(chi.URLParam(r, "roleID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "role id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageRoles, w) {
		return
	}
	// Hiyerarşi: yalnızca kendi en yüksek rolünden düşük rolleri atayabilirsin (owner hariç).
	// Bu olmadan ManageRoles'lı herkes kendine Administrator atayabilirdi (yetki yükseltme).
	role, rerr := h.Roles.ByID(r.Context(), roleID)
	if rerr != nil || role == nil || role.GuildID != guildID {
		writeError(w, http.StatusNotFound, "not_found", "rol yok")
		return
	}
	if !h.canManageRolePosition(r.Context(), guildID, uid, role.Position) {
		writeError(w, http.StatusForbidden, "role_hierarchy", "bu rolü atayamazsın (kendi en yüksek rolünden yüksek veya eşit)")
		return
	}
	// Yetki yükseltme engeli: sahip olmadığın izinleri içeren bir rolü atayamazsın (owner/admin hariç).
	// Bu, rollerin yanlış sıralandığı durumlarda bile Administrator'ın dağıtılmasını engeller.
	actorPerms, _ := h.Roles.MemberPermissions(r.Context(), guildID, uid)
	g, _ := h.Guilds.ByID(r.Context(), guildID)
	unrestricted := (g != nil && g.OwnerID == uid) || perms.Has(actorPerms, perms.Administrator)
	if !unrestricted && uint64(role.Permissions)&^actorPerms != 0 {
		writeError(w, http.StatusForbidden, "perm_escalation", "sahip olmadığın izinleri içeren bir rolü atayamazsın")
		return
	}
	if err := h.Roles.AssignToMember(r.Context(), guildID, userID, roleID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "rol atanamadı")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_UPDATE", map[string]any{
		"user_id":    userID,
		"role_added": roleID,
	})
	h.logAudit(r.Context(), guildID, uid, &userID, "role_assign", "", map[string]any{"role_id": roleID})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) UnassignRole(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "guild id parse")
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id parse")
		return
	}
	roleID, err := strconv.ParseInt(chi.URLParam(r, "roleID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "role id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageRoles, w) {
		return
	}
	role, rerr := h.Roles.ByID(r.Context(), roleID)
	if rerr != nil || role == nil || role.GuildID != guildID {
		writeError(w, http.StatusNotFound, "not_found", "rol yok")
		return
	}
	if !h.canManageRolePosition(r.Context(), guildID, uid, role.Position) {
		writeError(w, http.StatusForbidden, "role_hierarchy", "bu rolü kaldıramazsın (hiyerarşi)")
		return
	}
	if err := h.Roles.RemoveFromMember(r.Context(), guildID, userID, roleID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "rol kaldırılamadı")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_UPDATE", map[string]any{
		"user_id":      userID,
		"role_removed": roleID,
	})
	h.logAudit(r.Context(), guildID, uid, &userID, "role_unassign", "", map[string]any{"role_id": roleID})
	w.WriteHeader(http.StatusNoContent)
}

// actorHighestRolePosition — kullanıcının sahip olduğu rollerin en yüksek position'ı.
// Hiçbir rolü yoksa -1 (yalnızca @everyone, position 0). Owner için kullanılmaz (ayrı bypass).
func (h *Handler) actorHighestRolePosition(ctx context.Context, guildID, userID int64) int32 {
	roleIDs, err := h.Roles.MemberRoleIDs(ctx, guildID, userID)
	if err != nil {
		return -1
	}
	var highest int32 = -1
	for _, rid := range roleIDs {
		role, err := h.Roles.ByID(ctx, rid)
		if err != nil || role == nil || role.IsEveryone {
			continue
		}
		if role.Position > highest {
			highest = role.Position
		}
	}
	return highest
}

// canModerateTarget — actor, target üyeye moderasyon (kick/ban/timeout) uygulayabilir mi?
// Owner her zaman uygulayabilir; aksi halde actor'ın en yüksek rolü target'ınkinden YÜKSEK olmalı.
// Kendine ve owner'a uygulanamaz.
func (h *Handler) canModerateTarget(ctx context.Context, guildID, actorID, targetID int64) bool {
	if actorID == targetID {
		return false
	}
	g, err := h.Guilds.ByID(ctx, guildID)
	if err == nil && g.OwnerID == actorID {
		return true
	}
	if err == nil && g.OwnerID == targetID {
		return false
	}
	return h.actorHighestRolePosition(ctx, guildID, actorID) > h.actorHighestRolePosition(ctx, guildID, targetID)
}

// canManageRolePosition — actor, targetPosition konumundaki bir rolü yönetebilir mi?
// Discord kuralı: yalnızca KENDİ en yüksek rolünden DÜŞÜK rolleri yönetebilirsin. Owner her şeyi yapar.
func (h *Handler) canManageRolePosition(ctx context.Context, guildID, actorID int64, targetPosition int32) bool {
	g, err := h.Guilds.ByID(ctx, guildID)
	if err == nil && g.OwnerID == actorID {
		return true
	}
	return targetPosition < h.actorHighestRolePosition(ctx, guildID, actorID)
}

// requirePerm — kullanıcının guildID'de istenen izne sahip olup olmadığını kontrol eder
// false dönerse zaten HTTP yanıtı yazılmıştır
func (h *Handler) requirePerm(r *http.Request, guildID, userID int64, want uint64, w http.ResponseWriter) bool {
	if ok, _ := h.Guilds.IsMember(r.Context(), guildID, userID); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return false
	}
	have, err := h.Roles.MemberPermissions(r.Context(), guildID, userID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "sunucu yok")
			return false
		}
		writeError(w, http.StatusInternalServerError, "internal", "izin kontrol hatası")
		return false
	}
	if !perms.Has(have, want) {
		writeError(w, http.StatusForbidden, "missing_permission", "yetersiz izin")
		return false
	}
	return true
}

type nicknameReq struct {
	Nickname string `json:"nickname"`
}

// PATCH /guilds/{id}/members/{userID}/nickname — kendi takma adın serbest; başkasınınki ManageNicknames
func (h *Handler) SetMemberNickname(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "guild id")
		return
	}
	targetID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if targetID != uid {
		if !h.requirePerm(r, guildID, uid, perms.ManageNicknames, w) {
			return
		}
	} else if ok, _ := h.Guilds.IsMember(r.Context(), guildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	var req nicknameReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	nick := strings.TrimSpace(req.Nickname)
	if len(nick) > 32 {
		writeError(w, http.StatusBadRequest, "invalid", "takma ad en fazla 32 karakter")
		return
	}
	var val *string
	if nick != "" {
		val = &nick
	}
	if _, err := h.Pool.Exec(r.Context(),
		`UPDATE guild_members SET nickname = $3 WHERE guild_id = $1 AND user_id = $2`,
		guildID, targetID, val); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_UPDATE", map[string]any{
		"user_id":  targetID,
		"nickname": nick,
	})
	w.WriteHeader(http.StatusNoContent)
}

type guildProfileReq struct {
	Nickname       *string `json:"nickname,omitempty"`
	GuildAvatarURL *string `json:"guild_avatar_url,omitempty"`
	GuildBio       *string `json:"guild_bio,omitempty"`
}

// PATCH /guilds/{id}/members/me/profile — kendi sunucu-bazlı profilin (avatar/bio/takma ad)
func (h *Handler) SetMyGuildProfile(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "guild id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ok, _ := h.Guilds.IsMember(r.Context(), guildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	var req guildProfileReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	sets := []string{}
	args := []any{guildID, uid}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+strconv.Itoa(len(args)))
	}
	if req.Nickname != nil {
		n := strings.TrimSpace(*req.Nickname)
		if len(n) > 32 {
			writeError(w, http.StatusBadRequest, "invalid", "takma ad en fazla 32 karakter")
			return
		}
		if n == "" {
			add("nickname", nil)
		} else {
			add("nickname", n)
		}
	}
	if req.GuildAvatarURL != nil {
		a := strings.TrimSpace(*req.GuildAvatarURL)
		if a == "" {
			add("guild_avatar_url", nil)
		} else {
			add("guild_avatar_url", a)
		}
	}
	if req.GuildBio != nil {
		b := strings.TrimSpace(*req.GuildBio)
		if len(b) > 190 {
			writeError(w, http.StatusBadRequest, "invalid", "sunucu bio en fazla 190 karakter")
			return
		}
		if b == "" {
			add("guild_bio", nil)
		} else {
			add("guild_bio", b)
		}
	}
	if len(sets) == 0 {
		writeError(w, http.StatusBadRequest, "nothing_to_update", "değişiklik yok")
		return
	}
	q := "UPDATE guild_members SET " + strings.Join(sets, ", ") + " WHERE guild_id = $1 AND user_id = $2"
	if _, err := h.Pool.Exec(r.Context(), q, args...); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_UPDATE", map[string]any{
		"user_id":          uid,
		"guild_avatar_url": req.GuildAvatarURL,
		"guild_bio":        req.GuildBio,
		"nickname":         req.Nickname,
	})
	w.WriteHeader(http.StatusNoContent)
}
