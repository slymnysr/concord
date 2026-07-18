package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// RecoveryCodeCount — 2FA kurulumunda üretilen tek kullanımlık kurtarma kodu adedi.
const RecoveryCodeCount = 10

// GenerateRecoveryCodes — N tek kullanımlık kurtarma kodu üretir. Düz kodları (kullanıcıya
// SADECE BİR KEZ gösterilir, sonra geri alınamaz) ve SHA-256 hash'lerini (DB'ye yazılır)
// döndürür. Hata yalnızca sistemin rastgelelik kaynağı çökerse oluşur.
func GenerateRecoveryCodes() (plain, hashes []string, err error) {
	for i := 0; i < RecoveryCodeCount; i++ {
		b := make([]byte, 8) // 64 bit entropi — brute-force edilemez
		if _, err = rand.Read(b); err != nil {
			return nil, nil, err
		}
		code := strings.ToLower(b32.EncodeToString(b)) // ~13 karakter, A-Z2-7 (b32, totp.go)
		code = code[:5] + "-" + code[5:]               // "xxxxx-xxxxxxxx" okunur biçim
		plain = append(plain, code)
		hashes = append(hashes, HashRecoveryCode(code))
	}
	return plain, hashes, nil
}

// HashRecoveryCode — kodu normalize edip (küçük harf; tire/boşluk atılır) SHA-256'lar. Login'de
// aynı normalizasyon uygulanır → kullanıcı kodu tireli/tiresiz veya BÜYÜK harfle girse de
// eşleşir. Kodlar yüksek entropili (64 bit rastgele) olduğundan SHA-256 yeterlidir; parola
// gibi salt/argon gerekmez (rainbow table / brute-force uygulanamaz).
func HashRecoveryCode(code string) string {
	norm := strings.ToLower(strings.TrimSpace(code))
	norm = strings.ReplaceAll(norm, "-", "")
	norm = strings.ReplaceAll(norm, " ", "")
	sum := sha256.Sum256([]byte(norm))
	return hex.EncodeToString(sum[:])
}
