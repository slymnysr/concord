package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type RecoveryCodes struct{ pool *pgxpool.Pool }

func NewRecoveryCodes(p *pgxpool.Pool) *RecoveryCodes { return &RecoveryCodes{pool: p} }

// ReplaceAll — kullanıcının TÜM eski kurtarma kodlarını siler ve yeni hash'leri yazar (tek
// transaction). 2FA aktifleşince ve kullanıcı kodları yeniden üretince çağrılır. Atomik:
// yarıda kalırsa ne eski ne yeni kodlar bozulur.
func (r *RecoveryCodes) ReplaceAll(ctx context.Context, ids []int64, userID int64, hashes []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM two_factor_recovery_codes WHERE user_id = $1`, userID); err != nil {
		return err
	}
	for i, h := range hashes {
		if _, err := tx.Exec(ctx,
			`INSERT INTO two_factor_recovery_codes (id, user_id, code_hash) VALUES ($1, $2, $3)`,
			ids[i], userID, h); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// Consume — kurtarma kodunu tek kullanımlık tüketir. ATOMİK: yalnızca used_at IS NULL olan
// satırı işaretler → aynı kod iki kez KULLANILAMAZ (eşzamanlı iki login denemesinde bile
// yalnızca biri başarılı olur). Kod bulunup tüketildiyse true.
func (r *RecoveryCodes) Consume(ctx context.Context, userID int64, codeHash string) (bool, error) {
	ct, err := r.pool.Exec(ctx, `
		UPDATE two_factor_recovery_codes SET used_at = NOW()
		WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`, userID, codeHash)
	if err != nil {
		return false, err
	}
	return ct.RowsAffected() == 1, nil
}

// DeleteForUser — 2FA kapatılınca tüm kodları siler (artık geçersiz).
func (r *RecoveryCodes) DeleteForUser(ctx context.Context, userID int64) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM two_factor_recovery_codes WHERE user_id = $1`, userID)
	return err
}

// CountUnused — kalan kullanılmamış kod sayısı ("n kurtarma kodun kaldı" uyarısı için).
func (r *RecoveryCodes) CountUnused(ctx context.Context, userID int64) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM two_factor_recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
		userID).Scan(&n)
	return n, err
}
