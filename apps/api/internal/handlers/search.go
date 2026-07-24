package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/repo"
	"github.com/concord/api/internal/search"
)

type searchResult struct {
	Message *repo.Message `json:"message"`
	Channel *repo.Channel `json:"channel"`
	Author  *repo.User    `json:"author,omitempty"`
}

// SearchMessages — arama. Motor (Meilisearch veya Postgres FTS) yalnızca SIRALI ID döndürür;
// içerik/yetki tazeliği DB'den doğrulanır.
//
// NEDEN İKİ AŞAMA: indeks bayat olabilir (silinmiş mesaj, kaldırılan üyelik). Motorun
// döndürdüğü ID'leri DB'den okuyup ORADA da yetki kontrolü yapmak, indeks gecikmesinin
// veri sızdırmasını engeller. Yetki ayrıca indekste de uygulanır (allowedChannels) —
// yalnızca sonradan elemek, motorun ilk N sonucu yetkisizse boş sayfa döndürürdü.
func (h *Handler) SearchMessages(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	uid := middleware.UserIDFrom(r.Context())

	// Operatör var mı? (metin yoksa bile operatörle arama yapılabilsin)
	hasOps := r.URL.Query().Get("author_id") != "" || r.URL.Query().Get("channel_id") != "" ||
		r.URL.Query().Get("mentions") != "" || r.URL.Query().Get("pinned") != "" ||
		r.URL.Query().Get("before") != "" || r.URL.Query().Get("after") != "" ||
		r.URL.Query().Get("during") != "" || len(r.URL.Query()["has"]) > 0
	if q == "" && !hasOps {
		writeJSON(w, http.StatusOK, []searchResult{})
		return
	}

	// Kullanıcının OKUYABİLDİĞİ kanallar — motora filtre olarak verilir
	allowed, err := h.readableChannelIDs(r, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kanal listesi alınamadı")
		return
	}
	if len(allowed) == 0 {
		writeJSON(w, http.StatusOK, []searchResult{})
		return
	}

	sq := search.Query{
		Text:              q,
		AllowedChannelIDs: allowed,
		Limit:             limit,
		SortRecent:        r.URL.Query().Get("sort") == "recent" || q == "",
	}
	if v := r.URL.Query().Get("channel_id"); v != "" {
		if id, e := strconv.ParseInt(v, 10, 64); e == nil {
			sq.ChannelID = &id
		}
	}
	if v := r.URL.Query().Get("guild_id"); v != "" {
		if id, e := strconv.ParseInt(v, 10, 64); e == nil {
			sq.GuildID = &id
		}
	}
	if v := r.URL.Query().Get("author_id"); v != "" {
		if id, e := strconv.ParseInt(v, 10, 64); e == nil {
			sq.AuthorID = &id
		}
	}
	if v := r.URL.Query().Get("before"); v != "" {
		if t, e := time.Parse(time.RFC3339, v); e == nil {
			sq.Before = &t
		}
	}
	if v := r.URL.Query().Get("after"); v != "" {
		if t, e := time.Parse(time.RFC3339, v); e == nil {
			sq.After = &t
		}
	}
	if v := r.URL.Query().Get("pinned"); v != "" {
		b := v == "true"
		sq.Pinned = &b
	}
	for _, hv := range r.URL.Query()["has"] {
		switch hv {
		case "image", "file":
			sq.HasImage = true
		case "link":
			sq.HasLink = true
		}
	}

	ids, err := h.Search.Search(r.Context(), sq)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "arama hatası: "+err.Error())
		return
	}
	if len(ids) == 0 {
		writeJSON(w, http.StatusOK, []searchResult{})
		return
	}

	results, err := h.hydrateSearch(r, ids, allowed)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "sonuçlar okunamadı")
		return
	}
	writeJSON(w, http.StatusOK, results)
}

// readableChannelIDs — kullanıcının üye olduğu sunucuların kanalları + DM'leri.
func (h *Handler) readableChannelIDs(r *http.Request, uid int64) ([]int64, error) {
	rows, err := h.Pool.Query(r.Context(), `
        SELECT c.id FROM channels c
        WHERE (c.guild_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM guild_members gm WHERE gm.guild_id = c.guild_id AND gm.user_id = $1))
           OR (c.guild_id IS NULL AND EXISTS (
                  SELECT 1 FROM dm_participants dp WHERE dp.channel_id = c.id AND dp.user_id = $1))
    `, uid)
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

// hydrateSearch — motorun SIRASINI koruyarak mesajları DB'den okur.
func (h *Handler) hydrateSearch(r *http.Request, ids []int64, allowed []int64) ([]searchResult, error) {
	rows, err := h.Pool.Query(r.Context(), `
        SELECT m.id, m.channel_id, m.author_id, m.content, m.edited_at, m.created_at,
               c.id, c.guild_id, c.type::text, c.name, c.position
        FROM messages m
        JOIN channels c ON c.id = m.channel_id
        WHERE m.id = ANY($1) AND m.channel_id = ANY($2)
    `, ids, allowed)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byID := map[int64]searchResult{}
	authorIDs := map[int64]bool{}
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
		byID[m.ID] = searchResult{Message: &m, Channel: &c}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	authors := map[int64]*repo.User{}
	if len(authorIDs) > 0 {
		aids := make([]int64, 0, len(authorIDs))
		for id := range authorIDs {
			aids = append(aids, id)
		}
		urows, err := h.Pool.Query(r.Context(), `
            SELECT id, username, email, display_name, password_hash, avatar_color, avatar_url, bio, status, bot, created_at
            FROM users WHERE id = ANY($1)
        `, aids)
		if err == nil {
			defer urows.Close()
			for urows.Next() {
				var u repo.User
				if err := urows.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.PasswordHash,
					&u.AvatarColor, &u.AvatarURL, &u.Bio, &u.Status, &u.Bot, &u.CreatedAt); err == nil {
					authors[u.ID] = &u
				}
			}
		}
	}

	// MOTORUN SIRASI korunur: map iterasyonu Go'da rastgeledir, ID sırasına göre
	// dizmek alaka sıralamasını yok ederdi.
	out := make([]searchResult, 0, len(ids))
	for _, id := range ids {
		if res, ok := byID[id]; ok {
			res.Author = authors[res.Message.AuthorID]
			out = append(out, res)
		}
	}
	return out, nil
}
