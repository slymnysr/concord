package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/repo"
)

type searchResult struct {
	Message *repo.Message `json:"message"`
	Channel *repo.Channel `json:"channel"`
	Author  *repo.User    `json:"author,omitempty"`
}

func (h *Handler) SearchMessages(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	guildID := r.URL.Query().Get("guild_id")
	channelID := r.URL.Query().Get("channel_id")
	authorID := r.URL.Query().Get("author_id")

	// Operatör var mı? (metin yoksa bile operatörle arama yapılabilsin)
	hasOps := authorID != "" || channelID != "" ||
		r.URL.Query().Get("mentions") != "" || r.URL.Query().Get("pinned") != "" ||
		r.URL.Query().Get("before") != "" || r.URL.Query().Get("after") != "" ||
		r.URL.Query().Get("during") != "" || len(r.URL.Query()["has"]) > 0
	if q == "" && !hasOps {
		writeJSON(w, http.StatusOK, []searchResult{})
		return
	}

	uid := middleware.UserIDFrom(r.Context())

	// Sadece kullanıcının üye olduğu sunucuların kanalları + DM'leri
	args := []any{uid}
	where := `
        (
            (c.guild_id IS NOT NULL AND EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = c.guild_id AND gm.user_id = $1))
            OR (c.guild_id IS NULL AND EXISTS (SELECT 1 FROM dm_participants dp WHERE dp.channel_id = c.id AND dp.user_id = $1))
        )
    `
	if q != "" {
		args = append(args, q)
		where += " AND m.search_vector @@ plainto_tsquery('simple', $" + strconv.Itoa(len(args)) + ")"
	}
	if guildID != "" {
		if gid, err := strconv.ParseInt(guildID, 10, 64); err == nil {
			args = append(args, gid)
			where += " AND c.guild_id = $" + strconv.Itoa(len(args))
		}
	}
	if channelID != "" {
		if cid, err := strconv.ParseInt(channelID, 10, 64); err == nil {
			args = append(args, cid)
			where += " AND m.channel_id = $" + strconv.Itoa(len(args))
		}
	}
	if authorID != "" {
		if aid, err := strconv.ParseInt(authorID, 10, 64); err == nil {
			args = append(args, aid)
			where += " AND m.author_id = $" + strconv.Itoa(len(args))
		}
	}

	// has: link | image | video | sound | file | embed
	for _, hv := range r.URL.Query()["has"] {
		for _, h := range strings.Split(hv, ",") {
			switch strings.ToLower(strings.TrimSpace(h)) {
			case "link", "embed":
				where += ` AND m.content ~* 'https?://'`
			case "image":
				where += ` AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.content_type LIKE 'image/%')`
			case "video":
				where += ` AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.content_type LIKE 'video/%')`
			case "sound", "audio":
				where += ` AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.content_type LIKE 'audio/%')`
			case "file":
				where += ` AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id)`
			}
		}
	}

	// mentions: <user_id>
	if mentions := r.URL.Query().Get("mentions"); mentions != "" {
		if mid, err := strconv.ParseInt(mentions, 10, 64); err == nil {
			args = append(args, mid)
			where += " AND EXISTS (SELECT 1 FROM message_mentions mm WHERE mm.message_id = m.id AND mm.user_id = $" + strconv.Itoa(len(args)) + ")"
		}
	}

	// pinned: true
	if strings.EqualFold(r.URL.Query().Get("pinned"), "true") {
		where += " AND EXISTS (SELECT 1 FROM channel_pins cp WHERE cp.message_id = m.id)"
	}

	// before / after / during (YYYY-MM-DD, yerel olmayan UTC kabul)
	if v := r.URL.Query().Get("before"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			args = append(args, t)
			where += " AND m.created_at < $" + strconv.Itoa(len(args))
		}
	}
	if v := r.URL.Query().Get("after"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			args = append(args, t.Add(24*time.Hour))
			where += " AND m.created_at >= $" + strconv.Itoa(len(args))
		}
	}
	if v := r.URL.Query().Get("during"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			args = append(args, t)
			args = append(args, t.Add(24*time.Hour))
			where += " AND m.created_at >= $" + strconv.Itoa(len(args)-1) + " AND m.created_at < $" + strconv.Itoa(len(args))
		}
	}

	args = append(args, limit)
	query := `
        SELECT m.id, m.channel_id, m.author_id, m.content, m.edited_at, m.created_at,
               c.id, c.guild_id, c.type::text, c.name, c.position
        FROM messages m
        JOIN channels c ON c.id = m.channel_id
        WHERE ` + where + `
        ORDER BY m.id DESC
        LIMIT $` + strconv.Itoa(len(args)) + `
    `

	rows, err := h.Pool.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "arama hatası: "+err.Error())
		return
	}
	defer rows.Close()

	authorIDs := map[int64]bool{}
	var results []searchResult
	for rows.Next() {
		var m repo.Message
		var c repo.Channel
		if err := rows.Scan(
			&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.EditedAt, &m.CreatedAt,
			&c.ID, &c.GuildID, &c.Type, &c.Name, &c.Position,
		); err != nil {
			continue
		}
		authorIDs[m.AuthorID] = true
		results = append(results, searchResult{Message: &m, Channel: &c})
	}

	// Author bilgilerini çek
	if len(authorIDs) > 0 {
		ids := make([]int64, 0, len(authorIDs))
		for id := range authorIDs {
			ids = append(ids, id)
		}
		authors := map[int64]*repo.User{}
		urows, _ := h.Pool.Query(r.Context(), `
            SELECT id, username, email, display_name, password_hash, avatar_color, avatar_url, bio, status, bot, created_at
            FROM users WHERE id = ANY($1)
        `, ids)
		if urows != nil {
			defer urows.Close()
			for urows.Next() {
				u := &repo.User{}
				if err := urows.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.PasswordHash,
					&u.AvatarColor, &u.AvatarURL, &u.Bio, &u.Status, &u.Bot, &u.CreatedAt); err == nil {
					authors[u.ID] = u
				}
			}
		}
		for i := range results {
			results[i].Author = authors[results[i].Message.AuthorID]
		}
	}

	if results == nil {
		results = []searchResult{}
	}
	writeJSON(w, http.StatusOK, results)
}
