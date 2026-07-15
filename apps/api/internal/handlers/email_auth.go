package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"

	"github.com/concord/api/internal/auth"
	"github.com/concord/api/internal/mailer"
	"github.com/concord/api/internal/middleware"
	"go.uber.org/zap"
)

// === E-posta tabanlı hesap akışları ===
// Şifre sıfırlama + e-posta doğrulama + e-posta değiştirme. Mailler SMTP (dev: MailHog)
// üzerinden gider; gönderim hatası kullanıcıya sızdırılmaz (enumeration önleme), log'a düşer.

func newEmailToken() (raw, hash string) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	raw = base64.RawURLEncoding.EncodeToString(b)
	h := sha256.Sum256([]byte(raw))
	hash = hex.EncodeToString(h[:])
	return
}

func hashEmailToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

func validEmail(s string) bool {
	s = strings.TrimSpace(s)
	at := strings.Index(s, "@")
	return len(s) >= 6 && len(s) <= 254 && at > 0 && at < len(s)-3 && strings.Contains(s[at:], ".")
}

type forgotPasswordReq struct {
	Email string `json:"email"`
}

// ForgotPassword — anonim. Hesap olsa da olmasa da 200 döner (user enumeration önleme).
func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotPasswordReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	email := strings.TrimSpace(req.Email)
	respond := func() { writeJSON(w, http.StatusOK, map[string]bool{"ok": true}) }
	if !validEmail(email) {
		respond()
		return
	}
	var userID int64
	var displayName string
	err := h.Pool.QueryRow(r.Context(),
		`SELECT id, display_name FROM users WHERE email = $1 AND deleted_at IS NULL AND bot = FALSE`,
		email).Scan(&userID, &displayName)
	if err != nil {
		respond()
		return
	}
	raw, hash := newEmailToken()
	if _, err := h.Pool.Exec(r.Context(), `
        INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
        VALUES ($1, $2, 'password_reset', NOW() + interval '1 hour')
    `, hash, userID); err != nil {
		h.logger.Warn("reset token kaydedilemedi", zap.Error(err))
		respond()
		return
	}
	link := h.cfg.WebBaseURL + "/?reset_token=" + raw
	body := fmt.Sprintf("Merhaba %s,<br><br>Concord hesabın için şifre sıfırlama isteği aldık. Aşağıdaki butonla yeni şifreni belirleyebilirsin. Bağlantı <b>1 saat</b> geçerlidir.", displayName)
	if err := h.Mailer.Send(email, "Şifre sıfırlama", mailer.Layout("Şifreni sıfırla", body, link, "Yeni Şifre Belirle")); err != nil {
		h.logger.Warn("reset maili gönderilemedi", zap.Error(err), zap.String("to", email))
	}
	respond()
}

type resetPasswordReq struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

// ResetPassword — anonim. Token geçerliyse şifreyi günceller ve tüm oturumları kapatır.
func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetPasswordReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if len(req.NewPassword) < 8 || len(req.NewPassword) > 128 {
		writeError(w, http.StatusBadRequest, "weak_password", "şifre en az 8 karakter olmalı")
		return
	}
	var userID int64
	err := h.Pool.QueryRow(r.Context(), `
        SELECT user_id FROM email_tokens
        WHERE token_hash = $1 AND purpose = 'password_reset' AND used_at IS NULL AND expires_at > NOW()
    `, hashEmailToken(req.Token)).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_token", "bağlantı geçersiz veya süresi dolmuş — yeni sıfırlama isteği oluştur")
		return
	}
	newHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "şifre işlenemedi")
		return
	}
	if _, err := h.Pool.Exec(r.Context(),
		`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, userID, newHash); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "güncellenemedi")
		return
	}
	_, _ = h.Pool.Exec(r.Context(),
		`UPDATE email_tokens SET used_at = NOW() WHERE token_hash = $1`, hashEmailToken(req.Token))
	// Güvenlik: tüm aktif oturumları kapat
	_, _ = h.Pool.Exec(r.Context(), `DELETE FROM refresh_tokens WHERE user_id = $1`, userID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// sendVerifyEmail — hedef adrese doğrulama bağlantısı yollar (newEmail boş = mevcut adresi doğrula).
func (h *Handler) sendVerifyEmail(r *http.Request, userID int64, targetEmail, newEmail string) error {
	raw, hash := newEmailToken()
	var newEmailArg *string
	if newEmail != "" {
		newEmailArg = &newEmail
	}
	if _, err := h.Pool.Exec(r.Context(), `
        INSERT INTO email_tokens (token_hash, user_id, purpose, new_email, expires_at)
        VALUES ($1, $2, 'verify_email', $3, NOW() + interval '24 hours')
    `, hash, userID, newEmailArg); err != nil {
		return err
	}
	link := h.cfg.PublicBaseURL + "/api/v1/auth/verify-email?token=" + raw
	title, body := "E-postanı doğrula", "Concord hesabının e-posta adresini doğrulamak için aşağıdaki butona tıkla. Bağlantı <b>24 saat</b> geçerlidir."
	if newEmail != "" {
		title = "E-posta değişikliğini onayla"
		body = "Concord hesabının e-posta adresini <b>" + newEmail + "</b> olarak değiştirmek istedin. Onaylamak için aşağıdaki butona tıkla."
	}
	return h.Mailer.Send(targetEmail, title, mailer.Layout(title, body, link, "Doğrula"))
}

// VerifyMyEmail — artık gerçek doğrulama maili gönderir (eski self-verify davranışının doğrusu).
func (h *Handler) VerifyMyEmail(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var email string
	var verified bool
	if err := h.Pool.QueryRow(r.Context(),
		`SELECT email, email_verified FROM users WHERE id = $1`, uid).Scan(&email, &verified); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "okunamadı")
		return
	}
	if verified {
		writeJSON(w, http.StatusOK, map[string]any{"sent": false, "already_verified": true})
		return
	}
	if err := h.sendVerifyEmail(r, uid, email, ""); err != nil {
		h.logger.Warn("doğrulama maili gönderilemedi", zap.Error(err))
		writeError(w, http.StatusBadGateway, "mail_failed", "doğrulama maili gönderilemedi — daha sonra tekrar dene")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sent": true})
}

type changeEmailReq struct {
	NewEmail string `json:"new_email"`
	Password string `json:"password"`
}

// ChangeEmail — yeni adrese onay maili gider; adres ancak onaylanınca değişir.
func (h *Handler) ChangeEmail(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req changeEmailReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	newEmail := strings.TrimSpace(req.NewEmail)
	if !validEmail(newEmail) {
		writeError(w, http.StatusBadRequest, "invalid_email", "geçerli bir e-posta adresi gir")
		return
	}
	var passwordHash string
	if err := h.Pool.QueryRow(r.Context(),
		`SELECT password_hash FROM users WHERE id = $1`, uid).Scan(&passwordHash); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "okunamadı")
		return
	}
	ok, err := auth.VerifyPassword(req.Password, passwordHash)
	if err != nil || !ok {
		writeError(w, http.StatusForbidden, "wrong_password", "şifre hatalı")
		return
	}
	var exists int
	if h.Pool.QueryRow(r.Context(), `SELECT 1 FROM users WHERE email = $1`, newEmail).Scan(&exists) == nil {
		writeError(w, http.StatusConflict, "email_taken", "bu e-posta başka bir hesapta kayıtlı")
		return
	}
	if err := h.sendVerifyEmail(r, uid, newEmail, newEmail); err != nil {
		h.logger.Warn("e-posta değişiklik maili gönderilemedi", zap.Error(err))
		writeError(w, http.StatusBadGateway, "mail_failed", "onay maili gönderilemedi — daha sonra tekrar dene")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sent": true, "pending_email": newEmail})
}

// ConfirmEmailVerify — anonim GET (mail bağlantısı); tarayıcıya HTML döner.
func (h *Handler) ConfirmEmailVerify(w http.ResponseWriter, r *http.Request) {
	writeHTML := func(status int, title, msg string) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(status)
		fmt.Fprintf(w, `<!doctype html><html lang="tr"><meta charset="utf-8"><body style="font-family:sans-serif;background:#0E1117;color:#E6EDF3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px"><h2 style="color:#00D9A6">%s</h2><p>%s</p></div></body></html>`, title, msg)
	}
	token := r.URL.Query().Get("token")
	if token == "" {
		writeHTML(http.StatusBadRequest, "Geçersiz bağlantı", "Doğrulama kodu eksik.")
		return
	}
	var userID int64
	var newEmail *string
	err := h.Pool.QueryRow(r.Context(), `
        SELECT user_id, new_email FROM email_tokens
        WHERE token_hash = $1 AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > NOW()
    `, hashEmailToken(token)).Scan(&userID, &newEmail)
	if err != nil {
		writeHTML(http.StatusBadRequest, "Bağlantı geçersiz", "Bu doğrulama bağlantısı geçersiz veya süresi dolmuş. Uygulamadan yeni bir doğrulama isteği gönderebilirsin.")
		return
	}
	if newEmail != nil {
		if _, err := h.Pool.Exec(r.Context(),
			`UPDATE users SET email = $2, email_verified = TRUE, updated_at = NOW() WHERE id = $1`,
			userID, *newEmail); err != nil {
			writeHTML(http.StatusConflict, "Değiştirilemedi", "Bu e-posta adresi başka bir hesapta kayıtlı olabilir.")
			return
		}
	} else {
		_, _ = h.Pool.Exec(r.Context(),
			`UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`, userID)
	}
	_, _ = h.Pool.Exec(r.Context(),
		`UPDATE email_tokens SET used_at = NOW() WHERE token_hash = $1`, hashEmailToken(token))
	writeHTML(http.StatusOK, "✅ E-posta doğrulandı", "Hesabın doğrulandı. Bu pencereyi kapatıp Concord'a dönebilirsin.")
}
