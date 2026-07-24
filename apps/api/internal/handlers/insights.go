package handlers

import (
	"net/http"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

type insightTop struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type insightPoint struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type insightsView struct {
	MemberCount     int            `json:"member_count"`
	NewMembers7d    int            `json:"new_members_7d"`
	NewMembers30d   int            `json:"new_members_30d"`
	Messages7d      int            `json:"messages_7d"`
	Messages30d     int            `json:"messages_30d"`
	TopChannels     []insightTop   `json:"top_channels"`
	TopMembers      []insightTop   `json:"top_members"`
	MemberGrowth    []insightPoint `json:"member_growth"`    // son 14 gün, günlük yeni üye
	MessageActivity []insightPoint `json:"message_activity"` // son 14 gün, günlük mesaj
}

// GET /api/v1/guilds/{id}/insights — sunucu analizleri (ManageGuild gerekir).
func (h *Handler) GetGuildInsights(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageGuild, w) {
		return
	}
	ctx := r.Context()
	v := insightsView{TopChannels: []insightTop{}, TopMembers: []insightTop{}, MemberGrowth: []insightPoint{}, MessageActivity: []insightPoint{}}

	_ = h.Pool.QueryRow(ctx, `SELECT count(*) FROM guild_members WHERE guild_id = $1`, guildID).Scan(&v.MemberCount)
	_ = h.Pool.QueryRow(ctx, `SELECT count(*) FROM guild_members WHERE guild_id = $1 AND joined_at > now() - interval '7 days'`, guildID).Scan(&v.NewMembers7d)
	_ = h.Pool.QueryRow(ctx, `SELECT count(*) FROM guild_members WHERE guild_id = $1 AND joined_at > now() - interval '30 days'`, guildID).Scan(&v.NewMembers30d)
	_ = h.Pool.QueryRow(ctx, `
		SELECT count(*) FROM messages m JOIN channels c ON c.id = m.channel_id
		WHERE c.guild_id = $1 AND m.created_at > now() - interval '7 days'`, guildID).Scan(&v.Messages7d)
	_ = h.Pool.QueryRow(ctx, `
		SELECT count(*) FROM messages m JOIN channels c ON c.id = m.channel_id
		WHERE c.guild_id = $1 AND m.created_at > now() - interval '30 days'`, guildID).Scan(&v.Messages30d)

	// En aktif kanallar (son 30 gün)
	if rows, err := h.Pool.Query(ctx, `
		SELECT c.id::text, c.name, count(*) AS cnt
		FROM messages m JOIN channels c ON c.id = m.channel_id
		WHERE c.guild_id = $1 AND m.created_at > now() - interval '30 days'
		GROUP BY c.id, c.name ORDER BY cnt DESC LIMIT 5`, guildID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var t insightTop
			if rows.Scan(&t.ID, &t.Name, &t.Count) == nil {
				v.TopChannels = append(v.TopChannels, t)
			}
		}
	}

	// En aktif üyeler (son 30 gün)
	if rows, err := h.Pool.Query(ctx, `
		SELECT u.id::text, u.display_name, count(*) AS cnt
		FROM messages m
		JOIN channels c ON c.id = m.channel_id
		JOIN users u ON u.id = m.author_id
		WHERE c.guild_id = $1 AND m.created_at > now() - interval '30 days'
		GROUP BY u.id, u.display_name ORDER BY cnt DESC LIMIT 5`, guildID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var t insightTop
			if rows.Scan(&t.ID, &t.Name, &t.Count) == nil {
				v.TopMembers = append(v.TopMembers, t)
			}
		}
	}

	// Üye büyümesi — son 14 gün, günlük (sıfır günler dahil)
	if rows, err := h.Pool.Query(ctx, `
		SELECT to_char(d.day, 'YYYY-MM-DD'), COALESCE(g.cnt, 0)
		FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') AS d(day)
		LEFT JOIN (
			SELECT date_trunc('day', joined_at) AS day, count(*) AS cnt
			FROM guild_members WHERE guild_id = $1 AND joined_at > now() - interval '14 days'
			GROUP BY 1
		) g ON g.day = d.day
		ORDER BY d.day`, guildID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var p insightPoint
			if rows.Scan(&p.Date, &p.Count) == nil {
				v.MemberGrowth = append(v.MemberGrowth, p)
			}
		}
	}

	// Mesaj aktivitesi — son 14 gün, günlük
	if rows, err := h.Pool.Query(ctx, `
		SELECT to_char(d.day, 'YYYY-MM-DD'), COALESCE(g.cnt, 0)
		FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') AS d(day)
		LEFT JOIN (
			SELECT date_trunc('day', m.created_at) AS day, count(*) AS cnt
			FROM messages m JOIN channels c ON c.id = m.channel_id
			WHERE c.guild_id = $1 AND m.created_at > now() - interval '14 days'
			GROUP BY 1
		) g ON g.day = d.day
		ORDER BY d.day`, guildID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var p insightPoint
			if rows.Scan(&p.Date, &p.Count) == nil {
				v.MessageActivity = append(v.MessageActivity, p)
			}
		}
	}

	writeJSON(w, http.StatusOK, v)
}
