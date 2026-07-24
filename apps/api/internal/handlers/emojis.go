package handlers

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

var emojiNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{2,32}$`)

type createEmojiReq struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	Animated bool   `json:"animated,omitempty"`
}

type emojiView struct {
	ID        string `json:"id"`
	GuildID   string `json:"guild_id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	Animated  bool   `json:"animated"`
	CreatorID string `json:"creator_id"`
	CreatedAt string `json:"created_at"`
}

func (h *Handler) CreateEmoji(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageEmojis, w) {
		return
	}
	var req createEmojiReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if !emojiNameRegex.MatchString(req.Name) {
		writeError(w, http.StatusBadRequest, "invalid_name", "2-32 karakter, sadece a-z A-Z 0-9 _")
		return
	}
	if req.URL == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "url gerekli (önce /uploads/presign ile yükle)")
		return
	}
	id := h.IDs.Next()
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO guild_emojis (id, guild_id, name, url, animated, creator_id)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, id, guildID, req.Name, req.URL, req.Animated, uid)
	if err != nil {
		writeError(w, http.StatusBadRequest, "conflict", "isim zaten kullanılıyor olabilir")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_EMOJIS_UPDATE", map[string]any{})
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": id, "guild_id": guildID, "name": req.Name, "url": req.URL, "animated": req.Animated,
	})
}

func (h *Handler) ListEmojis(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ok, _ := h.Guilds.IsMember(r.Context(), guildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	rows, err := h.Pool.Query(r.Context(), `
        SELECT id::text, guild_id::text, name, url, animated, creator_id::text, created_at::text
        FROM guild_emojis WHERE guild_id = $1 ORDER BY name ASC
    `, guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []emojiView{}
	for rows.Next() {
		var e emojiView
		if err := rows.Scan(&e.ID, &e.GuildID, &e.Name, &e.URL, &e.Animated, &e.CreatorID, &e.CreatedAt); err == nil {
			out = append(out, e)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) DeleteEmoji(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	emojiID, err := parseID(r, "emojiID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "emoji id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageEmojis, w) {
		return
	}
	tag, err := h.Pool.Exec(r.Context(),
		`DELETE FROM guild_emojis WHERE id = $1 AND guild_id = $2`, emojiID, guildID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "emoji yok")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_EMOJIS_UPDATE", map[string]any{})
	w.WriteHeader(http.StatusNoContent)
}
