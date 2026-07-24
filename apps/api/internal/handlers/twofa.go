package handlers

import (
	"context"
	"net/http"

	"github.com/concord/api/internal/auth"
	"github.com/concord/api/internal/middleware"
)

// POST /users/me/2fa/enable — secret üret (henüz aktif değil, verify ile aktifleşir)
func (h *Handler) Enable2FA(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	user, err := h.Users.ByID(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kullanıcı yok")
		return
	}
	if user.TOTPEnabled {
		writeError(w, http.StatusBadRequest, "already_enabled", "2FA zaten etkin")
		return
	}
	secret, err := auth.GenerateTOTPSecret()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "secret üretilemedi")
		return
	}
	if _, err := h.Pool.Exec(r.Context(),
		`UPDATE users SET totp_secret = $1, totp_enabled = FALSE WHERE id = $2`, secret, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"secret":      secret,
		"otpauth_url": auth.OtpauthURL(secret, user.Email),
	})
}

type twofaCodeReq struct {
	Code string `json:"code"`
}

// issueRecoveryCodes — yeni kurtarma kodları üretir, kullanıcının eskilerini değiştirir ve
// DÜZ kodları döndürür. Düz kodlar yalnızca burada döner (DB'de sadece hash) → çağıran
// bunları kullanıcıya BİR KEZ göstermeli.
func (h *Handler) issueRecoveryCodes(ctx context.Context, uid int64) ([]string, error) {
	plain, hashes, err := auth.GenerateRecoveryCodes()
	if err != nil {
		return nil, err
	}
	ids := make([]int64, len(hashes))
	for i := range ids {
		ids[i] = h.IDs.Next()
	}
	if err := h.RecoveryCodes.ReplaceAll(ctx, ids, uid, hashes); err != nil {
		return nil, err
	}
	return plain, nil
}

// POST /users/me/2fa/verify — kodu doğrula, 2FA'yı aktifleştir ve KURTARMA KODLARINI döndür
func (h *Handler) Verify2FA(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req twofaCodeReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	user, err := h.Users.ByID(r.Context(), uid)
	if err != nil || user.TOTPSecret == nil {
		writeError(w, http.StatusBadRequest, "no_secret", "önce 2FA kurulumunu başlat")
		return
	}
	if !auth.ValidateTOTP(*user.TOTPSecret, req.Code) {
		writeError(w, http.StatusBadRequest, "invalid_code", "kod hatalı")
		return
	}
	if _, err := h.Pool.Exec(r.Context(),
		`UPDATE users SET totp_enabled = TRUE WHERE id = $1`, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "etkinleştirilemedi")
		return
	}
	// 2FA aktif → kurtarma kodları üret. Kullanıcıya SADECE BURADA, bir kez gösterilir.
	// Bunlar olmadan authenticator'ını kaybeden kullanıcı hesabına BİR DAHA giremez.
	codes, err := h.issueRecoveryCodes(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kurtarma kodları üretilemedi")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recovery_codes": codes})
}

// POST /users/me/2fa/recovery-codes — geçerli TOTP koduyla kurtarma kodlarını YENİLER.
// Eskiler geçersizleşir. Kullanıcı kodlarını kaybettiyse veya tükettiyse kullanır.
func (h *Handler) RegenerateRecoveryCodes(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req twofaCodeReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	user, err := h.Users.ByID(r.Context(), uid)
	if err != nil || !user.TOTPEnabled || user.TOTPSecret == nil {
		writeError(w, http.StatusBadRequest, "not_enabled", "2FA etkin değil")
		return
	}
	if !auth.ValidateTOTP(*user.TOTPSecret, req.Code) {
		writeError(w, http.StatusBadRequest, "invalid_code", "kod hatalı")
		return
	}
	codes, err := h.issueRecoveryCodes(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kurtarma kodları üretilemedi")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recovery_codes": codes})
}

// POST /users/me/2fa/disable — geçerli kodla 2FA'yı kapat
func (h *Handler) Disable2FA(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req twofaCodeReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	user, err := h.Users.ByID(r.Context(), uid)
	if err != nil || !user.TOTPEnabled || user.TOTPSecret == nil {
		writeError(w, http.StatusBadRequest, "not_enabled", "2FA etkin değil")
		return
	}
	if !auth.ValidateTOTP(*user.TOTPSecret, req.Code) {
		writeError(w, http.StatusBadRequest, "invalid_code", "kod hatalı")
		return
	}
	if _, err := h.Pool.Exec(r.Context(),
		`UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1`, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kapatılamadı")
		return
	}
	// Kurtarma kodları da geçersiz — 2FA kapalıyken anlamları yok, DB'de kalmamalı.
	_ = h.RecoveryCodes.DeleteForUser(r.Context(), uid)
	w.WriteHeader(http.StatusNoContent)
}
