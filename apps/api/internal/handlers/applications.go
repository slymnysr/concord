package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

// === Bot platformu (Discord "Applications" paritesi) ===
// Uygulama oluştur → bot kullanıcısı + gizli token üretilir. Bot, REST'e
// "Authorization: Bot <token>" ile erişir; gateway için /auth/bot-session'dan JWT alır.

type applicationView struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	BotUserID   string `json:"bot_user_id"`
	BotUsername string `json:"bot_username"`
	Public      bool   `json:"public"`
	Token       string `json:"token,omitempty"` // sadece create/reset yanıtında dolu
	CreatedAt   string `json:"created_at"`
}

func newBotToken() (raw, hash string) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	raw = "scd_" + base64.RawURLEncoding.EncodeToString(b)
	h := sha256.Sum256([]byte(raw))
	hash = hex.EncodeToString(h[:])
	return
}

// ResolveBotToken — middleware.BotResolver implementasyonu ("Bot <token>" başlığı).
func (h *Handler) ResolveBotToken(ctx context.Context, rawToken string) (int64, bool) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return 0, false
	}
	sum := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(sum[:])
	var botUserID int64
	err := h.Pool.QueryRow(ctx, `
        SELECT a.bot_user_id FROM applications a
        JOIN users u ON u.id = a.bot_user_id
        WHERE a.token_hash = $1 AND u.deleted_at IS NULL
    `, tokenHash).Scan(&botUserID)
	if err != nil {
		return 0, false
	}
	return botUserID, true
}

var botSlugRe = regexp.MustCompile(`[^a-z0-9_]+`)

type createApplicationReq struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Public      *bool  `json:"public,omitempty"`
}

func (h *Handler) CreateApplication(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req createApplicationReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if len(req.Name) < 2 || len(req.Name) > 32 {
		writeError(w, http.StatusBadRequest, "invalid_name", "2-32 karakter")
		return
	}
	// Kullanıcı başına makul sınır (Discord: 25)
	var count int
	_ = h.Pool.QueryRow(r.Context(), `SELECT count(*) FROM applications WHERE owner_id = $1`, uid).Scan(&count)
	if count >= 25 {
		writeError(w, http.StatusBadRequest, "limit_reached", "en fazla 25 uygulama")
		return
	}

	appID := h.IDs.Next()
	botID := h.IDs.Next()
	slug := botSlugRe.ReplaceAllString(strings.ToLower(req.Name), "")
	if slug == "" {
		slug = "bot"
	}
	botUsername := fmt.Sprintf("%s_bot_%d", slug, botID%100000)
	botEmail := fmt.Sprintf("bot-%d@bots.concord.local", botID)

	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "oluşturulamadı")
		return
	}
	defer tx.Rollback(r.Context())

	// Bot kullanıcısı: parola hash'i "!" → hiçbir bcrypt eşleşmesi mümkün değil, login edilemez
	if _, err := tx.Exec(r.Context(), `
        INSERT INTO users (id, username, email, display_name, password_hash, bot, email_verified)
        VALUES ($1, $2, $3, $4, '!', TRUE, TRUE)
    `, botID, botUsername, botEmail, req.Name); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "bot kullanıcısı oluşturulamadı")
		return
	}
	raw, hash := newBotToken()
	public := req.Public != nil && *req.Public
	if _, err := tx.Exec(r.Context(), `
        INSERT INTO applications (id, owner_id, name, description, bot_user_id, token_hash, public)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, appID, uid, req.Name, nullIfEmpty(req.Description), botID, hash, public); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "uygulama oluşturulamadı")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "oluşturulamadı")
		return
	}

	writeJSON(w, http.StatusCreated, applicationView{
		ID: strconv.FormatInt(appID, 10), Name: req.Name, Description: req.Description,
		BotUserID: strconv.FormatInt(botID, 10), BotUsername: botUsername,
		Public: public, Token: raw,
	})
}

func nullIfEmpty(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func (h *Handler) ListMyApplications(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `
        SELECT a.id::text, a.name, COALESCE(a.description, ''), a.bot_user_id::text, u.username, a.public, a.created_at::text
        FROM applications a JOIN users u ON u.id = a.bot_user_id
        WHERE a.owner_id = $1 ORDER BY a.created_at DESC
    `, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []applicationView{}
	for rows.Next() {
		var v applicationView
		if rows.Scan(&v.ID, &v.Name, &v.Description, &v.BotUserID, &v.BotUsername, &v.Public, &v.CreatedAt) == nil {
			out = append(out, v)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// appByIDForOwner — uygulamayı yükler, sahibi değilse 404/403 yazar ve false döner.
func (h *Handler) appByIDForOwner(w http.ResponseWriter, r *http.Request, uid int64) (appID, botUserID int64, ok bool) {
	id, err := parseID(r, "applicationID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return 0, 0, false
	}
	var ownerID int64
	err = h.Pool.QueryRow(r.Context(),
		`SELECT owner_id, bot_user_id FROM applications WHERE id = $1`, id).Scan(&ownerID, &botUserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "uygulama yok")
		return 0, 0, false
	}
	if ownerID != uid {
		writeError(w, http.StatusForbidden, "forbidden", "bu uygulamanın sahibi değilsin")
		return 0, 0, false
	}
	return id, botUserID, true
}

type updateApplicationReq struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	Public      *bool   `json:"public,omitempty"`
}

func (h *Handler) UpdateApplication(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	appID, botUserID, ok := h.appByIDForOwner(w, r, uid)
	if !ok {
		return
	}
	var req updateApplicationReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if len(name) < 2 || len(name) > 32 {
			writeError(w, http.StatusBadRequest, "invalid_name", "2-32 karakter")
			return
		}
		_, _ = h.Pool.Exec(r.Context(), `UPDATE applications SET name = $2 WHERE id = $1`, appID, name)
		_, _ = h.Pool.Exec(r.Context(), `UPDATE users SET display_name = $2 WHERE id = $1`, botUserID, name)
	}
	if req.Description != nil {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE applications SET description = $2 WHERE id = $1`, appID, nullIfEmpty(*req.Description))
	}
	if req.Public != nil {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE applications SET public = $2 WHERE id = $1`, appID, *req.Public)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteApplication(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	appID, botUserID, ok := h.appByIDForOwner(w, r, uid)
	if !ok {
		return
	}
	// Bot tüm sunuculardan çıkar + kullanıcıyı anonimleştir (mesajları kalır, hesap silme paterni)
	_, _ = h.Pool.Exec(r.Context(), `DELETE FROM guild_members WHERE user_id = $1`, botUserID)
	_, _ = h.Pool.Exec(r.Context(), `
        UPDATE users SET deleted_at = NOW(), display_name = 'Silinmiş Bot',
               username = 'deleted_bot_' || id, email = 'deleted-bot-' || id || '@bots.concord.local'
        WHERE id = $1
    `, botUserID)
	if _, err := h.Pool.Exec(r.Context(), `DELETE FROM applications WHERE id = $1`, appID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ResetApplicationToken(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	appID, _, ok := h.appByIDForOwner(w, r, uid)
	if !ok {
		return
	}
	raw, hash := newBotToken()
	if _, err := h.Pool.Exec(r.Context(), `UPDATE applications SET token_hash = $2 WHERE id = $1`, appID, hash); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "sıfırlanamadı")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"token": raw})
}

// CreateBotSession — bot, "Authorization: Bot <token>" ile çağırır; gateway WS için JWT döner.
func (h *Handler) CreateBotSession(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var isBot bool
	if h.Pool.QueryRow(r.Context(), `SELECT bot FROM users WHERE id = $1`, uid).Scan(&isBot) != nil || !isBot {
		writeError(w, http.StatusForbidden, "not_bot", "bu endpoint yalnızca bot hesapları için")
		return
	}
	access, exp, err := h.Iss.AccessToken(uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "token üretilemedi")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": access,
		"expires_at":   exp,
		"user_id":      strconv.FormatInt(uid, 10),
	})
}

type addBotReq struct {
	ApplicationID string `json:"application_id"`
}

// AddBotToGuild — ManageGuild yetkisiyle bir botu sunucuya ekler.
func (h *Handler) AddBotToGuild(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "guild id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageGuild, w) {
		return
	}
	var req addBotReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	appID, err := strconv.ParseInt(req.ApplicationID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "application_id")
		return
	}
	var ownerID, botUserID int64
	var isPublic bool
	err = h.Pool.QueryRow(r.Context(), `
        SELECT a.owner_id, a.bot_user_id, a.public FROM applications a
        JOIN users u ON u.id = a.bot_user_id
        WHERE a.id = $1 AND u.deleted_at IS NULL
    `, appID).Scan(&ownerID, &botUserID, &isPublic)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "uygulama yok")
		return
	}
	if !isPublic && ownerID != uid {
		writeError(w, http.StatusForbidden, "private_bot", "bu bot herkese açık değil")
		return
	}
	tag, err := h.Pool.Exec(r.Context(),
		`INSERT INTO guild_members (guild_id, user_id) VALUES ($1, $2) ON CONFLICT (guild_id, user_id) DO NOTHING`,
		guildID, botUserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "eklenemedi")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusConflict, "already_member", "bot zaten bu sunucuda")
		return
	}
	if g, err := h.Guilds.ByID(r.Context(), guildID); err == nil {
		h.applyAutoRole(r.Context(), g, botUserID)
		h.postJoinSystemMessage(r.Context(), g, botUserID)
	}
	var botUser struct {
		ID          string `json:"id"`
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Bot         bool   `json:"bot"`
	}
	_ = h.Pool.QueryRow(r.Context(),
		`SELECT id::text, username, display_name, bot FROM users WHERE id = $1`, botUserID).
		Scan(&botUser.ID, &botUser.Username, &botUser.DisplayName, &botUser.Bot)
	if h.Events != nil {
		h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_ADD", map[string]any{
			"user": botUser, "guild_id": strconv.FormatInt(guildID, 10),
		})
	}
	h.logAudit(r.Context(), guildID, uid, &botUserID, "member_add", "bot eklendi", map[string]string{"application_id": req.ApplicationID})
	writeJSON(w, http.StatusCreated, map[string]any{"added": true, "bot_user_id": strconv.FormatInt(botUserID, 10)})
}
