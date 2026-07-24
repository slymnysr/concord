package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/repo"
)

// notifyKeywords — guild mesajında, anahtar kelimesi eşleşen (ve üye olan) kullanıcılara bildirim gönderir.
// already: zaten bildirim alanlar (mention edilenler + yazar) — tekrar bildirme.
func (h *Handler) notifyKeywords(ctx context.Context, ch *repo.Channel, m *repo.Message, already []int64) {
	if ch.GuildID == nil || strings.TrimSpace(m.Content) == "" {
		return
	}
	exclude := map[int64]bool{m.AuthorID: true}
	for _, id := range already {
		exclude[id] = true
	}
	rows, err := h.Pool.Query(ctx, `
		SELECT DISTINCT uk.user_id
		FROM user_keywords uk
		JOIN guild_members gm ON gm.user_id = uk.user_id AND gm.guild_id = $1
		WHERE uk.user_id <> $2
		  AND position(lower(uk.keyword) in lower($3)) > 0
	`, *ch.GuildID, m.AuthorID, m.Content)
	if err != nil {
		return
	}
	var targets []int64
	for rows.Next() {
		var uid int64
		if err := rows.Scan(&uid); err == nil && !exclude[uid] {
			targets = append(targets, uid)
		}
	}
	rows.Close()

	for _, uid := range targets {
		n := &repo.Notification{
			ID:        h.IDs.Next(),
			UserID:    uid,
			Type:      "keyword",
			ChannelID: &m.ChannelID,
			GuildID:   ch.GuildID,
			MessageID: &m.ID,
			ActorID:   &m.AuthorID,
		}
		_ = h.Notifications.Create(ctx, n)
		if h.Redis != nil {
			payload, _ := json.Marshal(map[string]any{
				"type":         "NOTIFICATION",
				"notification": n,
				"ts":           time.Now().UnixMilli(),
			})
			_, _ = h.Redis.Publish(ctx, "concord:user:"+strconv.FormatInt(uid, 10), payload).Result()
		}
	}
}

// GET /api/v1/users/me/keywords
func (h *Handler) ListMyKeywords(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `SELECT keyword FROM user_keywords WHERE user_id = $1 ORDER BY keyword`, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err == nil {
			out = append(out, k)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

type setKeywordsReq struct {
	Keywords []string `json:"keywords"`
}

// PUT /api/v1/users/me/keywords — anahtar kelime listesini tümüyle değiştirir (en fazla 50).
func (h *Handler) SetMyKeywords(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req setKeywordsReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	// Normalize: trim, küçük harf, boş/uzun ele, tekilleştir, max 50
	seen := map[string]bool{}
	clean := []string{}
	for _, k := range req.Keywords {
		k = strings.ToLower(strings.TrimSpace(k))
		if k == "" || len(k) > 50 || seen[k] {
			continue
		}
		seen[k] = true
		clean = append(clean, k)
		if len(clean) >= 50 {
			break
		}
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "tx")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err := tx.Exec(r.Context(), `DELETE FROM user_keywords WHERE user_id = $1`, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "temizlenemedi")
		return
	}
	for _, k := range clean {
		if _, err := tx.Exec(r.Context(), `INSERT INTO user_keywords (user_id, keyword) VALUES ($1, $2) ON CONFLICT DO NOTHING`, uid, k); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "eklenemedi")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "commit")
		return
	}
	writeJSON(w, http.StatusOK, clean)
}
