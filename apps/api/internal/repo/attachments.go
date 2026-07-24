package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Attachment struct {
	ID          int64   `json:"id,string"`
	MessageID   int64   `json:"message_id,string"`
	Filename    string  `json:"filename"`
	URL         string  `json:"url"`
	ContentType *string `json:"content_type,omitempty"`
	SizeBytes   int64   `json:"size_bytes"`
	// Sunucunun nesneden tespit ettiği metadata (istemci beyanı değil) — görüntülerde dolu
	Width     *int      `json:"width,omitempty"`
	Height    *int      `json:"height,omitempty"`
	ThumbURL  *string   `json:"thumb_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type Attachments struct{ pool *pgxpool.Pool }

func NewAttachments(p *pgxpool.Pool) *Attachments { return &Attachments{pool: p} }

func (r *Attachments) Create(ctx context.Context, a *Attachment) error {
	_, err := r.pool.Exec(ctx, `
        INSERT INTO attachments (id, message_id, filename, url, content_type, size_bytes,
                                 width, height, thumb_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, a.ID, a.MessageID, a.Filename, a.URL, a.ContentType, a.SizeBytes, a.Width, a.Height, a.ThumbURL)
	return err
}

func (r *Attachments) ForMessage(ctx context.Context, messageID int64) ([]Attachment, error) {
	rows, err := r.pool.Query(ctx, `
        SELECT id, message_id, filename, url, content_type, size_bytes, width, height,
               thumb_url, created_at
        FROM attachments WHERE message_id = $1
    `, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Attachment
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.ID, &a.MessageID, &a.Filename, &a.URL, &a.ContentType, &a.SizeBytes,
			&a.Width, &a.Height, &a.ThumbURL, &a.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, rows.Err()
}
