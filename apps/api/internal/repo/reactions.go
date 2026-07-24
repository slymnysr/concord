package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ReactionSummary struct {
	Emoji   string  `json:"emoji"`
	Count   int     `json:"count"`
	Me      bool    `json:"me"`
	UserIDs []int64 `json:"user_ids,omitempty"`
}

type Reactions struct{ pool *pgxpool.Pool }

func NewReactions(p *pgxpool.Pool) *Reactions { return &Reactions{pool: p} }

func (r *Reactions) Add(ctx context.Context, messageID, userID int64, emoji string) error {
	_, err := r.pool.Exec(ctx, `
        INSERT INTO message_reactions (message_id, user_id, emoji)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
    `, messageID, userID, emoji)
	return err
}

func (r *Reactions) Remove(ctx context.Context, messageID, userID int64, emoji string) error {
	_, err := r.pool.Exec(ctx, `
        DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3
    `, messageID, userID, emoji)
	return err
}

// ForMessages — birden çok mesajın reaction özetlerini TEK sorguda getirir (N+1 önler).
// Dönüş: message_id -> özet listesi. Boş girişte boş harita döner.
func (r *Reactions) ForMessages(ctx context.Context, messageIDs []int64, viewerID int64) (map[int64][]ReactionSummary, error) {
	out := make(map[int64][]ReactionSummary, len(messageIDs))
	if len(messageIDs) == 0 {
		return out, nil
	}
	rows, err := r.pool.Query(ctx, `
        SELECT message_id, emoji, count(*)::int, BOOL_OR(user_id = $2)
        FROM message_reactions WHERE message_id = ANY($1)
        GROUP BY message_id, emoji ORDER BY message_id, count DESC, emoji ASC
    `, messageIDs, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var mid int64
		var s ReactionSummary
		if err := rows.Scan(&mid, &s.Emoji, &s.Count, &s.Me); err != nil {
			return nil, err
		}
		out[mid] = append(out[mid], s)
	}
	return out, rows.Err()
}

func (r *Reactions) ForMessage(ctx context.Context, messageID, viewerID int64) ([]ReactionSummary, error) {
	rows, err := r.pool.Query(ctx, `
        SELECT emoji, count(*)::int, BOOL_OR(user_id = $2)
        FROM message_reactions WHERE message_id = $1
        GROUP BY emoji ORDER BY count DESC, emoji ASC
    `, messageID, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []ReactionSummary
	for rows.Next() {
		var s ReactionSummary
		if err := rows.Scan(&s.Emoji, &s.Count, &s.Me); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, rows.Err()
}
