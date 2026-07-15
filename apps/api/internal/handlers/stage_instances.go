package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

func parseInt64(s string) (int64, error) { return strconv.ParseInt(s, 10, 64) }
func int64ToStr(n int64) string           { return strconv.FormatInt(n, 10) }

type stageInstanceView struct {
	ChannelID    string    `json:"channel_id"`
	GuildID      string    `json:"guild_id"`
	Topic        string    `json:"topic"`
	PrivacyLevel string    `json:"privacy_level"`
	StartedBy    string    `json:"started_by"`
	StartedAt    time.Time `json:"started_at"`
}

type createStageInstanceReq struct {
	ChannelID    string `json:"channel_id"`
	Topic        string `json:"topic"`
	PrivacyLevel string `json:"privacy_level,omitempty"`
}

// POST /api/v1/stage-instances
func (h *Handler) CreateStageInstance(w http.ResponseWriter, r *http.Request) {
	var req createStageInstanceReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Topic == "" || len(req.Topic) > 120 {
		writeError(w, http.StatusBadRequest, "invalid_topic", "1-120 karakter")
		return
	}
	channelID, err := parseInt64(req.ChannelID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel_id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil || ch.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.Type != "stage" {
		writeError(w, http.StatusBadRequest, "not_stage", "kanal stage tipinde değil")
		return
	}
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageChannels, w) {
		return
	}
	privacy := req.PrivacyLevel
	if privacy == "" {
		privacy = "guild_only"
	}
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO stage_instances (channel_id, guild_id, topic, privacy_level, started_by)
        VALUES ($1, $2, $3, $4, $5)
    `, channelID, *ch.GuildID, req.Topic, privacy, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "başlatılamadı: "+err.Error())
		return
	}
	v := stageInstanceView{
		ChannelID: req.ChannelID, GuildID: int64ToStr(*ch.GuildID),
		Topic: req.Topic, PrivacyLevel: privacy,
		StartedBy: int64ToStr(uid), StartedAt: time.Now(),
	}
	h.Events.ToGuild(r.Context(), *ch.GuildID, "STAGE_INSTANCE_CREATE", map[string]any{"stage": v})
	writeJSON(w, http.StatusCreated, v)
}

// GET /api/v1/stage-instances/:channelID
func (h *Handler) GetStageInstance(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	var v stageInstanceView
	var guildID, startedBy int64
	err = h.Pool.QueryRow(r.Context(), `
        SELECT channel_id::text, guild_id, topic, privacy_level, started_by, started_at
        FROM stage_instances WHERE channel_id = $1
    `, channelID).Scan(&v.ChannelID, &guildID, &v.Topic, &v.PrivacyLevel, &startedBy, &v.StartedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "stage başlatılmamış")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	v.GuildID = int64ToStr(guildID)
	v.StartedBy = int64ToStr(startedBy)
	writeJSON(w, http.StatusOK, v)
}

// DELETE /api/v1/stage-instances/:channelID
func (h *Handler) DeleteStageInstance(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil || ch.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageChannels, w) {
		return
	}
	_, _ = h.Pool.Exec(r.Context(), `DELETE FROM stage_instances WHERE channel_id = $1`, channelID)
	h.Events.ToGuild(r.Context(), *ch.GuildID, "STAGE_INSTANCE_DELETE", map[string]any{"channel_id": int64ToStr(channelID)})
	w.WriteHeader(http.StatusNoContent)
}
