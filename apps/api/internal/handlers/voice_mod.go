package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/go-chi/chi/v5"
)

type voiceModReq struct {
	Mute   *bool `json:"mute,omitempty"`
	Deafen *bool `json:"deafen,omitempty"`
}

var voiceHTTPClient = &http.Client{Timeout: 5 * time.Second}

func voiceEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// PATCH /guilds/{id}/members/{userID}/voice — sunucu susturma/sağırlaştırma (mod yetkisi, enforced)
// Yetkiyi burada kontrol eder, sonra voice server'a (enforce eden) komut iletir.
func (h *Handler) SetMemberVoiceState(w http.ResponseWriter, r *http.Request) {
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

	var req voiceModReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Mute == nil && req.Deafen == nil {
		writeError(w, http.StatusBadRequest, "nothing_to_update", "mute veya deafen gerekli")
		return
	}
	// Yetki: susturma → MuteMembers, sağırlaştırma → DeafenMembers
	if req.Mute != nil && !h.requirePerm(r, guildID, uid, perms.MuteMembers, w) {
		return
	}
	if req.Deafen != nil && !h.requirePerm(r, guildID, uid, perms.DeafenMembers, w) {
		return
	}
	// Hedef sunucu üyesi olmalı
	if ok, _ := h.Guilds.IsMember(r.Context(), guildID, targetID); !ok {
		writeError(w, http.StatusNotFound, "not_found", "kullanıcı bu sunucuda değil")
		return
	}
	// Hiyerarşi: kendinden yüksek/eşit rollü birini sunucuda susturamazsın (owner hariç).
	if !h.canModerateTarget(r.Context(), guildID, uid, targetID) {
		writeError(w, http.StatusForbidden, "role_hierarchy", "bu üyeyi sunucuda susturamazsın (rol hiyerarşisi)")
		return
	}

	// DB'ye kalıcı yaz (voice server restart'ında join'de geri yüklenir).
	// Mevcut satırı koru: yalnızca verilen alanı güncelle.
	_, _ = h.Pool.Exec(r.Context(), `
		INSERT INTO guild_voice_states (guild_id, user_id, server_mute, server_deaf, updated_at)
		VALUES ($1, $2, COALESCE($3, FALSE), COALESCE($4, FALSE), NOW())
		ON CONFLICT (guild_id, user_id) DO UPDATE SET
			server_mute = COALESCE($3, guild_voice_states.server_mute),
			server_deaf = COALESCE($4, guild_voice_states.server_deaf),
			updated_at = NOW()
	`, guildID, targetID, req.Mute, req.Deafen)
	// Her ikisi de kalktıysa satırı temizle
	_, _ = h.Pool.Exec(r.Context(),
		`DELETE FROM guild_voice_states WHERE guild_id = $1 AND user_id = $2 AND server_mute = FALSE AND server_deaf = FALSE`,
		guildID, targetID)

	// Voice server'a (enforce eden) ilet
	payload, _ := json.Marshal(map[string]any{
		"user_id": strconv.FormatInt(targetID, 10),
		"mute":    req.Mute,
		"deafen":  req.Deafen,
	})
	vurl := voiceEnv("VOICE_CONTROL_URL", "http://localhost:4444") + "/control/voice-state"
	hreq, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, vurl, bytes.NewReader(payload))
	hreq.Header.Set("Content-Type", "application/json")
	hreq.Header.Set("x-voice-secret", voiceEnv("VOICE_CONTROL_SECRET", "dev_voice_control_secret_change_me"))
	if resp, err := voiceHTTPClient.Do(hreq); err != nil {
		h.logger.Warn("voice control forward failed: " + err.Error())
	} else {
		resp.Body.Close()
	}

	// Tüm UI'ların ikonları güncellemesi için gateway olayı
	h.Events.ToGuild(r.Context(), guildID, "GUILD_VOICE_STATE_UPDATE", map[string]any{
		"guild_id":    strconv.FormatInt(guildID, 10),
		"user_id":     strconv.FormatInt(targetID, 10),
		"server_mute": req.Mute,
		"server_deaf": req.Deafen,
	})

	// Denetim günlüğü
	if req.Mute != nil {
		h.logAudit(r.Context(), guildID, uid, &targetID, "voice_mute", "", map[string]any{"mute": *req.Mute})
	}
	if req.Deafen != nil {
		h.logAudit(r.Context(), guildID, uid, &targetID, "voice_deafen", "", map[string]any{"deafen": *req.Deafen})
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /guilds/{id}/voice-states — sunucunun kalıcı server-mute/deaf durumları (üye listesi rozetleri).
func (h *Handler) ListGuildVoiceStates(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.Pool.Query(r.Context(),
		`SELECT user_id::text, server_mute, server_deaf FROM guild_voice_states WHERE guild_id = $1`, guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	type vs struct {
		UserID     string `json:"user_id"`
		ServerMute bool   `json:"server_mute"`
		ServerDeaf bool   `json:"server_deaf"`
	}
	out := []vs{}
	for rows.Next() {
		var v vs
		if err := rows.Scan(&v.UserID, &v.ServerMute, &v.ServerDeaf); err == nil {
			out = append(out, v)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// GET /voice-internal/state?channel_id&user_id — voice server'ın join'de kalıcı durumu çekmesi için.
// x-voice-secret header'ı ile korunur (kullanıcı JWT'si gerekmez).
func (h *Handler) GetPersistedVoiceStateInternal(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("x-voice-secret") != voiceEnv("VOICE_CONTROL_SECRET", "dev_voice_control_secret_change_me") {
		writeError(w, http.StatusUnauthorized, "unauthorized", "geçersiz secret")
		return
	}
	channelID, err := strconv.ParseInt(r.URL.Query().Get("channel_id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel_id")
		return
	}
	userID, err := strconv.ParseInt(r.URL.Query().Get("user_id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user_id")
		return
	}
	// Kanal → guild
	var guildID *int64
	_ = h.Pool.QueryRow(r.Context(), `SELECT guild_id FROM channels WHERE id = $1`, channelID).Scan(&guildID)
	mute, deaf := false, false
	if guildID != nil {
		_ = h.Pool.QueryRow(r.Context(),
			`SELECT server_mute, server_deaf FROM guild_voice_states WHERE guild_id = $1 AND user_id = $2`,
			*guildID, userID).Scan(&mute, &deaf)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"mute": mute, "deafen": deaf})
}

// GET /voice-internal/can-join?channel_id&user_id — voice server join politikası:
// kanal limiti + ses bitrate'i + kullanıcının limiti aşma yetkisi (taşı/kanal yönet/admin/sahip).
// x-voice-secret ile korunur.
func (h *Handler) CanJoinVoiceInternal(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("x-voice-secret") != voiceEnv("VOICE_CONTROL_SECRET", "dev_voice_control_secret_change_me") {
		writeError(w, http.StatusUnauthorized, "unauthorized", "geçersiz secret")
		return
	}
	channelID, err := strconv.ParseInt(r.URL.Query().Get("channel_id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel_id")
		return
	}
	userID, err := strconv.ParseInt(r.URL.Query().Get("user_id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "user_id")
		return
	}
	var guildID *int64
	var userLimit, bitrate int32
	if err := h.Pool.QueryRow(r.Context(),
		`SELECT guild_id, user_limit, bitrate FROM channels WHERE id = $1`, channelID).
		Scan(&guildID, &userLimit, &bitrate); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	canBypass := false
	if guildID != nil {
		var ownerID int64
		_ = h.Pool.QueryRow(r.Context(), `SELECT owner_id FROM guilds WHERE id = $1`, *guildID).Scan(&ownerID)
		if ownerID == userID {
			canBypass = true
		} else if bits, err := h.Roles.MemberPermissions(r.Context(), *guildID, userID); err == nil {
			canBypass = perms.Has(bits, perms.Administrator) ||
				perms.Has(bits, perms.MoveMembers) ||
				perms.Has(bits, perms.ManageChannels)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user_limit": userLimit,
		"bitrate":    bitrate,
		"can_bypass": canBypass,
	})
}
