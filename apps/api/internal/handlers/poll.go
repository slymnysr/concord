package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
)

// publishPollUpdate — oy değişince bağlı istemcilere POLL_UPDATE yayar (canlı sonuç)
func (h *Handler) publishPollUpdate(ctx context.Context, pollID int64) {
	if h.Redis == nil {
		return
	}
	var messageID, channelID int64
	if err := h.Pool.QueryRow(ctx,
		`SELECT message_id, channel_id FROM polls WHERE id = $1`, pollID).Scan(&messageID, &channelID); err != nil {
		return
	}
	ch, err := h.Channels.ByID(ctx, channelID)
	if err != nil {
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"type":       "POLL_UPDATE",
		"channel_id": strconv.FormatInt(channelID, 10),
		"message_id": strconv.FormatInt(messageID, 10),
		"ts":         time.Now().UnixMilli(),
	})
	if ch.GuildID != nil {
		h.Redis.Publish(ctx, "concord:guild:"+strconv.FormatInt(*ch.GuildID, 10), payload)
		return
	}
	rows, err := h.Pool.Query(ctx, `SELECT user_id FROM dm_participants WHERE channel_id = $1`, channelID)
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

type pollAnswerInput struct {
	Text  string `json:"text"`
	Emoji string `json:"emoji,omitempty"`
}

type createPollReq struct {
	Question         string            `json:"question"`
	Answers          []pollAnswerInput `json:"answers"`
	AllowMultiselect bool              `json:"allow_multiselect"`
	Anonymous        bool              `json:"anonymous,omitempty"`
	DurationHours    int               `json:"duration_hours,omitempty"` // 0 = süresiz
}

type pollAnswerView struct {
	ID      string  `json:"id"`
	Text    string  `json:"answer_text"`
	Emoji   *string `json:"emoji,omitempty"`
	Count   int     `json:"count"`
	MeVoted bool    `json:"me_voted"`
}

type pollView struct {
	ID               string           `json:"id"`
	MessageID        string           `json:"message_id"`
	Question         string           `json:"question"`
	AllowMultiselect bool             `json:"allow_multiselect"`
	ExpiresAt        *string          `json:"expires_at,omitempty"`
	Expired          bool             `json:"expired"`
	Anonymous        bool             `json:"anonymous"`
	CreatedBy        string           `json:"created_by"`
	TotalVotes       int              `json:"total_votes"`
	Answers          []pollAnswerView `json:"answers"`
}

// POST /channels/{channelID}/polls — yeni anket mesajı oluştur
func (h *Handler) CreatePoll(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	var req createPollReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Question = strings.TrimSpace(req.Question)
	if req.Question == "" || len(req.Question) > 300 {
		writeError(w, http.StatusBadRequest, "invalid_question", "soru 1-300 karakter olmalı")
		return
	}
	// Geçerli cevapları topla
	clean := make([]pollAnswerInput, 0, len(req.Answers))
	for _, a := range req.Answers {
		t := strings.TrimSpace(a.Text)
		if t == "" {
			continue
		}
		if len(t) > 80 {
			t = t[:80]
		}
		clean = append(clean, pollAnswerInput{Text: t, Emoji: strings.TrimSpace(a.Emoji)})
	}
	if len(clean) < 2 || len(clean) > 10 {
		writeError(w, http.StatusBadRequest, "invalid_answers", "2-10 cevap gerekli")
		return
	}
	uid := middleware.UserIDFrom(r.Context())

	// Kanal + izin kontrolü (mesaj oluşturma ile aynı)
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID == nil {
		if ok, _ := h.DMs.IsParticipant(r.Context(), ch.ID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "bu DM'e anket atamazsın")
			return
		}
	} else {
		if ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
			return
		}
		chanPerms, err := h.computeChannelPerms(r.Context(), *ch.GuildID, ch.ID, uid)
		if err != nil || !perms.Has(chanPerms, perms.SendMessages) {
			writeError(w, http.StatusForbidden, "missing_permission", "mesaj atma izni yok")
			return
		}
	}

	// 1) Mesaj oluştur (içerik boş — anket ayrı render edilir)
	m := &repo.Message{
		ID:        h.IDs.Next(),
		ChannelID: channelID,
		AuthorID:  uid,
		Content:   "",
		CreatedAt: time.Now(),
	}
	if err := h.Messages.Create(r.Context(), m); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "anket mesajı oluşturulamadı")
		return
	}

	// 2) Poll + cevaplar
	pollID := h.IDs.Next()
	var expiresAt *time.Time
	if req.DurationHours > 0 {
		t := time.Now().Add(time.Duration(req.DurationHours) * time.Hour)
		expiresAt = &t
	}
	if _, err := h.Pool.Exec(r.Context(), `
        INSERT INTO polls (id, message_id, channel_id, question, allow_multiselect, anonymous, expires_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, pollID, m.ID, channelID, req.Question, req.AllowMultiselect, req.Anonymous, expiresAt, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "anket oluşturulamadı: "+err.Error())
		return
	}
	for i, a := range clean {
		var emoji *string
		if a.Emoji != "" {
			emoji = &a.Emoji
		}
		_, _ = h.Pool.Exec(r.Context(), `
            INSERT INTO poll_answers (id, poll_id, answer_text, emoji, position)
            VALUES ($1, $2, $3, $4, $5)
        `, h.IDs.Next(), pollID, a.Text, emoji, i)
	}

	// last_message_id + yayın
	_, _ = h.Pool.Exec(r.Context(), `UPDATE channels SET last_message_id = $1 WHERE id = $2`, m.ID, channelID)
	h.publishMessage(r.Context(), ch, m)

	writeJSON(w, http.StatusCreated, m)
}

// GET /messages/{messageID}/poll — anket + sonuçlar
func (h *Handler) GetMessagePoll(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ok, _, _ := h.canReadMessage(r, messageID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "erişim yok")
		return
	}

	var p pollView
	var expiresAt *time.Time
	err = h.Pool.QueryRow(r.Context(), `
        SELECT id::text, message_id::text, question, allow_multiselect, anonymous, expires_at, created_by::text
        FROM polls WHERE message_id = $1
    `, messageID).Scan(&p.ID, &p.MessageID, &p.Question, &p.AllowMultiselect, &p.Anonymous, &expiresAt, &p.CreatedBy)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "anket yok")
		return
	}
	if expiresAt != nil {
		s := expiresAt.Format(time.RFC3339)
		p.ExpiresAt = &s
		p.Expired = time.Now().After(*expiresAt)
	}

	rows, err := h.Pool.Query(r.Context(), `
        SELECT a.id::text, a.answer_text, a.emoji,
               (SELECT count(*) FROM poll_votes v WHERE v.answer_id = a.id) AS cnt,
               EXISTS(SELECT 1 FROM poll_votes v WHERE v.answer_id = a.id AND v.user_id = $2) AS me
        FROM poll_answers a WHERE a.poll_id = $1 ORDER BY a.position
    `, p.ID, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "cevaplar alınamadı")
		return
	}
	defer rows.Close()
	p.Answers = []pollAnswerView{}
	for rows.Next() {
		var a pollAnswerView
		if err := rows.Scan(&a.ID, &a.Text, &a.Emoji, &a.Count, &a.MeVoted); err != nil {
			continue
		}
		p.TotalVotes += a.Count
		p.Answers = append(p.Answers, a)
	}
	writeJSON(w, http.StatusOK, p)
}

// PUT /polls/{pollID}/answers/{answerID}/vote
func (h *Handler) VotePoll(w http.ResponseWriter, r *http.Request) {
	pollID, err := parseID(r, "pollID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "poll id")
		return
	}
	answerID, err := parseID(r, "answerID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "answer id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())

	// Anket geçerli mi + süresi dolmuş mu + cevap bu ankete mi ait
	var multiselect bool
	var expiresAt *time.Time
	var messageID int64
	if err := h.Pool.QueryRow(r.Context(),
		`SELECT allow_multiselect, expires_at, message_id FROM polls WHERE id = $1`, pollID).
		Scan(&multiselect, &expiresAt, &messageID); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "anket yok")
		return
	}
	if expiresAt != nil && time.Now().After(*expiresAt) {
		writeError(w, http.StatusForbidden, "poll_expired", "anketin süresi doldu")
		return
	}
	if ok, _, _ := h.canReadMessage(r, messageID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "erişim yok")
		return
	}
	var belongs bool
	if err := h.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM poll_answers WHERE id = $1 AND poll_id = $2)`, answerID, pollID).
		Scan(&belongs); err != nil || !belongs {
		writeError(w, http.StatusBadRequest, "bad_request", "cevap bu ankete ait değil")
		return
	}

	// Tek seçim ise diğer oyları temizle
	if !multiselect {
		_, _ = h.Pool.Exec(r.Context(), `DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2`, pollID, uid)
	}
	_, err = h.Pool.Exec(r.Context(), `
        INSERT INTO poll_votes (poll_id, answer_id, user_id) VALUES ($1, $2, $3)
        ON CONFLICT (poll_id, answer_id, user_id) DO NOTHING
    `, pollID, answerID, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "oy verilemedi")
		return
	}
	h.publishPollUpdate(r.Context(), pollID)
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /polls/{pollID}/answers/{answerID}/vote
func (h *Handler) UnvotePoll(w http.ResponseWriter, r *http.Request) {
	pollID, err := parseID(r, "pollID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "poll id")
		return
	}
	answerID, err := parseID(r, "answerID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "answer id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if _, err := h.Pool.Exec(r.Context(),
		`DELETE FROM poll_votes WHERE poll_id = $1 AND answer_id = $2 AND user_id = $3`,
		pollID, answerID, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "oy kaldırılamadı")
		return
	}
	h.publishPollUpdate(r.Context(), pollID)
	w.WriteHeader(http.StatusNoContent)
}

// GET /polls/{pollID}/answers/{answerID}/voters — bu cevaba oy verenler
func (h *Handler) ListPollVoters(w http.ResponseWriter, r *http.Request) {
	pollID, err := parseID(r, "pollID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "poll id")
		return
	}
	answerID, err := parseID(r, "answerID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "answer id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	var messageID int64
	var anonymous bool
	if err := h.Pool.QueryRow(r.Context(), `SELECT message_id, anonymous FROM polls WHERE id = $1`, pollID).Scan(&messageID, &anonymous); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "anket yok")
		return
	}
	if anonymous {
		// Anonim ankette oy verenler gizli
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	if ok, _, _ := h.canReadMessage(r, messageID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "erişim yok")
		return
	}
	rows, err := h.Pool.Query(r.Context(), `
        SELECT u.id::text, u.display_name, u.avatar_color, u.avatar_url
        FROM poll_votes v JOIN users u ON u.id = v.user_id
        WHERE v.poll_id = $1 AND v.answer_id = $2
        ORDER BY v.created_at ASC LIMIT 100
    `, pollID, answerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	type voter struct {
		ID          string  `json:"id"`
		DisplayName string  `json:"display_name"`
		AvatarColor string  `json:"avatar_color"`
		AvatarURL   *string `json:"avatar_url,omitempty"`
	}
	out := []voter{}
	for rows.Next() {
		var v voter
		if err := rows.Scan(&v.ID, &v.DisplayName, &v.AvatarColor, &v.AvatarURL); err != nil {
			continue
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /polls/{pollID}/close — anketi erken kapat (yalnızca oluşturan)
func (h *Handler) ClosePoll(w http.ResponseWriter, r *http.Request) {
	pollID, err := parseID(r, "pollID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "poll id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	var createdBy int64
	if err := h.Pool.QueryRow(r.Context(), `SELECT created_by FROM polls WHERE id = $1`, pollID).Scan(&createdBy); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "anket yok")
		return
	}
	if createdBy != uid {
		writeError(w, http.StatusForbidden, "forbidden", "yalnızca anketi açan kapatabilir")
		return
	}
	if _, err := h.Pool.Exec(r.Context(),
		`UPDATE polls SET expires_at = NOW() WHERE id = $1`, pollID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kapatılamadı")
		return
	}
	h.publishPollUpdate(r.Context(), pollID)
	w.WriteHeader(http.StatusNoContent)
}
