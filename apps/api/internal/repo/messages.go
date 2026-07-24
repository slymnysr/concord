package repo

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Message struct {
	ID              int64             `json:"id,string"`
	ChannelID       int64             `json:"channel_id,string"`
	AuthorID        int64             `json:"author_id,string"`
	Content         string            `json:"content"`
	EditedAt        *time.Time        `json:"edited_at,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
	RepliedToID     *int64            `json:"replied_to_id,string,omitempty"`
	MentionEveryone bool              `json:"mention_everyone,omitempty"`
	System          bool              `json:"system,omitempty"`
	PublishedAt     *time.Time        `json:"published_at,omitempty"`
	Attachments     []Attachment      `json:"attachments,omitempty"`
	Embeds          []json.RawMessage `json:"embeds,omitempty"` // zengin embed payload'ları
	WebhookUsername *string           `json:"webhook_username,omitempty"`
	WebhookAvatar   *string           `json:"webhook_avatar,omitempty"`
	// Reactions — mesaj listesinde gömülü gelir (viewer'a göre "me"); N+1 önler.
	Reactions []ReactionSummary `json:"reactions,omitempty"`
}

type Messages struct{ pool *pgxpool.Pool }

func NewMessages(p *pgxpool.Pool) *Messages { return &Messages{pool: p} }

func (r *Messages) Create(ctx context.Context, m *Message) error {
	_, err := r.pool.Exec(ctx, `
        INSERT INTO messages (id, channel_id, author_id, content, replied_to_id, system)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, m.ID, m.ChannelID, m.AuthorID, m.Content, m.RepliedToID, m.System)
	return err
}

func (r *Messages) ByID(ctx context.Context, id int64) (*Message, error) {
	m := &Message{}
	err := r.pool.QueryRow(ctx, `
        SELECT id, channel_id, author_id, content, edited_at, created_at, replied_to_id, mention_everyone, published_at, system
        FROM messages WHERE id = $1
    `, id).Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.EditedAt, &m.CreatedAt, &m.RepliedToID, &m.MentionEveryone, &m.PublishedAt, &m.System)
	return m, err
}

func (r *Messages) UpdateContent(ctx context.Context, id, authorID int64, content string) error {
	tag, err := r.pool.Exec(ctx, `
        UPDATE messages SET content = $3, edited_at = NOW()
        WHERE id = $1 AND author_id = $2
    `, id, authorID, content)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Messages) Delete(ctx context.Context, id int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM messages WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListByChannel — id < before sayfalama (yeniden eskiye), Discord patterni
func (r *Messages) ListByChannel(ctx context.Context, channelID int64, before int64, limit int) ([]Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	args := []any{channelID, limit}
	q := `
        SELECT id, channel_id, author_id, content, edited_at, created_at, replied_to_id, mention_everyone, published_at, system
        FROM messages
        WHERE channel_id = $1
    `
	if before > 0 {
		q += ` AND id < $3`
		args = append(args, before)
	}
	q += ` ORDER BY id DESC LIMIT $2`

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Message
	idIndex := map[int64]int{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.EditedAt, &m.CreatedAt, &m.RepliedToID, &m.MentionEveryone, &m.PublishedAt, &m.System); err != nil {
			return nil, err
		}
		idIndex[m.ID] = len(list)
		list = append(list, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return list, nil
	}

	// Attachment'ları toplu çek
	ids := make([]int64, 0, len(list))
	for _, m := range list {
		ids = append(ids, m.ID)
	}
	// width/height/thumb_url ŞART: UI mesaj listesini BURADAN alır. Eksik bırakıldığında
	// (eski hali) her görsel satır içinde TAM BOY iniyordu ve <img> boyutsuz olduğu için
	// liste ziplıyordu — ForMessage doğru seçiyordu, bu toplu sorgu unutulmuştu.
	attRows, err := r.pool.Query(ctx, `
        SELECT id, message_id, filename, url, content_type, size_bytes,
               width, height, thumb_url, created_at
        FROM attachments WHERE message_id = ANY($1)
    `, ids)
	if err != nil {
		return list, nil // attachment hatası mesajları engellemesin
	}
	defer attRows.Close()
	for attRows.Next() {
		var a Attachment
		if err := attRows.Scan(&a.ID, &a.MessageID, &a.Filename, &a.URL, &a.ContentType, &a.SizeBytes,
			&a.Width, &a.Height, &a.ThumbURL, &a.CreatedAt); err != nil {
			continue
		}
		if i, ok := idIndex[a.MessageID]; ok {
			list[i].Attachments = append(list[i].Attachments, a)
		}
	}

	// Zengin embed'leri toplu çek (payload JSON)
	embRows, err := r.pool.Query(ctx, `
        SELECT message_id, payload
        FROM message_embeds WHERE message_id = ANY($1) AND embed_type = 'rich' AND payload IS NOT NULL
        ORDER BY id ASC
    `, ids)
	if err == nil {
		defer embRows.Close()
		for embRows.Next() {
			var mid int64
			var payload json.RawMessage
			if err := embRows.Scan(&mid, &payload); err != nil {
				continue
			}
			if i, ok := idIndex[mid]; ok {
				list[i].Embeds = append(list[i].Embeds, payload)
			}
		}
	}

	// Webhook isim/avatar override'larını toplu çek
	whRows, err := r.pool.Query(ctx, `SELECT message_id, username, avatar_url FROM message_webhook WHERE message_id = ANY($1)`, ids)
	if err == nil {
		defer whRows.Close()
		for whRows.Next() {
			var mid int64
			var uname, avatar *string
			if err := whRows.Scan(&mid, &uname, &avatar); err != nil {
				continue
			}
			if i, ok := idIndex[mid]; ok {
				list[i].WebhookUsername = uname
				list[i].WebhookAvatar = avatar
			}
		}
	}
	return list, nil
}
