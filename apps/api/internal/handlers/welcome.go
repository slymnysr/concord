package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

type welcomeView struct {
	GuildID           string          `json:"guild_id"`
	Enabled           bool            `json:"enabled"`
	Description       string          `json:"description"`
	WelcomeChannels   json.RawMessage `json:"welcome_channels"`
	RulesText         string          `json:"rules_text"`
	RequireAccept     bool            `json:"require_accept"`
	OnboardingPrompts json.RawMessage `json:"onboarding_prompts"`
	Accepted          bool            `json:"accepted"` // istek sahibi onboarding'i kabul etti mi
}

type updateWelcomeReq struct {
	Enabled           *bool            `json:"enabled"`
	Description       *string          `json:"description"`
	WelcomeChannels   *json.RawMessage `json:"welcome_channels"`
	RulesText         *string          `json:"rules_text"`
	RequireAccept     *bool            `json:"require_accept"`
	OnboardingPrompts *json.RawMessage `json:"onboarding_prompts"`
}

// onboarding prompt yapısı (rol atama için)
type onboardingPrompt struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Options []struct {
		ID      string   `json:"id"`
		Label   string   `json:"label"`
		Emoji   string   `json:"emoji"`
		RoleIDs []string `json:"role_ids"`
	} `json:"options"`
}

// GET /api/v1/guilds/:id/welcome
// Üye olan herkes görebilir (onboarding ekranını çizmek için gerekli).
func (h *Handler) GetGuildWelcome(w http.ResponseWriter, r *http.Request) {
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

	v := welcomeView{
		GuildID:           int64ToStr(guildID),
		WelcomeChannels:   json.RawMessage("[]"),
		OnboardingPrompts: json.RawMessage("[]"),
	}
	err = h.Pool.QueryRow(r.Context(), `
        SELECT enabled, COALESCE(description, ''), welcome_channels, COALESCE(rules_text, ''), require_accept, onboarding_prompts
        FROM guild_welcome WHERE guild_id = $1
    `, guildID).Scan(&v.Enabled, &v.Description, &v.WelcomeChannels, &v.RulesText, &v.RequireAccept, &v.OnboardingPrompts)
	// satır yoksa varsayılan (disabled) döner; başka hata da kullanıcıyı bloklamasın

	var accepted bool
	_ = h.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM guild_member_onboarding WHERE guild_id = $1 AND user_id = $2)`,
		guildID, uid).Scan(&accepted)
	v.Accepted = accepted

	writeJSON(w, http.StatusOK, v)
}

// PATCH /api/v1/guilds/:id/welcome — ManageGuild gerekir
func (h *Handler) UpdateGuildWelcome(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageGuild, w) {
		return
	}
	var req updateWelcomeReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	// Önce satırı oluştur (yoksa), sonra gelen alanları güncelle.
	if _, err := h.Pool.Exec(r.Context(),
		`INSERT INTO guild_welcome (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING`,
		guildID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	if req.Enabled != nil {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE guild_welcome SET enabled = $2, updated_at = NOW() WHERE guild_id = $1`, guildID, *req.Enabled)
	}
	if req.Description != nil {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE guild_welcome SET description = $2, updated_at = NOW() WHERE guild_id = $1`, guildID, *req.Description)
	}
	if req.WelcomeChannels != nil {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE guild_welcome SET welcome_channels = $2, updated_at = NOW() WHERE guild_id = $1`, guildID, []byte(*req.WelcomeChannels))
	}
	if req.RulesText != nil {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE guild_welcome SET rules_text = $2, updated_at = NOW() WHERE guild_id = $1`, guildID, *req.RulesText)
	}
	if req.RequireAccept != nil {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE guild_welcome SET require_accept = $2, updated_at = NOW() WHERE guild_id = $1`, guildID, *req.RequireAccept)
	}
	if req.OnboardingPrompts != nil {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE guild_welcome SET onboarding_prompts = $2, updated_at = NOW() WHERE guild_id = $1`, guildID, []byte(*req.OnboardingPrompts))
	}

	// welcome ayarları sunucu yapılandırmasının parçası → guild_update audit'i
	h.logAudit(r.Context(), guildID, uid, nil, "guild_update", "karşılama ayarları güncellendi", nil)

	// Güncel hali döndür
	v := welcomeView{GuildID: int64ToStr(guildID), WelcomeChannels: json.RawMessage("[]"), OnboardingPrompts: json.RawMessage("[]")}
	_ = h.Pool.QueryRow(r.Context(), `
        SELECT enabled, COALESCE(description, ''), welcome_channels, COALESCE(rules_text, ''), require_accept, onboarding_prompts
        FROM guild_welcome WHERE guild_id = $1
    `, guildID).Scan(&v.Enabled, &v.Description, &v.WelcomeChannels, &v.RulesText, &v.RequireAccept, &v.OnboardingPrompts)
	writeJSON(w, http.StatusOK, v)
}

// POST /api/v1/guilds/:id/onboarding/accept
// Üye, sunucunun karşılama/kuralları kabul ettiğini işaretler.
func (h *Handler) AcceptOnboarding(w http.ResponseWriter, r *http.Request) {
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

	// Seçilen onboarding seçenekleri → rol atama
	var body struct {
		SelectedOptionIDs []string `json:"selected_option_ids"`
	}
	_ = readJSON(r, &body)
	if len(body.SelectedOptionIDs) > 0 {
		selected := map[string]bool{}
		for _, id := range body.SelectedOptionIDs {
			selected[id] = true
		}
		var promptsRaw []byte
		_ = h.Pool.QueryRow(r.Context(), `SELECT onboarding_prompts FROM guild_welcome WHERE guild_id = $1`, guildID).Scan(&promptsRaw)
		var prompts []onboardingPrompt
		if len(promptsRaw) > 0 {
			_ = json.Unmarshal(promptsRaw, &prompts)
		}
		assigned := map[int64]bool{}
		for _, p := range prompts {
			for _, opt := range p.Options {
				if !selected[opt.ID] {
					continue
				}
				for _, ridStr := range opt.RoleIDs {
					rid, perr := strconv.ParseInt(ridStr, 10, 64)
					if perr != nil || assigned[rid] {
						continue
					}
					assigned[rid] = true
					if err := h.Roles.AssignToMember(r.Context(), guildID, uid, rid); err == nil {
						h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_UPDATE", map[string]any{
							"user_id":    uid,
							"role_added": rid,
						})
					}
				}
			}
		}
	}

	_, err = h.Pool.Exec(r.Context(),
		`INSERT INTO guild_member_onboarding (guild_id, user_id) VALUES ($1, $2)
         ON CONFLICT (guild_id, user_id) DO NOTHING`,
		guildID, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
