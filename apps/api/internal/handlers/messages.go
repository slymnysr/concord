package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
	"go.uber.org/zap"
)

type createMessageReq struct {
	Content                string                  `json:"content"`
	RepliedToID            string                  `json:"replied_to_id,omitempty"`
	ReplyPing              *bool                   `json:"reply_ping,omitempty"` // yanıtta orijinal yazarı pingle (varsayılan true)
	Attachments            []createAttachmentInput `json:"attachments,omitempty"`
	ForwardedFromMessageID string                  `json:"forwarded_from_message_id,omitempty"`
	Embeds                 []json.RawMessage       `json:"embeds,omitempty"` // zengin embed (renk/alan/footer)
}

type createAttachmentInput struct {
	URL         string `json:"url"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
}

func (h *Handler) CreateMessage(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id geçersiz")
		return
	}
	var req createMessageReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	// @silent: mesajı kimseye bildirim göndermeden gönder (Discord paritesi)
	silent := strings.HasPrefix(req.Content, "@silent ") || req.Content == "@silent"
	if silent {
		req.Content = strings.TrimSpace(strings.TrimPrefix(req.Content, "@silent"))
	}
	if (len(req.Content) == 0 && len(req.Attachments) == 0 && len(req.Embeds) == 0 && !silent) || len(req.Content) > 4000 {
		writeError(w, http.StatusBadRequest, "invalid_content", "mesaj boş olamaz, en fazla 4000 karakter")
		return
	}
	uid := middleware.UserIDFrom(r.Context())

	// Kanal kontrolü + üyelik kontrolü
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "kanal yok")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "kanal alınamadı")
		return
	}
	if ch.GuildID == nil {
		ok, _ := h.DMs.IsParticipant(r.Context(), ch.ID, uid)
		if !ok {
			writeError(w, http.StatusForbidden, "forbidden", "bu DM'e mesaj atamazsın")
			return
		}
	} else {
		ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid)
		if !ok {
			writeError(w, http.StatusForbidden, "forbidden", "bu kanala mesaj atamazsın")
			return
		}
		chanPerms, err := h.computeChannelPerms(r.Context(), *ch.GuildID, ch.ID, uid)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "izin kontrol")
			return
		}
		if !perms.Has(chanPerms, perms.SendMessages) {
			writeError(w, http.StatusForbidden, "missing_permission", "bu kanala mesaj atma izni yok")
			return
		}

		// Zaman aşımı (timeout) yaptırımı — süresi dolana kadar mesaj gönderilemez
		if until, terr := h.Moderation.ActiveTimeout(r.Context(), *ch.GuildID, uid); terr == nil && until != nil {
			w.Header().Set("Retry-After", strconv.Itoa(int(time.Until(*until).Seconds())+1))
			writeError(w, http.StatusForbidden, "communication_disabled",
				"zaman aşımı uygulandı — "+until.Format(time.RFC3339)+" tarihine kadar mesaj gönderemezsin")
			return
		}

		roleIDs, _ := h.Roles.MemberRoleIDs(r.Context(), *ch.GuildID, uid)

		// Doğrulama seviyesi + müstehcen içerik filtresi (sunucu ayarlarının gerçek davranışı).
		// Muafiyet için @everyone HARİÇ atanmış rol sayısı kullanılır.
		if g, gerr := h.Guilds.ByID(r.Context(), *ch.GuildID); gerr == nil {
			assignedRoles := h.assignedRoleCount(r.Context(), *ch.GuildID, uid)
			if code, msg := h.checkVerificationGate(r.Context(), g, uid, assignedRoles); code != "" {
				writeError(w, http.StatusForbidden, code, msg)
				return
			}
			fileNames := make([]string, 0, len(req.Attachments))
			for _, a := range req.Attachments {
				fileNames = append(fileNames, a.Filename)
			}
			if code, msg := h.checkExplicitContent(g, ch, uid, assignedRoles, req.Content, fileNames); code != "" {
				writeError(w, http.StatusBadRequest, code, msg)
				return
			}
		}

		// AutoMod kontrolü (ManageGuild izni varsa muaf)
		if !perms.Has(chanPerms, perms.ManageGuild) && h.AutoMod != nil {
			decision := h.AutoMod.Inspect(r.Context(), *ch.GuildID, ch.ID, uid, roleIDs, req.Content)
			if decision != nil && decision.Triggered {
				h.AutoMod.LogAction(r.Context(), h.IDs.Next(), decision.RuleID, *ch.GuildID, uid, ch.ID,
					req.Content, decision.MatchedText, "block")
				for _, a := range decision.Actions {
					if a.Type == "block" || a.Type == "delete" {
						writeError(w, http.StatusForbidden, "automod_blocked",
							"Mesaj AutoMod kuralı '"+decision.RuleName+"' tarafından engellendi (eşleşen: "+decision.MatchedText+")")
						return
					}
				}
			}
		}

		// Slowmode enforcement (ManageMessages izni varsa muaf)
		if ch.RateLimitSec > 0 && !perms.Has(chanPerms, perms.ManageMessages) {
			var lastAt *time.Time
			err := h.Pool.QueryRow(r.Context(), `
                SELECT last_at FROM channel_user_throttle WHERE channel_id = $1 AND user_id = $2
            `, ch.ID, uid).Scan(&lastAt)
			if err == nil && lastAt != nil {
				elapsed := time.Since(*lastAt).Seconds()
				remaining := float64(ch.RateLimitSec) - elapsed
				if remaining > 0 {
					w.Header().Set("Retry-After", strconv.Itoa(int(remaining)+1))
					writeError(w, http.StatusTooManyRequests, "slowmode",
						"bu kanalda yavaş modu açık; "+strconv.Itoa(int(remaining)+1)+" sn sonra tekrar dene")
					return
				}
			}
			_, _ = h.Pool.Exec(r.Context(), `
                INSERT INTO channel_user_throttle (channel_id, user_id, last_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (channel_id, user_id) DO UPDATE SET last_at = NOW()
            `, ch.ID, uid)
		}
	}

	// Reply parent kontrolü
	var repliedToID *int64
	var replyAuthorID *int64 // ping atılacak orijinal yazar
	if req.RepliedToID != "" {
		rid, err := strconv.ParseInt(req.RepliedToID, 10, 64)
		if err == nil {
			parent, perr := h.Messages.ByID(r.Context(), rid)
			if perr == nil && parent.ChannelID == channelID {
				repliedToID = &rid
				// Varsayılan: yanıtta orijinal yazarı pingle (kendine yanıt hariç)
				ping := req.ReplyPing == nil || *req.ReplyPing
				if ping && parent.AuthorID != uid {
					aid := parent.AuthorID
					replyAuthorID = &aid
				}
			}
		}
	}

	// Ekleri mesaj YAZILMADAN önce doğrula: enfekte/işlenmemiş ek varsa mesaj hiç oluşmasın
	// (sonra doğrulamak, eki sessizce düşürülmüş yetim bir mesaj bırakırdı).
	resolvedAtt, err := h.resolveAttachments(r.Context(), req.Attachments)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_attachment", err.Error())
		return
	}

	m := &repo.Message{
		ID:          h.IDs.Next(),
		ChannelID:   channelID,
		AuthorID:    uid,
		Content:     req.Content,
		CreatedAt:   time.Now(),
		RepliedToID: repliedToID,
	}
	if err := h.Messages.Create(r.Context(), m); err != nil {
		h.logger.Error("message create", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "internal", "mesaj kaydedilemedi")
		return
	}
	// Mesaj forward: orijinal mesaj ID'sini ve kanalını set et
	if req.ForwardedFromMessageID != "" {
		if fid, perr := strconv.ParseInt(req.ForwardedFromMessageID, 10, 64); perr == nil {
			var fromChannel int64
			if h.Pool.QueryRow(r.Context(), `SELECT channel_id FROM messages WHERE id = $1`, fid).Scan(&fromChannel) == nil {
				_, _ = h.Pool.Exec(r.Context(), `
                    UPDATE messages SET forwarded_from_message_id = $1, forwarded_from_channel_id = $2 WHERE id = $3
                `, fid, fromChannel, m.ID)
			}
		}
	}
	// Mesajda URL varsa link embed parse et (asenkron — basit OG meta fetcher)
	go h.parseAndStoreEmbeds(m.ID, req.Content)
	// Gönderen tarafından sağlanan zengin embed'ler (renk/alan/footer)
	h.storeRichEmbeds(r.Context(), m.ID, req.Embeds)
	m.Embeds = req.Embeds // realtime/HTTP yanıtında inline dönsün

	// Kanalın last_message_id'sini güncelle (unread badge için)
	_, _ = h.Pool.Exec(r.Context(), `UPDATE channels SET last_message_id = $1 WHERE id = $2`, m.ID, channelID)

	// Attachment'ları ekle — metadata resolveAttachments'tan (sunucu tespiti), istemciden DEĞİL.
	//
	// m.Attachments'ı DA doldurmak ŞART: hem HTTP yanıtı hem MESSAGE_CREATE olayı `m`'i
	// serileştirir. Doldurulmazsa (eski hali) ek DB'ye yazılır ama ne gönderen yanıtında ne de
	// diğer istemcilerin realtime olayında görünür → görsel, sayfa yenilenip ListMessages
	// çağrılana kadar HİÇ ÇIKMAZ. ListMessages doğru dolduruyordu; sessiz tutarsızlık buydu.
	for _, ra := range resolvedAtt {
		att := &repo.Attachment{
			ID:        h.IDs.Next(),
			MessageID: m.ID,
			// DB'de DEFAULT NOW() var ama yanıt struct'tan serileşiyor → doldurulmazsa
			// istemci created_at olarak "0001-01-01" görür
			CreatedAt:   m.CreatedAt,
			Filename:    ra.in.Filename,
			URL:         ra.in.URL,
			ContentType: ra.contentT,
			SizeBytes:   ra.size,
			Width:       ra.width,
			Height:      ra.height,
			ThumbURL:    ra.thumbURL,
		}
		if err := h.Attachments.Create(r.Context(), att); err != nil {
			h.logger.Error("ek kaydedilemedi", zap.Error(err), zap.Int64("message", m.ID))
			continue
		}
		m.Attachments = append(m.Attachments, *att)
	}

	// Mention parse + bildirim (yanıt yazarı da pinglenir). @silent ise hiç bildirim yok.
	var mentioned []int64
	if !silent {
		mentioned = h.parseAndPersistMentions(r.Context(), ch, m, replyAuthorID)
		// Anahtar kelime bildirimleri (mention edilmeyenlere)
		h.notifyKeywords(r.Context(), ch, m, mentioned)
	}

	// DM mesajları için: mention dışında kalan diğer katılımcılara dm_message bildirimi
	if ch.GuildID == nil && !silent {
		others, _ := h.DMs.Participants(r.Context(), ch.ID)
		mentionedSet := map[int64]bool{}
		for _, mid := range mentioned {
			mentionedSet[mid] = true
		}
		for _, pid := range others {
			if pid == uid || mentionedSet[pid] {
				continue
			}
			dmN := &repo.Notification{
				ID:        h.IDs.Next(),
				UserID:    pid,
				Type:      "dm_message",
				ChannelID: &ch.ID,
				MessageID: &m.ID,
				ActorID:   &uid,
			}
			_ = h.Notifications.Create(r.Context(), dmN)
			h.pushForNotification(dmN, h.actorName(r.Context(), uid), pushPreview(m.Content))
		}
	}

	h.publishMessage(r.Context(), ch, m)

	writeJSON(w, http.StatusCreated, m)
}

func (h *Handler) ListMessages(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id geçersiz")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID != nil {
		ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid)
		if !ok {
			writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
			return
		}
		chanPerms, err := h.computeChannelPerms(r.Context(), *ch.GuildID, ch.ID, uid)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "izin kontrol")
			return
		}
		if !perms.Has(chanPerms, perms.ViewChannel) {
			writeError(w, http.StatusForbidden, "missing_permission", "bu kanalı göremezsin")
			return
		}
	} else {
		ok, _ := h.DMs.IsParticipant(r.Context(), ch.ID, uid)
		if !ok {
			writeError(w, http.StatusForbidden, "forbidden", "bu DM'in katılımcısı değilsin")
			return
		}
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit == 0 {
		limit = 50
	}
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	list, err := h.Messages.ListByChannel(r.Context(), channelID, before, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "mesajlar alınamadı")
		return
	}
	if list == nil {
		list = []repo.Message{}
	}
	// Reaction'ları TEK sorguda getir + göm (web'in mesaj başına ayrı istek atmasını önler).
	if len(list) > 0 {
		ids := make([]int64, len(list))
		for i := range list {
			ids[i] = list[i].ID
		}
		viewer := middleware.UserIDFrom(r.Context())
		if byMsg, rerr := h.Reactions.ForMessages(r.Context(), ids, viewer); rerr == nil {
			for i := range list {
				if rs := byMsg[list[i].ID]; len(rs) > 0 {
					list[i].Reactions = rs
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) publishMessage(ctx context.Context, ch *repo.Channel, m *repo.Message) {
	if h.Redis == nil {
		return
	}
	author, _ := h.Users.ByID(ctx, m.AuthorID)
	base := map[string]any{
		"type":       "MESSAGE_CREATE",
		"channel_id": strconv.FormatInt(ch.ID, 10),
		"message":    m,
		"author":     author,
		"ts":         time.Now().UnixMilli(),
	}
	if ch.GuildID != nil {
		base["guild_id"] = strconv.FormatInt(*ch.GuildID, 10)
		payload, _ := json.Marshal(base)
		topic := "concord:guild:" + strconv.FormatInt(*ch.GuildID, 10)
		_, _ = h.Redis.Publish(ctx, topic, payload).Result()
		return
	}
	// DM — her katılımcıya user topic'iyle yayınla
	payload, _ := json.Marshal(base)
	rows, err := h.Pool.Query(ctx, `SELECT user_id FROM dm_participants WHERE channel_id = $1`, ch.ID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var uid int64
		if err := rows.Scan(&uid); err == nil {
			_, _ = h.Redis.Publish(ctx, "concord:user:"+strconv.FormatInt(uid, 10), payload).Result()
		}
	}
}
