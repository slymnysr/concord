package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
	"go.uber.org/zap"
)

type createChannelReq struct {
	GuildID  string `json:"guild_id"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Topic    string `json:"topic,omitempty"`
	ParentID string `json:"parent_id,omitempty"`
}

func (h *Handler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	var req createChannelReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Type == "" {
		req.Type = "text"
	}
	if !validChannelType(req.Type) {
		writeError(w, http.StatusBadRequest, "invalid_type", "tip: text/voice/announcement/forum/stage/category")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if len(req.Name) < 1 || len(req.Name) > 100 {
		writeError(w, http.StatusBadRequest, "invalid_name", "kanal adı 1-100 karakter")
		return
	}
	guildID, err := strconv.ParseInt(req.GuildID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "guild_id geçersiz")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if _, err := h.Guilds.ByID(r.Context(), guildID); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "sunucu yok")
		return
	}
	if !h.requirePerm(r, guildID, uid, perms.ManageChannels, w) {
		return
	}
	var parent *int64
	if req.ParentID != "" {
		p, err := strconv.ParseInt(req.ParentID, 10, 64)
		if err == nil {
			parent = &p
		}
	}
	var topic *string
	if req.Topic != "" {
		topic = &req.Topic
	}
	c := &repo.Channel{
		ID:       h.IDs.Next(),
		GuildID:  &guildID,
		ParentID: parent,
		Type:     req.Type,
		Name:     req.Name,
		Topic:    topic,
	}
	if err := h.Channels.Create(r.Context(), c); err != nil {
		h.logger.Error("channel create", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "kanal oluşturulamadı")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "CHANNEL_CREATE", map[string]any{"channel": c})
	h.logAudit(r.Context(), guildID, uid, &c.ID, "channel_create", "", map[string]string{
		"name": c.Name,
		"type": c.Type,
	})
	writeJSON(w, http.StatusCreated, c)
}

func validChannelType(t string) bool {
	switch t {
	case "text", "voice", "announcement", "forum", "stage", "category", "media":
		return true
	}
	return false
}
