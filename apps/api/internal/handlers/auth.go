package handlers

import (
	"errors"
	"net"
	"net/http"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/concord/api/internal/auth"
	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/repo"
	"go.uber.org/zap"
)

// parseClientIP — X-Forwarded-For veya RemoteAddr'dan IP çıkar
func parseClientIP(r *http.Request) net.IP {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// İlk IP gerçek istemci
		first := strings.TrimSpace(strings.Split(xff, ",")[0])
		if ip := net.ParseIP(first); ip != nil {
			return ip
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		if ip := net.ParseIP(xri); ip != nil {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return net.ParseIP(host)
}

var usernameRegex = regexp.MustCompile(`^[a-z0-9_.]{3,32}$`)

type registerReq struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
}

type authResp struct {
	User         *repo.User `json:"user"`
	AccessToken  string     `json:"access_token"`
	RefreshToken string     `json:"refresh_token"`
	SessionID    string     `json:"session_id"`
	ExpiresAt    time.Time  `json:"expires_at"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.DisplayName = strings.TrimSpace(req.DisplayName)

	if !usernameRegex.MatchString(req.Username) {
		writeError(w, http.StatusBadRequest, "invalid_username", "kullanıcı adı 3-32 karakter, sadece a-z 0-9 . _")
		return
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_email", "geçerli bir e-posta gir")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "weak_password", "parola en az 8 karakter olmalı")
		return
	}
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		h.logger.Error("hash", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "parola hash hatası")
		return
	}

	user := &repo.User{
		ID:           h.IDs.Next(),
		Username:     req.Username,
		Email:        req.Email,
		DisplayName:  req.DisplayName,
		PasswordHash: hash,
		AvatarColor:  randomBrandColor(),
		Status:       "online",
	}
	if err := h.Users.Create(r.Context(), user); err != nil {
		if errors.Is(err, repo.ErrConflict) {
			writeError(w, http.StatusConflict, "conflict", "kullanıcı adı veya e-posta zaten kullanımda")
			return
		}
		h.logger.Error("user create", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "kullanıcı oluşturulamadı")
		return
	}

	resp, err := h.issueTokens(r, user)
	if err != nil {
		h.logger.Error("issue tokens", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "token üretilemedi")
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

// Brute-force eşikleri (loginFailWindow içinde, e-postanın son başarılı girişinden beri).
// Asıl savunma hesap kapsamlı olanlar; IP eşiği yalnızca kaba bir kötüye kullanım tavanıdır ve
// paylaşımlı çıkış IP'lerini (operatör CGNAT'ı) cezalandırmayacak kadar yüksek tutulur.
const (
	loginFailWindow   = 15 * time.Minute
	maxFailPerEmailIP = 5   // bu hesap + bu IP → saldırgan kendi IP'sini kilitler, kurban etkilenmez
	maxFailPerEmail   = 20  // bu hesap, her IP → dağıtık saldırı tavanı
	maxFailPerIP      = 100 // bu IP, her hesap → credential-stuffing tavanı
)

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	TOTPCode string `json:"totp_code,omitempty"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	clientIP := parseClientIP(r)

	// Brute-force kontrolü — katmanlı: IP başına GEVŞEK, hesap başına SIKI.
	// Tek bir "email VEYA ip >= 5" eşiği İKİ şeyi birden kırıyordu: saldırgan kurbanın
	// e-postasına 5 yanlış parola atıp hesabı kilitliyordu (hedefli DoS) ve CGNAT arkasındaki
	// paylaşımlı IP'de 5 hata o IP'deki herkesi kilitliyordu. Bkz. repo.FailureCounts.
	f, err := h.LoginAttempts.RecentFailures(r.Context(), req.Email, clientIP, loginFailWindow)
	if err != nil {
		// Sayaç okunamıyorsa girişi kapatma (fail-open) — ama görünür olsun.
		h.logger.Warn("brute-force sayacı okunamadı", zap.Error(err))
	} else if f.EmailIP >= maxFailPerEmailIP || f.Email >= maxFailPerEmail || f.IP >= maxFailPerIP {
		w.Header().Set("Retry-After", strconv.Itoa(int(loginFailWindow.Seconds())))
		writeError(w, http.StatusTooManyRequests, "rate_limited",
			"çok fazla başarısız giriş; lütfen 15 dakika sonra tekrar dene")
		return
	}

	user, err := h.Users.ByEmail(r.Context(), req.Email)
	if err != nil {
		// Sabit zaman: aynı yanıt
		_, _ = auth.VerifyPassword(req.Password, "$argon2id$v=19$m=65536,t=2,p=2$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
		_ = h.LoginAttempts.Record(r.Context(), h.IDs.Next(), req.Email, clientIP, false)
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "e-posta veya parola hatalı")
		return
	}

	ok, err := auth.VerifyPassword(req.Password, user.PasswordHash)
	if err != nil || !ok {
		_ = h.LoginAttempts.Record(r.Context(), h.IDs.Next(), req.Email, clientIP, false)
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "e-posta veya parola hatalı")
		return
	}

	// 2FA: etkinse geçerli TOTP kodu iste
	if user.TOTPEnabled {
		if req.TOTPCode == "" {
			writeError(w, http.StatusUnauthorized, "2fa_required", "iki adımlı doğrulama kodu gerekli")
			return
		}
		if user.TOTPSecret == nil || !auth.ValidateTOTP(*user.TOTPSecret, req.TOTPCode) {
			_ = h.LoginAttempts.Record(r.Context(), h.IDs.Next(), req.Email, clientIP, false)
			writeError(w, http.StatusUnauthorized, "invalid_2fa", "iki adımlı doğrulama kodu hatalı")
			return
		}
	}

	_ = h.LoginAttempts.Record(r.Context(), h.IDs.Next(), req.Email, clientIP, true)

	resp, err := h.issueTokens(r, user)
	if err != nil {
		h.logger.Error("issue tokens", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "token üretilemedi")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	hash := auth.HashToken(req.RefreshToken)
	tok, err := h.RefreshTokens.ByHash(r.Context(), hash)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_refresh", "refresh token geçersiz")
		return
	}
	user, err := h.Users.ByID(r.Context(), tok.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_refresh", "kullanıcı bulunamadı")
		return
	}
	// Rotasyon: eski token revoke + yeni token üret
	_ = h.RefreshTokens.Revoke(r.Context(), hash)
	resp, err := h.issueTokens(r, user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "token üretilemedi")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	user, err := h.Users.ByID(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kullanıcı bulunamadı")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *Handler) issueTokens(r *http.Request, user *repo.User) (*authResp, error) {
	access, exp, err := h.Iss.AccessToken(user.ID, user.DisplayName)
	if err != nil {
		return nil, err
	}
	raw, hash, err := auth.NewRefreshToken()
	if err != nil {
		return nil, err
	}
	ua := r.UserAgent()
	sessionID := h.IDs.Next()
	if err := h.RefreshTokens.Create(r.Context(), &repo.RefreshToken{
		ID:        sessionID,
		UserID:    user.ID,
		TokenHash: hash,
		UserAgent: &ua,
		ExpiresAt: time.Now().Add(auth.RefreshTTL),
	}); err != nil {
		return nil, err
	}
	return &authResp{
		User:         user,
		AccessToken:  access,
		RefreshToken: raw,
		SessionID:    strconv.FormatInt(sessionID, 10),
		ExpiresAt:    exp,
	}, nil
}

var brandColors = []string{
	"#00D9A6", "#FF6B6B", "#5865F2", "#EB459E", "#FEE75C",
	"#57F287", "#ED4245", "#9B59B6", "#3498DB", "#1ABC9C",
	"#E67E22", "#F39C12",
}

func randomBrandColor() string {
	return brandColors[time.Now().UnixNano()%int64(len(brandColors))]
}

type changePasswordReq struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// PATCH /api/v1/users/me/password
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	var req changePasswordReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if len(req.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "weak_password", "yeni parola en az 8 karakter")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	user, err := h.Users.ByID(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kullanıcı")
		return
	}
	ok, err := auth.VerifyPassword(req.CurrentPassword, user.PasswordHash)
	if err != nil || !ok {
		writeError(w, http.StatusForbidden, "wrong_password", "mevcut parola yanlış")
		return
	}
	newHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "hash")
		return
	}
	if _, err := h.Pool.Exec(r.Context(), `UPDATE users SET password_hash = $1 WHERE id = $2`, newHash, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type deleteAccountReq struct {
	Password string `json:"password"`
}

// DELETE /api/v1/users/me — hesabı sil (anonimleştir + login engelle). Parola onayı gerekir.
func (h *Handler) DeleteMyAccount(w http.ResponseWriter, r *http.Request) {
	var req deleteAccountReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	user, err := h.Users.ByID(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kullanıcı")
		return
	}
	ok, err := auth.VerifyPassword(req.Password, user.PasswordHash)
	if err != nil || !ok {
		writeError(w, http.StatusForbidden, "wrong_password", "parola yanlış")
		return
	}
	// Sahip olduğu sunucular varsa silmeyi reddet (önce devret/sil)
	var ownedCount int
	_ = h.Pool.QueryRow(r.Context(), `SELECT count(*) FROM guilds WHERE owner_id = $1`, uid).Scan(&ownedCount)
	if ownedCount > 0 {
		writeError(w, http.StatusConflict, "owns_guilds", "önce sahibi olduğun sunucuları sil veya devret")
		return
	}
	// Anonimleştir: PII temizle, login imkânsız hale getir, deleted_at işaretle
	randHash, _ := auth.HashPassword(strconv.FormatInt(h.IDs.Next(), 10) + "_deleted")
	_, err = h.Pool.Exec(r.Context(), `
		UPDATE users SET
			username = 'deleted_' || id::text,
			email = 'deleted_' || id::text || '@deleted.local',
			display_name = 'Silinmiş Kullanıcı',
			password_hash = $2,
			avatar_url = NULL, banner_url = NULL, bio = NULL, pronouns = NULL,
			custom_status_text = NULL, custom_status_emoji = NULL, custom_status_expires_at = NULL,
			totp_secret = NULL, totp_enabled = FALSE, avatar_decoration = NULL,
			status = 'offline', deleted_at = now()
		WHERE id = $1
	`, uid, randHash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinemedi: "+err.Error())
		return
	}
	// Tüm oturumları iptal et
	_ = h.RefreshTokens.RevokeAllExcept(r.Context(), uid, 0)
	w.WriteHeader(http.StatusNoContent)
}
