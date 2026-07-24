package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PushSubscription struct {
	UserID   int64
	Platform string
	Endpoint string
	P256DH   string
	Auth     string
}

type PushSubs struct{ pool *pgxpool.Pool }

func NewPushSubs(p *pgxpool.Pool) *PushSubs { return &PushSubs{pool: p} }

// ForUser — kullanıcının ÇALIŞAN abonelikleri (ölü işaretliler hariç).
func (r *PushSubs) ForUser(ctx context.Context, userID int64) ([]PushSubscription, error) {
	rows, err := r.pool.Query(ctx, `
        SELECT user_id, platform, endpoint, COALESCE(p256dh,''), COALESCE(auth,'')
        FROM push_subscriptions
        WHERE user_id = $1 AND failed_at IS NULL
    `, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PushSubscription
	for rows.Next() {
		var s PushSubscription
		if err := rows.Scan(&s.UserID, &s.Platform, &s.Endpoint, &s.P256DH, &s.Auth); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// MarkDead — abonelik ölü (cihaz kaldırıldı / izin iptal). Silmek yerine işaretliyoruz:
// kullanıcı aynı cihazdan tekrar abone olursa upsert satırı diriltir.
func (r *PushSubs) MarkDead(ctx context.Context, userID int64, endpoint string) error {
	_, err := r.pool.Exec(ctx, `
        UPDATE push_subscriptions SET failed_at = NOW()
        WHERE user_id = $1 AND endpoint = $2
    `, userID, endpoint)
	return err
}
