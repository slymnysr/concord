package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/concord/api/internal/middleware"
)

// === Hesap bağlantıları (Discord "Connections" paritesi) ===
// Elle eklenen bağlantılar verified=false; GitHub OAuth ile doğrulananlar verified=true.

var connectionTypes = map[string]bool{
	"github": true, "steam": true, "spotify": true, "youtube": true,
	"twitch": true, "x": true, "reddit": true, "instagram": true,
	"website": true, "custom": true,
}

type connectionView struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Verified bool   `json:"verified"`
	Visible  bool   `json:"visible"`
}

func (h *Handler) ListMyConnections(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `
        SELECT id::text, type, name, verified, visible
        FROM user_connections WHERE user_id = $1 ORDER BY created_at ASC
    `, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []connectionView{}
	for rows.Next() {
		var v connectionView
		if rows.Scan(&v.ID, &v.Type, &v.Name, &v.Verified, &v.Visible) == nil {
			out = append(out, v)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

type createConnectionReq struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

func (h *Handler) CreateConnection(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req createConnectionReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Type = strings.ToLower(strings.TrimSpace(req.Type))
	req.Name = strings.TrimSpace(req.Name)
	if !connectionTypes[req.Type] {
		writeError(w, http.StatusBadRequest, "invalid_type", "geçersiz platform")
		return
	}
	if req.Name == "" || len(req.Name) > 100 {
		writeError(w, http.StatusBadRequest, "invalid_name", "1-100 karakter")
		return
	}
	id := h.IDs.Next()
	tag, err := h.Pool.Exec(r.Context(), `
        INSERT INTO user_connections (id, user_id, type, name, verified)
        VALUES ($1, $2, $3, $4, FALSE)
        ON CONFLICT (user_id, type, name) DO NOTHING
    `, id, uid, req.Type, req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusConflict, "already_exists", "bu bağlantı zaten ekli")
		return
	}
	writeJSON(w, http.StatusCreated, connectionView{
		ID: strconv.FormatInt(id, 10), Type: req.Type, Name: req.Name, Verified: false, Visible: true,
	})
}

type updateConnectionReq struct {
	Visible *bool `json:"visible"`
}

func (h *Handler) UpdateConnection(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	connID, err := parseID(r, "connectionID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	var req updateConnectionReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Visible == nil {
		writeError(w, http.StatusBadRequest, "bad_request", "visible gerekli")
		return
	}
	tag, err := h.Pool.Exec(r.Context(),
		`UPDATE user_connections SET visible = $3 WHERE id = $1 AND user_id = $2`,
		connID, uid, *req.Visible)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "bağlantı yok")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	connID, err := parseID(r, "connectionID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	tag, err := h.Pool.Exec(r.Context(),
		`DELETE FROM user_connections WHERE id = $1 AND user_id = $2`, connID, uid)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "bağlantı yok")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// === GitHub OAuth doğrulama akışı ===
// GITHUB_CLIENT_ID/SECRET yapılandırılmışsa çalışır; state redis'te 10 dk saklanır.

func (h *Handler) GitHubAuthorize(w http.ResponseWriter, r *http.Request) {
	if h.cfg.GitHubClientID == "" {
		writeError(w, http.StatusNotImplemented, "not_configured",
			"GitHub OAuth yapılandırılmamış (GITHUB_CLIENT_ID); bağlantıyı elle ekleyebilirsin")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	state := base64.RawURLEncoding.EncodeToString(b)
	if err := h.Redis.Set(r.Context(), "connstate:"+state, strconv.FormatInt(uid, 10), 10*time.Minute).Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "state kaydedilemedi")
		return
	}
	redirect := h.cfg.PublicBaseURL + "/api/v1/connections/github/callback"
	authURL := "https://github.com/login/oauth/authorize?client_id=" + url.QueryEscape(h.cfg.GitHubClientID) +
		"&redirect_uri=" + url.QueryEscape(redirect) +
		"&state=" + url.QueryEscape(state) +
		"&scope=read:user"
	writeJSON(w, http.StatusOK, map[string]string{"url": authURL})
}

func (h *Handler) GitHubCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "code/state eksik")
		return
	}
	uidStr, err := h.Redis.GetDel(r.Context(), "connstate:"+state).Result()
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_state", "state geçersiz veya süresi dolmuş")
		return
	}
	uid, _ := strconv.ParseInt(uidStr, 10, 64)

	// code -> access token
	form := url.Values{
		"client_id":     {h.cfg.GitHubClientID},
		"client_secret": {h.cfg.GitHubClientSecret},
		"code":          {code},
	}
	tokReq, _ := http.NewRequestWithContext(r.Context(), http.MethodPost,
		"https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	tokReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokReq.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	tokResp, err := client.Do(tokReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "github_error", "GitHub'a ulaşılamadı")
		return
	}
	defer tokResp.Body.Close()
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if json.NewDecoder(tokResp.Body).Decode(&tok) != nil || tok.AccessToken == "" {
		writeError(w, http.StatusBadGateway, "github_error", "token alınamadı")
		return
	}

	// kullanıcı bilgisi
	userReq, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, "https://api.github.com/user", nil)
	userReq.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	userReq.Header.Set("Accept", "application/vnd.github+json")
	userResp, err := client.Do(userReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "github_error", "GitHub'a ulaşılamadı")
		return
	}
	defer userResp.Body.Close()
	var ghUser struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
	}
	if json.NewDecoder(userResp.Body).Decode(&ghUser) != nil || ghUser.Login == "" {
		writeError(w, http.StatusBadGateway, "github_error", "kullanıcı bilgisi alınamadı")
		return
	}

	extID := strconv.FormatInt(ghUser.ID, 10)
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO user_connections (id, user_id, type, name, external_id, verified)
        VALUES ($1, $2, 'github', $3, $4, TRUE)
        ON CONFLICT (user_id, type, name)
        DO UPDATE SET verified = TRUE, external_id = EXCLUDED.external_id
    `, h.IDs.Next(), uid, ghUser.Login, extID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `<!doctype html><html lang="tr"><meta charset="utf-8"><body style="font-family:sans-serif;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh">
<div style="text-align:center"><h2>✅ GitHub hesabın bağlandı: %s</h2><p>Bu pencereyi kapatabilirsin.</p>
<script>setTimeout(function(){window.close()},1500)</script></div></body></html>`, ghUser.Login)
}

var _ = chi.URLParam
