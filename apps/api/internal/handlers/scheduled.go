package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
)

type createScheduledReq struct {
	Content      string `json:"content"`
	ScheduledFor string `json:"scheduled_for"` // RFC3339
}

type scheduledMessageView struct {
	ID           string `json:"id"`
	ChannelID    string `json:"channel_id"`
	Content      string `json:"content"`
	ScheduledFor string `json:"scheduled_for"`
	CreatedAt    string `json:"created_at"`
}

// POST /channels/{channelID}/scheduled-messages
func (h *Handler) CreateScheduledMessage(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	var req createScheduledReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" || len(req.Content) > 4000 {
		writeError(w, http.StatusBadRequest, "invalid_content", "1-4000 karakter")
		return
	}
	when, err := time.Parse(time.RFC3339, req.ScheduledFor)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_time", "scheduled_for RFC3339 olmalı")
		return
	}
	if when.Before(time.Now().Add(10 * time.Second)) {
		writeError(w, http.StatusBadRequest, "too_soon", "en az 10 saniye sonrası olmalı")
		return
	}
	if when.After(time.Now().Add(30 * 24 * time.Hour)) {
		writeError(w, http.StatusBadRequest, "too_far", "en fazla 30 gün sonrası")
		return
	}
	uid := middleware.UserIDFrom(r.Context())

	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID == nil {
		if ok, _ := h.DMs.IsParticipant(r.Context(), ch.ID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "yetkisiz")
			return
		}
	} else {
		if ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
			return
		}
		cp, err := h.computeChannelPerms(r.Context(), *ch.GuildID, ch.ID, uid)
		if err != nil || !perms.Has(cp, perms.SendMessages) {
			writeError(w, http.StatusForbidden, "missing_permission", "mesaj atma izni yok")
			return
		}
	}

	id := h.IDs.Next()
	if _, err := h.Pool.Exec(r.Context(), `
        INSERT INTO scheduled_messages (id, channel_id, author_id, content, scheduled_for)
        VALUES ($1, $2, $3, $4, $5)
    `, id, channelID, uid, req.Content, when); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "zamanlanamadı")
		return
	}
	writeJSON(w, http.StatusCreated, scheduledMessageView{
		ID:           strconv.FormatInt(id, 10),
		ChannelID:    strconv.FormatInt(channelID, 10),
		Content:      req.Content,
		ScheduledFor: when.Format(time.RFC3339),
		CreatedAt:    time.Now().Format(time.RFC3339),
	})
}

// GET /channels/{channelID}/scheduled-messages
func (h *Handler) ListScheduledMessages(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `
        SELECT id::text, channel_id::text, content, scheduled_for::text, created_at::text
        FROM scheduled_messages
        WHERE channel_id = $1 AND author_id = $2 AND sent = FALSE
        ORDER BY scheduled_for ASC
    `, channelID, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []scheduledMessageView{}
	for rows.Next() {
		var v scheduledMessageView
		if err := rows.Scan(&v.ID, &v.ChannelID, &v.Content, &v.ScheduledFor, &v.CreatedAt); err != nil {
			continue
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, out)
}

// DELETE /scheduled-messages/{schedID}
func (h *Handler) DeleteScheduledMessage(w http.ResponseWriter, r *http.Request) {
	schedID, err := parseID(r, "schedID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if _, err := h.Pool.Exec(r.Context(),
		`DELETE FROM scheduled_messages WHERE id = $1 AND author_id = $2 AND sent = FALSE`, schedID, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DispatchDueScheduledMessages — zamanlayıcı goroutine tarafından periyodik çağrılır.
// Vakti gelmiş gönderilmemiş mesajları gerçek mesaja dönüştürür.
func (h *Handler) DispatchDueScheduledMessages(ctx context.Context) {
	rows, err := h.Pool.Query(ctx, `
        SELECT id, channel_id, author_id, content
        FROM scheduled_messages
        WHERE sent = FALSE AND scheduled_for <= NOW()
        ORDER BY scheduled_for ASC LIMIT 50
    `)
	if err != nil {
		return
	}
	type due struct {
		id, channelID, authorID int64
		content                 string
	}
	var list []due
	for rows.Next() {
		var d due
		if err := rows.Scan(&d.id, &d.channelID, &d.authorID, &d.content); err == nil {
			list = append(list, d)
		}
	}
	rows.Close()

	for _, d := range list {
		// Önce 'sent' işaretle (çift gönderimi önle)
		ct, err := h.Pool.Exec(ctx, `UPDATE scheduled_messages SET sent = TRUE WHERE id = $1 AND sent = FALSE`, d.id)
		if err != nil || ct.RowsAffected() == 0 {
			continue
		}
		ch, err := h.Channels.ByID(ctx, d.channelID)
		if err != nil {
			continue
		}
		// Yazar hâlâ erişebiliyor mu? (sunucu üyesi / DM katılımcısı)
		if ch.GuildID != nil {
			if ok, _ := h.Guilds.IsMember(ctx, *ch.GuildID, d.authorID); !ok {
				continue
			}
		} else {
			if ok, _ := h.DMs.IsParticipant(ctx, ch.ID, d.authorID); !ok {
				continue
			}
		}
		m := &repo.Message{
			ID:        h.IDs.Next(),
			ChannelID: d.channelID,
			AuthorID:  d.authorID,
			Content:   d.content,
			CreatedAt: time.Now(),
		}
		if err := h.Messages.Create(ctx, m); err != nil {
			continue
		}
		_, _ = h.Pool.Exec(ctx, `UPDATE channels SET last_message_id = $1 WHERE id = $2`, m.ID, d.channelID)
		h.parseAndPersistMentions(ctx, ch, m, nil)
		h.publishMessage(ctx, ch, m)
	}
}
