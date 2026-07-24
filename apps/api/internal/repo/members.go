package repo

import (
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Member struct {
	UserID         int64      `json:"user_id,string"`
	GuildID        int64      `json:"guild_id,string"`
	Nickname       *string    `json:"nickname,omitempty"`
	GuildAvatarURL *string    `json:"guild_avatar_url,omitempty"`
	GuildBio       *string    `json:"guild_bio,omitempty"`
	JoinedAt       time.Time  `json:"joined_at"`
	TimeoutUntil   *time.Time `json:"timeout_until,omitempty"`
	Username       string     `json:"username"`
	DisplayName    string     `json:"display_name"`
	AvatarColor    string     `json:"avatar_color"`
	Status         string     `json:"status"`
	Bot            bool       `json:"bot"`
	RoleIDs        []string   `json:"role_ids"`
}

type Members struct{ pool *pgxpool.Pool }

func NewMembers(p *pgxpool.Pool) *Members { return &Members{pool: p} }

func (r *Members) ForGuild(ctx context.Context, guildID int64) ([]Member, error) {
	rows, err := r.pool.Query(ctx, `
        SELECT m.user_id, m.guild_id, m.nickname, m.guild_avatar_url, m.guild_bio, m.joined_at, m.timeout_until,
               u.username, u.display_name, u.avatar_color, u.status, u.bot,
               COALESCE(array_agg(mr.role_id) FILTER (WHERE mr.role_id IS NOT NULL), '{}') AS role_ids
        FROM guild_members m
        JOIN users u ON u.id = m.user_id
        LEFT JOIN member_roles mr ON mr.guild_id = m.guild_id AND mr.user_id = m.user_id
        WHERE m.guild_id = $1
        GROUP BY m.user_id, m.guild_id, m.nickname, m.guild_avatar_url, m.guild_bio, m.joined_at, m.timeout_until,
                 u.username, u.display_name, u.avatar_color, u.status, u.bot
        ORDER BY u.display_name ASC
    `, guildID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Member
	for rows.Next() {
		var m Member
		var ids []int64
		if err := rows.Scan(&m.UserID, &m.GuildID, &m.Nickname, &m.GuildAvatarURL, &m.GuildBio, &m.JoinedAt, &m.TimeoutUntil,
			&m.Username, &m.DisplayName, &m.AvatarColor, &m.Status, &m.Bot, &ids); err != nil {
			return nil, err
		}
		m.RoleIDs = make([]string, len(ids))
		for i, id := range ids {
			m.RoleIDs[i] = strconv.FormatInt(id, 10)
		}
		list = append(list, m)
	}
	return list, rows.Err()
}
