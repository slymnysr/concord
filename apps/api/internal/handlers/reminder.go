package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/repo"
)

type createReminderReq struct {
	RemindAt string `json:"remind_at"` // RFC3339
}

type reminderView struct {
	ID        string  `json:"id"`
	ChannelID string  `json:"channel_id"`
	MessageID *string `json:"message_id,omitempty"`
	RemindAt  string  `json:"remind_at"`
	CreatedAt string  `json:"created_at"`
}

// POST /messages/{messageID}/remind
func (h *Handler) CreateReminder(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message id")
		return
	}
	var req createReminderReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	when, err := time.Parse(time.RFC3339, req.RemindAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_time", "remind_at RFC3339 olmalı")
		return
	}
	if when.Before(time.Now().Add(5 * time.Second)) {
		writeError(w, http.StatusBadRequest, "too_soon", "gelecekte bir zaman seç")
		return
	}
	if when.After(time.Now().Add(365 * 24 * time.Hour)) {
		writeError(w, http.StatusBadRequest, "too_far", "en fazla 1 yıl sonrası")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ok, ch, _ := h.canReadMessage(r, messageID, uid)
	if !ok || ch == nil {
		writeError(w, http.StatusForbidden, "forbidden", "bu mesaja erişimin yok")
		return
	}
	id := h.IDs.Next()
	if _, err := h.Pool.Exec(r.Context(), `
        INSERT INTO reminders (id, user_id, channel_id, message_id, remind_at)
        VALUES ($1, $2, $3, $4, $5)
    `, id, uid, ch.ID, messageID, when); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "hatırlatıcı kurulamadı")
		return
	}
	mid := strconv.FormatInt(messageID, 10)
	writeJSON(w, http.StatusCreated, reminderView{
		ID:        strconv.FormatInt(id, 10),
		ChannelID: strconv.FormatInt(ch.ID, 10),
		MessageID: &mid,
		RemindAt:  when.Format(time.RFC3339),
		CreatedAt: time.Now().Format(time.RFC3339),
	})
}

// GET /users/me/reminders
func (h *Handler) ListReminders(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `
        SELECT id::text, channel_id::text, message_id::text, remind_at::text, created_at::text
        FROM reminders WHERE user_id = $1 AND fired = FALSE
        ORDER BY remind_at ASC
    `, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []reminderView{}
	for rows.Next() {
		var v reminderView
		if err := rows.Scan(&v.ID, &v.ChannelID, &v.MessageID, &v.RemindAt, &v.CreatedAt); err != nil {
			continue
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, out)
}

// DELETE /reminders/{reminderID}
func (h *Handler) DeleteReminder(w http.ResponseWriter, r *http.Request) {
	reminderID, err := parseID(r, "reminderID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if _, err := h.Pool.Exec(r.Context(),
		`DELETE FROM reminders WHERE id = $1 AND user_id = $2`, reminderID, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinemedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DispatchDueReminders — zamanlayıcı goroutine tarafından çağrılır.
// Vakti gelmiş hatırlatıcılar için bildirim oluşturur (bell gelen-kutusunda görünür).
func (h *Handler) DispatchDueReminders(ctx context.Context) {
	rows, err := h.Pool.Query(ctx, `
        SELECT id, user_id, channel_id, message_id
        FROM reminders WHERE fired = FALSE AND remind_at <= NOW()
        ORDER BY remind_at ASC LIMIT 50
    `)
	if err != nil {
		return
	}
	type due struct {
		id, userID, channelID int64
		messageID             *int64
	}
	var list []due
	for rows.Next() {
		var d due
		if err := rows.Scan(&d.id, &d.userID, &d.channelID, &d.messageID); err == nil {
			list = append(list, d)
		}
	}
	rows.Close()

	for _, d := range list {
		ct, err := h.Pool.Exec(ctx, `UPDATE reminders SET fired = TRUE WHERE id = $1 AND fired = FALSE`, d.id)
		if err != nil || ct.RowsAffected() == 0 {
			continue
		}
		actor := d.userID
		chID := d.channelID
		n := &repo.Notification{
			ID:        h.IDs.Next(),
			UserID:    d.userID,
			Type:      "reminder",
			ChannelID: &chID,
			MessageID: d.messageID,
			ActorID:   &actor,
		}
		if ch, err := h.Channels.ByID(ctx, d.channelID); err == nil && ch.GuildID != nil {
			n.GuildID = ch.GuildID
		}
		if err := h.Notifications.Create(ctx, n); err != nil {
			continue
		}
		if h.Redis != nil {
			payload, _ := json.Marshal(map[string]any{
				"type":         "NOTIFICATION",
				"notification": n,
				"ts":           time.Now().UnixMilli(),
			})
			_, _ = h.Redis.Publish(ctx, "concord:user:"+strconv.FormatInt(d.userID, 10), payload).Result()
		}
	}
}
