package repo

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Medya nesnesi durumları
const (
	MediaPending  = "pending"
	MediaClean    = "clean"
	MediaInfected = "infected"
	MediaRejected = "rejected"
)

type MediaObject struct {
	Key           string
	Status        string
	ContentType   string
	SizeBytes     int64
	Width         *int
	Height        *int
	ThumbKey      *string
	ScanSignature *string
	Error         *string
}

type MediaObjects struct{ pool *pgxpool.Pool }

func NewMediaObjects(p *pgxpool.Pool) *MediaObjects { return &MediaObjects{pool: p} }

// Upsert — işleme sonucunu yazar. MinIO olayı aynı nesne için tekrar gelebilir
// (yeniden deneme/yeniden yükleme) → idempotent olmalı.
func (r *MediaObjects) Upsert(ctx context.Context, m MediaObject) error {
	_, err := r.pool.Exec(ctx, `
        INSERT INTO media_objects (key, status, content_type, size_bytes, width, height,
                                   thumb_key, scan_signature, error)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (key) DO UPDATE SET
            status = EXCLUDED.status, content_type = EXCLUDED.content_type,
            size_bytes = EXCLUDED.size_bytes, width = EXCLUDED.width, height = EXCLUDED.height,
            thumb_key = EXCLUDED.thumb_key, scan_signature = EXCLUDED.scan_signature,
            error = EXCLUDED.error, updated_at = NOW()
    `, m.Key, m.Status, m.ContentType, m.SizeBytes, m.Width, m.Height, m.ThumbKey, m.ScanSignature, m.Error)
	return err
}

// ByKey — nesne kaydı; yoksa (nil, nil).
func (r *MediaObjects) ByKey(ctx context.Context, key string) (*MediaObject, error) {
	var m MediaObject
	err := r.pool.QueryRow(ctx, `
        SELECT key, status, COALESCE(content_type,''), size_bytes, width, height,
               thumb_key, scan_signature, error
        FROM media_objects WHERE key = $1
    `, key).Scan(&m.Key, &m.Status, &m.ContentType, &m.SizeBytes, &m.Width, &m.Height,
		&m.ThumbKey, &m.ScanSignature, &m.Error)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}
