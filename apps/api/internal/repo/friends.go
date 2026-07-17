package repo

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Friendship struct {
	UserAID     int64     `json:"user_a_id,string"`
	UserBID     int64     `json:"user_b_id,string"`
	Status      string    `json:"status"`
	RequestedBy int64     `json:"requested_by,string"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type FriendView struct {
	UserID      int64     `json:"user_id,string"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	AvatarColor string    `json:"avatar_color"`
	Status      string    `json:"status"` // user online/idle/dnd/offline
	Bot         bool      `json:"bot"`
	Friendship  string    `json:"friendship"` // pending_sent, pending_received, accepted
	CreatedAt   time.Time `json:"created_at"`
}

type Friends struct{ pool *pgxpool.Pool }

func NewFriends(p *pgxpool.Pool) *Friends { return &Friends{pool: p} }

func normalize(a, b int64) (int64, int64) {
	if a < b {
		return a, b
	}
	return b, a
}

func (r *Friends) SendRequest(ctx context.Context, requester, target int64) error {
	if requester == target {
		return errors.New("kendine istek atamazsın")
	}
	a, b := normalize(requester, target)
	_, err := r.pool.Exec(ctx, `
        INSERT INTO friendships (user_a_id, user_b_id, status, requested_by)
        VALUES ($1, $2, 'pending', $3)
        ON CONFLICT (user_a_id, user_b_id) DO NOTHING
    `, a, b, requester)
	return err
}

func (r *Friends) Accept(ctx context.Context, me, other int64) error {
	a, b := normalize(me, other)
	tag, err := r.pool.Exec(ctx, `
        UPDATE friendships SET status = 'accepted', updated_at = NOW()
        WHERE user_a_id = $1 AND user_b_id = $2 AND status = 'pending' AND requested_by <> $3
    `, a, b, me)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Friends) Remove(ctx context.Context, me, other int64) error {
	a, b := normalize(me, other)
	tag, err := r.pool.Exec(ctx, `
        DELETE FROM friendships WHERE user_a_id = $1 AND user_b_id = $2
    `, a, b)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListForUser — kabul edilmiş + pending istekleri tek listede döner
func (r *Friends) ListForUser(ctx context.Context, userID int64) ([]FriendView, error) {
	rows, err := r.pool.Query(ctx, `
        SELECT
            CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END AS other_id,
            u.username, u.display_name, u.avatar_color, u.status, u.bot,
            CASE
                WHEN f.status = 'accepted' THEN 'accepted'
                WHEN f.requested_by = $1 THEN 'pending_sent'
                ELSE 'pending_received'
            END AS friendship_state,
            f.created_at
        FROM friendships f
        JOIN users u ON u.id = (CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END)
        WHERE (f.user_a_id = $1 OR f.user_b_id = $1) AND f.status != 'blocked'
        ORDER BY f.created_at DESC
    `, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []FriendView
	for rows.Next() {
		var v FriendView
		if err := rows.Scan(&v.UserID, &v.Username, &v.DisplayName, &v.AvatarColor, &v.Status, &v.Bot, &v.Friendship, &v.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, v)
	}
	return list, rows.Err()
}
