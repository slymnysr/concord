package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"strings"
	"time"
)

// TOTP (RFC 6238) — harici bağımlılık olmadan stdlib ile.

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// GenerateTOTPSecret — yeni rastgele base32 secret üretir (160 bit).
func GenerateTOTPSecret() (string, error) {
	buf := make([]byte, 20)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return b32.EncodeToString(buf), nil
}

// hotp — belirli sayaç için 6 haneli kod.
func hotp(secret string, counter uint64) (string, error) {
	key, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return "", err
	}
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, counter)
	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	code := (uint32(sum[offset]&0x7f) << 24) |
		(uint32(sum[offset+1]) << 16) |
		(uint32(sum[offset+2]) << 8) |
		uint32(sum[offset+3])
	return fmt.Sprintf("%06d", code%1000000), nil
}

// ValidateTOTP — kodu ±1 zaman penceresi toleransıyla doğrular (30sn adım).
func ValidateTOTP(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 || secret == "" {
		return false
	}
	counter := uint64(time.Now().Unix() / 30)
	for _, delta := range []int64{0, -1, 1} {
		want, err := hotp(secret, uint64(int64(counter)+delta))
		if err != nil {
			return false
		}
		if hmac.Equal([]byte(want), []byte(code)) {
			return true
		}
	}
	return false
}

// OtpauthURL — authenticator uygulamalarına eklemek için otpauth:// URI'si.
func OtpauthURL(secret, account string) string {
	return fmt.Sprintf("otpauth://totp/Concord:%s?secret=%s&issuer=Concord&algorithm=SHA1&digits=6&period=30", account, secret)
}
