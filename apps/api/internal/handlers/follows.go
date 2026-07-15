package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
)

// === Duyuru kanalı takibi (Discord "Follow" paritesi) ===
// Bir duyuru kanalı başka sunuculardaki hedef kanallarca takip edilir;
// kaynakta "Yayınla"nan mesajlar takipçi kanallara webhook görünümüyle kopyalanır.

type followChannelReq struct {
	TargetChannelID string `json:"target_channel_id"`
}

type followView struct {
	ID              string `json:"id"`
	SourceChannelID string `json:"source_channel_id"`
	SourceChannel   string `json:"source_channel"`
	SourceGuild     string `json:"source_guild"`
	TargetChannelID string `json:"target_channel_id"`
	TargetChannel   string `json:"target_channel"`
	CreatedAt       string `json:"created_at"`
}

func (h *Handler) FollowChannel(w http.ResponseWriter, r *http.Request) {
	sourceID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	src, err := h.Channels.ByID(r.Context(), sourceID)
	if err != nil || src.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if src.Type != "announcement" {
		writeError(w, http.StatusBadRequest, "not_announcement", "sadece duyuru kanalları takip edilebilir")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	var one int
	if h.Pool.QueryRow(r.Context(), `SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2`, *src.GuildID, uid).Scan(&one) != nil {
		writeError(w, http.StatusForbidden, "not_member", "kaynak sunucunun üyesi değilsin")
		return
	}
	var req followChannelReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	targetID, err := strconv.ParseInt(req.TargetChannelID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "target_channel_id")
		return
	}
	if targetID == sourceID {
		writeError(w, http.StatusBadRequest, "self_follow", "kanal kendini takip edemez")
		return
	}
	tgt, err := h.Channels.ByID(r.Context(), targetID)
	if err != nil || tgt.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "hedef kanal yok")
		return
	}
	if tgt.Type != "text" && tgt.Type != "announcement" {
		writeError(w, http.StatusBadRequest, "invalid_target", "hedef metin kanalı olmalı")
		return
	}
	if !h.requirePerm(r, *tgt.GuildID, uid, perms.ManageWebhooks, w) {
		return
	}
	id := h.IDs.Next()
	tag, err := h.Pool.Exec(r.Context(), `
        INSERT INTO channel_follows (id, source_channel_id, target_channel_id, created_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (source_channel_id, target_channel_id) DO NOTHING
    `, id, sourceID, targetID, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaydedilemedi")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusConflict, "already_following", "bu kanal zaten takip ediliyor")
		return
	}
	h.logAudit(r.Context(), *tgt.GuildID, uid, &id, "channel_update", "", map[string]string{"follow_source": src.Name})
	writeJSON(w, http.StatusCreated, map[string]string{
		"id":                strconv.FormatInt(id, 10),
		"source_channel_id": strconv.FormatInt(sourceID, 10),
		"target_channel_id": strconv.FormatInt(targetID, 10),
	})
}

func (h *Handler) ListGuildFollows(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "guild id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, guildID, uid, perms.ManageWebhooks, w) {
		return
	}
	rows, err := h.Pool.Query(r.Context(), `
        SELECT cf.id::text, cf.source_channel_id::text, sc.name, sg.name,
               cf.target_channel_id::text, tc.name, cf.created_at::text
        FROM channel_follows cf
        JOIN channels sc ON sc.id = cf.source_channel_id
        JOIN guilds   sg ON sg.id = sc.guild_id
        JOIN channels tc ON tc.id = cf.target_channel_id
        WHERE tc.guild_id = $1
        ORDER BY cf.created_at DESC
    `, guildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	out := []followView{}
	for rows.Next() {
		var v followView
		if err := rows.Scan(&v.ID, &v.SourceChannelID, &v.SourceChannel, &v.SourceGuild,
			&v.TargetChannelID, &v.TargetChannel, &v.CreatedAt); err == nil {
			out = append(out, v)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) DeleteFollow(w http.ResponseWriter, r *http.Request) {
	followID, err := parseID(r, "followID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	var targetGuildID int64
	err = h.Pool.QueryRow(r.Context(), `
        SELECT tc.guild_id FROM channel_follows cf
        JOIN channels tc ON tc.id = cf.target_channel_id
        WHERE cf.id = $1
    `, followID).Scan(&targetGuildID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "takip kaydı yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, targetGuildID, uid, perms.ManageWebhooks, w) {
		return
	}
	if _, err := h.Pool.Exec(r.Context(), `DELETE FROM channel_follows WHERE id = $1`, followID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinmedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// CrosspostMessage — duyuru kanalındaki bir mesajı tüm takipçi kanallara yayınlar.
// Yazar kendi mesajını (SendMessages), moderatör herkesinkini (ManageMessages) yayınlayabilir.
func (h *Handler) CrosspostMessage(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message id")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil || ch.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.Type != "announcement" {
		writeError(w, http.StatusBadRequest, "not_announcement", "sadece duyuru kanalındaki mesajlar yayınlanabilir")
		return
	}
	m, err := h.Messages.ByID(r.Context(), messageID)
	if err != nil || m.ChannelID != channelID {
		writeError(w, http.StatusNotFound, "not_found", "mesaj yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	need := perms.ManageMessages
	if m.AuthorID == uid {
		need = perms.SendMessages
	}
	if !h.requirePerm(r, *ch.GuildID, uid, need, w) {
		return
	}
	tag, err := h.Pool.Exec(r.Context(),
		`UPDATE messages SET published_at = NOW() WHERE id = $1 AND published_at IS NULL`, messageID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "güncellenemedi")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusConflict, "already_published", "mesaj zaten yayınlanmış")
		return
	}

	g, err := h.Guilds.ByID(r.Context(), *ch.GuildID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "sunucu okunamadı")
		return
	}
	srcName := fmt.Sprintf("%s • #%s", g.Name, ch.Name)
	atts, _ := h.Attachments.ForMessage(r.Context(), messageID)

	// Zengin embed'leri kaynak mesajdan oku (takipçilere aynen kopyalanacak)
	type embedRow struct {
		url, embedType                      string
		title, description, image, siteName *string
		payload                             []byte
	}
	var embedRows []embedRow
	if erows, err := h.Pool.Query(r.Context(), `
        SELECT url, title, description, image_url, site_name, embed_type, payload
        FROM message_embeds WHERE message_id = $1
    `, messageID); err == nil {
		for erows.Next() {
			var e embedRow
			if erows.Scan(&e.url, &e.title, &e.description, &e.image, &e.siteName, &e.embedType, &e.payload) == nil {
				embedRows = append(embedRows, e)
			}
		}
		erows.Close()
	}

	frows, err := h.Pool.Query(r.Context(), `
        SELECT cf.target_channel_id, tc.guild_id
        FROM channel_follows cf
        JOIN channels tc ON tc.id = cf.target_channel_id
        WHERE cf.source_channel_id = $1 AND tc.guild_id IS NOT NULL
    `, channelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "takipçiler okunamadı")
		return
	}
	type target struct{ channelID, guildID int64 }
	var targets []target
	for frows.Next() {
		var t target
		if frows.Scan(&t.channelID, &t.guildID) == nil {
			targets = append(targets, t)
		}
	}
	frows.Close()

	delivered := 0
	for _, t := range targets {
		nm := &repo.Message{
			ID:        h.IDs.Next(),
			ChannelID: t.channelID,
			AuthorID:  m.AuthorID,
			Content:   m.Content,
			CreatedAt: time.Now(),
		}
		if h.Messages.Create(r.Context(), nm) != nil {
			continue
		}
		for _, a := range atts {
			na := repo.Attachment{
				ID: h.IDs.Next(), MessageID: nm.ID, Filename: a.Filename,
				URL: a.URL, ContentType: a.ContentType, SizeBytes: a.SizeBytes,
			}
			if h.Attachments.Create(r.Context(), &na) == nil {
				nm.Attachments = append(nm.Attachments, na)
			}
		}
		for _, e := range embedRows {
			_, _ = h.Pool.Exec(r.Context(), `
                INSERT INTO message_embeds (id, message_id, url, title, description, image_url, site_name, embed_type, payload)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, h.IDs.Next(), nm.ID, e.url, e.title, e.description, e.image, e.siteName, e.embedType, e.payload)
			if len(e.payload) > 0 {
				nm.Embeds = append(nm.Embeds, json.RawMessage(e.payload))
			}
		}
		_, _ = h.Pool.Exec(r.Context(),
			`INSERT INTO message_webhook (message_id, username, avatar_url) VALUES ($1, $2, $3)`,
			nm.ID, srcName, g.IconURLv2)
		nm.WebhookUsername = &srcName
		nm.WebhookAvatar = g.IconURLv2
		if h.Events != nil {
			avatar := ""
			if g.IconURLv2 != nil {
				avatar = *g.IconURLv2
			}
			h.Events.ToGuild(r.Context(), t.guildID, "MESSAGE_CREATE", map[string]any{
				"message":          nm,
				"channel_id":       strconv.FormatInt(t.channelID, 10),
				"webhook_username": srcName,
				"webhook_avatar":   avatar,
			})
		}
		delivered++
	}

	now := time.Now()
	m.PublishedAt = &now
	h.publishMessageEvent(r.Context(), ch, m, "MESSAGE_UPDATE")
	writeJSON(w, http.StatusOK, map[string]any{"published": true, "delivered_to": delivered})
}
