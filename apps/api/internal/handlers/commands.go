package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
)

type commandOption struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Required    bool   `json:"required"`
}

type commandView struct {
	ID          string          `json:"id"`
	GuildID     string          `json:"guild_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Response    string          `json:"response"`
	Options     []commandOption `json:"options"`
	CreatorID   string          `json:"creator_id"`
	CreatedAt   time.Time       `json:"created_at"`
}

type createCommandReq struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Response    string          `json:"response"`
	Options     []commandOption `json:"options,omitempty"`
}

// GET /api/v1/guilds/:id/commands
func (h *Handler) ListCommands(w http.ResponseWriter, r *http.Request) {
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
        SELECT id::text, guild_id::text, name, description, response, options, creator_id::text, created_at
        FROM guild_commands WHERE guild_id = $1 ORDER BY name ASC
    `, guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer rows.Close()
	out := []commandView{}
	for rows.Next() {
		var c commandView
		var optRaw []byte
		if err := rows.Scan(&c.ID, &c.GuildID, &c.Name, &c.Description, &c.Response, &optRaw, &c.CreatorID, &c.CreatedAt); err == nil {
			c.Options = []commandOption{}
			if len(optRaw) > 0 {
				_ = json.Unmarshal(optRaw, &c.Options)
			}
			out = append(out, c)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /api/v1/guilds/:id/commands
func (h *Handler) CreateCommand(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageGuild, w) {
		return
	}
	var req createCommandReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Name = strings.ToLower(strings.TrimSpace(req.Name))
	req.Name = strings.TrimPrefix(req.Name, "/")
	if len(req.Name) < 1 || len(req.Name) > 32 || strings.ContainsAny(req.Name, " /\\") {
		writeError(w, http.StatusBadRequest, "invalid_name", "1-32 karakter, boşluksuz")
		return
	}
	if len(req.Description) < 1 || len(req.Description) > 100 {
		writeError(w, http.StatusBadRequest, "invalid_description", "1-100 karakter")
		return
	}
	if req.Response == "" {
		writeError(w, http.StatusBadRequest, "invalid_response", "yanıt gerekli")
		return
	}
	// Opsiyonları normalize et (en fazla 10, isim küçük harf-boşluksuz)
	opts := []commandOption{}
	for _, o := range req.Options {
		o.Name = strings.ToLower(strings.TrimSpace(o.Name))
		if o.Name == "" || strings.ContainsAny(o.Name, " /\\{}") {
			continue
		}
		opts = append(opts, o)
		if len(opts) >= 10 {
			break
		}
	}
	optJSON, _ := json.Marshal(opts)
	id := h.IDs.Next()
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO guild_commands (id, guild_id, name, description, response, options, creator_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, id, guildID, req.Name, req.Description, req.Response, optJSON, uid)
	if err != nil {
		writeError(w, http.StatusBadRequest, "conflict", "isim çakışıyor olabilir")
		return
	}
	writeJSON(w, http.StatusCreated, commandView{
		ID: int64ToStr(id), GuildID: int64ToStr(guildID),
		Name: req.Name, Description: req.Description, Response: req.Response, Options: opts,
		CreatorID: int64ToStr(uid), CreatedAt: time.Now(),
	})
}

// DELETE /api/v1/commands/:id
func (h *Handler) DeleteCommand(w http.ResponseWriter, r *http.Request) {
	commandID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	var guildID int64
	if err := h.Pool.QueryRow(r.Context(), `SELECT guild_id FROM guild_commands WHERE id = $1`, commandID).Scan(&guildID); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "komut yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageGuild, w) {
		return
	}
	_, _ = h.Pool.Exec(r.Context(), `DELETE FROM guild_commands WHERE id = $1`, commandID)
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/channels/:channelID/commands/:name/run — slash komutu çalıştır
func (h *Handler) RunCommand(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil || ch.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	name := strings.ToLower(strings.TrimPrefix(r.URL.Query().Get("name"), "/"))
	// Argümanlar JSON gövdeden: {"args": {"opt": "değer"}}
	var body struct {
		Args map[string]string `json:"args"`
	}
	_ = readJSON(r, &body)
	if body.Args == nil {
		body.Args = map[string]string{}
	}

	var response string
	var optRaw []byte
	err = h.Pool.QueryRow(r.Context(), `SELECT response, options FROM guild_commands WHERE guild_id = $1 AND name = $2`, *ch.GuildID, name).Scan(&response, &optRaw)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "/"+name+" tanımlı değil")
		return
	}
	var opts []commandOption
	if len(optRaw) > 0 {
		_ = json.Unmarshal(optRaw, &opts)
	}
	// Zorunlu argüman kontrolü
	for _, o := range opts {
		if o.Required && strings.TrimSpace(body.Args[o.Name]) == "" {
			writeError(w, http.StatusBadRequest, "missing_arg", "'"+o.Name+"' argümanı gerekli")
			return
		}
	}
	// Placeholder ikamesi: {opt} → değer, {user} → çağıran
	for _, o := range opts {
		response = strings.ReplaceAll(response, "{"+o.Name+"}", body.Args[o.Name])
	}
	if invoker, e := h.Users.ByID(r.Context(), uid); e == nil {
		response = strings.ReplaceAll(response, "{user}", invoker.DisplayName)
	}

	// Yanıtı kanala mesaj olarak gönder
	m := &repo.Message{
		ID: h.IDs.Next(), ChannelID: channelID, AuthorID: uid, Content: response, CreatedAt: time.Now(),
	}
	if err := h.Messages.Create(r.Context(), m); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "yanıt gönderilemedi")
		return
	}
	_, _ = h.Pool.Exec(r.Context(), `UPDATE channels SET last_message_id = $1 WHERE id = $2`, m.ID, channelID)
	h.publishMessage(r.Context(), ch, m)
	writeJSON(w, http.StatusOK, m)
}
