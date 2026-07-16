package repo

import (
	"context"
	"net"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type LoginAttempts struct{ pool *pgxpool.Pool }

func NewLoginAttempts(p *pgxpool.Pool) *LoginAttempts { return &LoginAttempts{pool: p} }

func (r *LoginAttempts) Record(ctx context.Context, id int64, email string, ip net.IP, success bool) error {
	var ipVal any
	if ip != nil {
		ipVal = ip.String()
	}
	_, err := r.pool.Exec(ctx, `
        INSERT INTO login_attempts (id, email, ip, success)
        VALUES ($1, $2, $3, $4)
    `, id, email, ipVal, success)
	return err
}

// FailureCounts — brute-force kararı için üç ayrı sayaç.
//
// Neden ayrı: eskiden tek sorgu `(email = $2 OR ip = $3)` ile sayıp tek eşiğe (5) vuruyordu.
// Bu iki şeyi birden kırıyordu: (1) saldırgan kurbanın e-postasına 5 yanlış parola atıp hesabı
// 15 dk kilitliyordu (hedefli DoS), (2) CGNAT arkasındaki paylaşımlı çıkış IP'sinde 5 yanlış
// giriş o IP'deki HERKESİ kilitliyordu. Türkiye'de operatör CGNAT'ı yaygın; bu tek başına
// üretimde giriş çökertirdi.
//
// Doğru model: IP başına GEVŞEK (kaba kötüye kullanım tavanı), hesap başına SIKI (asıl
// brute-force savunması). EmailIP saldırganı kendi IP'sine hapseder — kurban başka bir IP'den
// girdiği için etkilenmez.
type FailureCounts struct {
	EmailIP int // bu e-posta + bu IP  → asıl kilit (saldırgan kendini kilitler)
	Email   int // bu e-posta, her IP  → dağıtık saldırı tavanı
	IP      int // bu IP, her e-posta  → credential-stuffing tavanı
}

// RecentFailures — `window` içindeki, İLGİLİ E-POSTANIN SON BAŞARILI GİRİŞİNDEN SONRAKİ
// başarısız denemeleri sayar. Başarılı giriş sayacı sıfırlar: parolasını sonunda hatırlayan
// kullanıcı eski hatalarıyla 15 dk cezalı kalmaz.
func (r *LoginAttempts) RecentFailures(ctx context.Context, email string, ip net.IP, window time.Duration) (FailureCounts, error) {
	cutoff := time.Now().Add(-window)
	var ipVal any
	if ip != nil {
		ipVal = ip.String()
	}

	var c FailureCounts
	// last_ok sıfırlaması SADECE e-posta kapsamlı sayaçlara uygulanır: IP sayacı kaba bir
	// kötüye kullanım tavanı, ilgisiz bir hesabın başarılı girişiyle sıfırlanmamalı.
	err := r.pool.QueryRow(ctx, `
        WITH last_ok AS (
            SELECT COALESCE(MAX(created_at), 'epoch'::timestamptz) AS at
            FROM login_attempts
            WHERE success = TRUE AND email = $1 AND created_at > $2
        )
        SELECT
            count(*) FILTER (WHERE email = $1 AND created_at > last_ok.at
                             AND $3::inet IS NOT NULL AND ip = $3::inet),
            count(*) FILTER (WHERE email = $1 AND created_at > last_ok.at),
            count(*) FILTER (WHERE $3::inet IS NOT NULL AND ip = $3::inet)
        FROM login_attempts, last_ok
        WHERE success = FALSE
          AND created_at > $2
          AND (email = $1 OR ($3::inet IS NOT NULL AND ip = $3::inet))
    `, email, cutoff, ipVal).Scan(&c.EmailIP, &c.Email, &c.IP)
	return c, err
}
