package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

type createGuildReq struct {
	Name      string `json:"name"`
	IconText  string `json:"icon_text,omitempty"`
	IconColor string `json:"icon_color,omitempty"`
}

func (h *Handler) CreateGuild(w http.ResponseWriter, r *http.Request) {
	var req createGuildReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if len(req.Name) < 2 || len(req.Name) > 64 {
		writeError(w, http.StatusBadRequest, "invalid_name", "sunucu adı 2-64 karakter olmalı")
		return
	}
	if req.IconText == "" {
		req.IconText = strings.ToUpper(req.Name[:1])
		if len(req.Name) >= 2 {
			req.IconText = strings.ToUpper(req.Name[:2])
		}
	}
	if req.IconColor == "" {
		req.IconColor = "#00D9A6"
	}

	uid := middleware.UserIDFrom(r.Context())
	g := &repo.Guild{
		ID:        h.IDs.Next(),
		Name:      req.Name,
		IconText:  req.IconText,
		IconColor: req.IconColor,
		OwnerID:   uid,
		IsPublic:  true, // yeni sunucular varsayılan keşfedilebilir (sonra gizlilik toggle'ı eklenebilir)
	}
	if err := h.Guilds.Create(r.Context(), g); err != nil {
		h.logger.Error("guild create", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "sunucu oluşturulamadı")
		return
	}

	// Varsayılan kanal: #genel (text)
	defaultCh := &repo.Channel{
		ID:       h.IDs.Next(),
		GuildID:  &g.ID,
		Type:     "text",
		Name:     "genel",
		Position: 0,
	}
	if err := h.Channels.Create(r.Context(), defaultCh); err != nil {
		h.logger.Warn("default channel create", zap.Error(err))
	}
	// Varsayılan ses kanalı: Genel (voice) — sidebar'da "Ses Kanalları" altında gözükür
	voiceCh := &repo.Channel{
		ID:       h.IDs.Next(),
		GuildID:  &g.ID,
		Type:     "voice",
		Name:     "Genel",
		Position: 1,
	}
	if err := h.Channels.Create(r.Context(), voiceCh); err != nil {
		h.logger.Warn("default voice channel create", zap.Error(err))
	}

	writeJSON(w, http.StatusCreated, g)
}

func (h *Handler) ListMyGuilds(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	list, err := h.Guilds.ForUser(r.Context(), uid)
	if err != nil {
		h.logger.Error("list guilds", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "sunucular alınamadı")
		return
	}
	if list == nil {
		list = []repo.Guild{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) GetGuild(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ok, err := h.Guilds.IsMember(r.Context(), id, uid)
	if err != nil || !ok {
		writeError(w, http.StatusForbidden, "forbidden", "bu sunucunun üyesi değilsin")
		return
	}
	g, err := h.Guilds.ByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "sunucu yok")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "sunucu alınamadı")
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func (h *Handler) ListGuildChannels(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ok, _ := h.Guilds.IsMember(r.Context(), id, uid)
	if !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	list, err := h.Channels.ForGuild(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kanallar alınamadı")
		return
	}
	// ViewChannel izniyle filtrele — kanal override'ları rol bazlı izinleri etkiler
	filtered := make([]repo.Channel, 0, len(list))
	for _, ch := range list {
		p, err := h.computeChannelPerms(r.Context(), id, ch.ID, uid)
		if err != nil {
			continue
		}
		if perms.Has(p, perms.ViewChannel) {
			filtered = append(filtered, ch)
		}
	}
	writeJSON(w, http.StatusOK, filtered)
}

func parseID(r *http.Request, key string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, key), 10, 64)
}

type discoverGuildView struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	IconText    string `json:"icon_text"`
	IconColor   string `json:"icon_color"`
	Description string `json:"description"`
	MemberCount int64  `json:"member_count"`
	Joined      bool   `json:"joined"`
}

// GET /api/v1/discover/guilds — herkese açık sunucuları listele (keşfet)
func (h *Handler) DiscoverGuilds(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `
        SELECT g.id::text, g.name, g.icon_text, g.icon_color, COALESCE(g.description, ''),
               (SELECT count(*) FROM guild_members gm WHERE gm.guild_id = g.id) AS member_count,
               EXISTS(SELECT 1 FROM guild_members gm2 WHERE gm2.guild_id = g.id AND gm2.user_id = $1) AS joined
        FROM guilds g
        WHERE g.is_public = true
        ORDER BY member_count DESC, g.created_at DESC
        LIMIT 100
    `, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer rows.Close()
	out := []discoverGuildView{}
	for rows.Next() {
		var v discoverGuildView
		if err := rows.Scan(&v.ID, &v.Name, &v.IconText, &v.IconColor, &v.Description, &v.MemberCount, &v.Joined); err == nil {
			out = append(out, v)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /api/v1/discover/guilds/{id}/join — herkese açık sunucuya doğrudan katıl
func (h *Handler) JoinPublicGuild(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	var isPublic bool
	if err := h.Pool.QueryRow(r.Context(),
		`SELECT is_public FROM guilds WHERE id = $1`, guildID).Scan(&isPublic); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "sunucu yok")
		return
	}
	if !isPublic {
		writeError(w, http.StatusForbidden, "forbidden", "bu sunucu herkese açık değil")
		return
	}
	// Banlı kullanıcı herkese açık sunucuya da katılamaz
	if banned, _ := h.Moderation.IsBanned(r.Context(), guildID, uid); banned {
		writeError(w, http.StatusForbidden, "banned", "bu sunucudan banlandın")
		return
	}
	if _, err := h.Pool.Exec(r.Context(),
		`INSERT INTO guild_members (guild_id, user_id) VALUES ($1, $2) ON CONFLICT (guild_id, user_id) DO NOTHING`,
		guildID, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "katılınamadı")
		return
	}
	user, _ := h.Users.ByID(r.Context(), uid)
	guild, _ := h.Guilds.ByID(r.Context(), guildID)
	h.applyAutoRole(r.Context(), guild, uid)
	h.postJoinSystemMessage(r.Context(), guild, uid)
	h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_ADD", map[string]any{"user": user, "guild_id": guildID})
	writeJSON(w, http.StatusOK, guild)
}
