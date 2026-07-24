package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	AccessTTL  = 15 * time.Minute
	RefreshTTL = 30 * 24 * time.Hour
)

type Claims struct {
	// uid,string: Snowflake ID'ler 64-bit; JS Number 53-bit tutar. JSON'a string
	// olarak yazılır ki JS tüketiciler (voice sunucusu) hassasiyet kaybetmesin.
	// Go tarafı yine int64 okur (kayıpsız).
	UserID int64 `json:"uid,string"`
	// name: kullanıcının görünen adı — voice presence gibi yerlerde ID→ad lookup'ı
	// gerektirmeden doğrudan gösterim için taşınır.
	Name string `json:"name,omitempty"`
	jwt.RegisteredClaims
}

type Issuer struct {
	secret []byte
}

func NewIssuer(secret string) *Issuer {
	return &Issuer{secret: []byte(secret)}
}

func (i *Issuer) AccessToken(userID int64, name string) (string, time.Time, error) {
	exp := time.Now().Add(AccessTTL)
	claims := Claims{
		UserID: userID,
		Name:   name,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(userID, 10),
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "concord-api",
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(i.secret)
	return signed, exp, err
}

// Verify — sadece access token doğrulaması
func (i *Issuer) Verify(token string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("auth: beklenmeyen imza algoritması")
		}
		return i.secret, nil
	})
	if err != nil {
		return nil, err
	}
	c, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("auth: token geçersiz")
	}
	return c, nil
}

// RefreshToken — opak rastgele dize üret. Veritabanında hash'i tutarız.
func NewRefreshToken() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	raw = hex.EncodeToString(b)
	h := sha256.Sum256([]byte(raw))
	hash = hex.EncodeToString(h[:])
	return raw, hash, nil
}

func HashToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}
