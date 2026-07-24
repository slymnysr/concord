package repo

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DMs struct{ pool *pgxpool.Pool }

func NewDMs(p *pgxpool.Pool) *DMs { return &DMs{pool: p} }

type DMChannel struct {
	OwnerID       *int64    `json:"owner_id,string,omitempty"`
	ID            int64     `json:"id,string"`
	Type          string    `json:"type"` // 'dm' veya 'group_dm'
	Name          string    `json:"name"`
	Participants  []string  `json:"participants"` // string'e çevriliyor (int64 JS'te taşıyor)
	LastMessageID *string   `json:"last_message_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// OpenDirect — 1-1 DM aç veya bul. İki kullanıcı arasında her zaman tek DM.
func (r *DMs) OpenDirect(ctx context.Context, userA, userB int64, newID int64) (int64, error) {
	if userA == userB {
		return 0, errors.New("kendine DM açamazsın")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	// Mevcut DM'i ara: tam olarak bu iki katılımcıyla ve type='dm' olan
	var existingID int64
	err = tx.QueryRow(ctx, `
        SELECT c.id FROM channels c
        WHERE c.type = 'dm'
          AND (SELECT count(*) FROM dm_participants p WHERE p.channel_id = c.id) = 2
          AND EXISTS (SELECT 1 FROM dm_participants WHERE channel_id = c.id AND user_id = $1)
          AND EXISTS (SELECT 1 FROM dm_participants WHERE channel_id = c.id AND user_id = $2)
        LIMIT 1
    `, userA, userB).Scan(&existingID)
	if err == nil {
		_ = tx.Commit(ctx)
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	// Yoksa yeni kanal aç
	_, err = tx.Exec(ctx, `
        INSERT INTO channels (id, type, name, position)
        VALUES ($1, 'dm', 'dm', 0)
    `, newID)
	if err != nil {
		return 0, err
	}
	_, err = tx.Exec(ctx, `
        INSERT INTO dm_participants (channel_id, user_id) VALUES ($1, $2), ($1, $3)
    `, newID, userA, userB)
	if err != nil {
		return 0, err
	}
	return newID, tx.Commit(ctx)
}

// ListForUser — kullanıcının DM kanalları.
// Discord davranışı: sadece en az 1 mesajı olan DM'ler sidebar'da gözükür.
// Mesajsız bir DM (profil kartından "Mesaj" ile yeni açılmış) frontend
// tarafında "aktif" olarak gösterilir; ilk mesajdan sonra listede kalır.
func (r *DMs) ListForUser(ctx context.Context, userID int64) ([]DMChannel, error) {
	rows, err := r.pool.Query(ctx, `
        SELECT c.id, c.type::text, c.name, c.owner_id, c.created_at,
               array_agg(p.user_id) AS participants,
               (SELECT max(m.id)::text FROM messages m WHERE m.channel_id = c.id) AS last_message_id
        FROM channels c
        JOIN dm_participants p ON p.channel_id = c.id
        WHERE c.id IN (SELECT channel_id FROM dm_participants WHERE user_id = $1)
          AND (c.type = 'group_dm' OR EXISTS (SELECT 1 FROM messages m WHERE m.channel_id = c.id))
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []DMChannel
	for rows.Next() {
		var dm DMChannel
		var ids []int64
		if err := rows.Scan(&dm.ID, &dm.Type, &dm.Name, &dm.OwnerID, &dm.CreatedAt, &ids, &dm.LastMessageID); err != nil {
			return nil, err
		}
		dm.Participants = make([]string, len(ids))
		for i, id := range ids {
			dm.Participants[i] = strconv.FormatInt(id, 10)
		}
		list = append(list, dm)
	}
	return list, rows.Err()
}

// Participants — DM kanalının tüm katılımcı user_id'leri
func (r *DMs) Participants(ctx context.Context, channelID int64) ([]int64, error) {
	rows, err := r.pool.Query(ctx, `SELECT user_id FROM dm_participants WHERE channel_id = $1`, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *DMs) IsParticipant(ctx context.Context, channelID, userID int64) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
        SELECT EXISTS(SELECT 1 FROM dm_participants WHERE channel_id = $1 AND user_id = $2)
    `, channelID, userID).Scan(&exists)
	return exists, err
}
