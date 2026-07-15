package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
)

type editMessageReq struct {
	Content string `json:"content"`
}

func (h *Handler) EditMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())

	m, err := h.Messages.ByID(r.Context(), messageID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "mesaj yok")
		return
	}
	if m.AuthorID != uid {
		writeError(w, http.StatusForbidden, "forbidden", "sadece kendi mesajını düzenleyebilirsin")
		return
	}
	var req editMessageReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if len(req.Content) == 0 || len(req.Content) > 4000 {
		writeError(w, http.StatusBadRequest, "invalid_content", "1-4000 karakter")
		return
	}
	// İçerik gerçekten değiştiyse eski sürümü geçmişe kaydet
	if m.Content != req.Content {
		_, _ = h.Pool.Exec(r.Context(),
			`INSERT INTO message_edits (id, message_id, old_content) VALUES ($1, $2, $3)`,
			h.IDs.Next(), messageID, m.Content)
	}
	if err := h.Messages.UpdateContent(r.Context(), messageID, uid, req.Content); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "güncellenmedi")
		return
	}
	m.Content = req.Content
	now := time.Now()
	m.EditedAt = &now

	ch, _ := h.Channels.ByID(r.Context(), m.ChannelID)
	if ch != nil {
		h.publishMessageEvent(r.Context(), ch, m, "MESSAGE_UPDATE")
	}
	writeJSON(w, http.StatusOK, m)
}

// GET /api/v1/messages/{messageID}/edits — mesajın düzenleme geçmişi (eski sürümler, yeni→eski).
func (h *Handler) GetMessageEdits(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	m, err := h.Messages.ByID(r.Context(), messageID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "mesaj yok")
		return
	}
	// Kanalı görebiliyor mu? (guild üyeliği / DM katılımı)
	ch, err := h.Channels.ByID(r.Context(), m.ChannelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID != nil {
		if ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
			return
		}
	} else if ok, _ := h.DMs.IsParticipant(r.Context(), ch.ID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "katılımcı değilsin")
		return
	}
	rows, err := h.Pool.Query(r.Context(),
		`SELECT id::text, old_content, edited_at FROM message_edits WHERE message_id = $1 ORDER BY edited_at DESC`, messageID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	type editView struct {
		ID         string    `json:"id"`
		OldContent string    `json:"old_content"`
		EditedAt   time.Time `json:"edited_at"`
	}
	out := []editView{}
	for rows.Next() {
		var e editView
		if err := rows.Scan(&e.ID, &e.OldContent, &e.EditedAt); err == nil {
			out = append(out, e)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	m, err := h.Messages.ByID(r.Context(), messageID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "mesaj yok")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), m.ChannelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}

	// Yetki: kendi mesajıysa OK; değilse ManageMessages gerekiyor (sadece guild)
	if m.AuthorID != uid {
		if ch.GuildID == nil {
			writeError(w, http.StatusForbidden, "forbidden", "yetersiz")
			return
		}
		cp, err := h.computeChannelPerms(r.Context(), *ch.GuildID, ch.ID, uid)
		if err != nil || !perms.Has(cp, perms.ManageMessages) {
			writeError(w, http.StatusForbidden, "missing_permission", "yetersiz izin")
			return
		}
	}
	if err := h.Messages.Delete(r.Context(), messageID); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "mesaj yok")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "silinemedi")
		return
	}
	h.publishMessageEvent(r.Context(), ch, m, "MESSAGE_DELETE")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) publishMessageEvent(ctx context.Context, ch *repo.Channel, m *repo.Message, eventType string) {
	if h.Redis == nil {
		return
	}
	base := map[string]any{
		"type":       eventType,
		"channel_id": strconv.FormatInt(ch.ID, 10),
		"message":    m,
		"ts":         time.Now().UnixMilli(),
	}
	if ch.GuildID != nil {
		base["guild_id"] = strconv.FormatInt(*ch.GuildID, 10)
		payload, _ := json.Marshal(base)
		h.Redis.Publish(ctx, "concord:guild:"+strconv.FormatInt(*ch.GuildID, 10), payload)
		return
	}
	payload, _ := json.Marshal(base)
	rows, err := h.Pool.Query(ctx, `SELECT user_id FROM dm_participants WHERE channel_id = $1`, ch.ID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var uid int64
		if err := rows.Scan(&uid); err == nil {
			h.Redis.Publish(ctx, "concord:user:"+strconv.FormatInt(uid, 10), payload)
		}
	}
}
