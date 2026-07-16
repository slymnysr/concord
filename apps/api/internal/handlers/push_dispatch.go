package handlers

import (
	"context"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/concord/api/internal/push"
	"github.com/concord/api/internal/repo"
)

// pushForNotification — bir bildirim üretildiğinde ilgili kullanıcının cihazlarına push atar.
//
// NEDEN AYRI DOSYA: bildirim üretimi 6 ayrı yerde (mention, DM, arkadaşlık, anahtar kelime,
// hatırlatıcı, olay). Her birine gönderim kodu serpiştirmek yerine tek giriş noktası.
//
// ARKA PLANDA: Expo/Web Push ağ çağrısıdır (saniyeler sürebilir); istek context'ine bağlamak
// mesaj gönderimini push servisinin hızına bağlardı. İstek bitse de gönderim sürmeli.
func (h *Handler) pushForNotification(n *repo.Notification, title, body string) {
	if h.Push == nil {
		return
	}
	data := map[string]string{"type": n.Type}
	if n.ChannelID != nil {
		data["channel_id"] = strconv.FormatInt(*n.ChannelID, 10)
	}
	if n.GuildID != nil {
		data["guild_id"] = strconv.FormatInt(*n.GuildID, 10)
	}
	if n.MessageID != nil {
		data["message_id"] = strconv.FormatInt(*n.MessageID, 10)
	}
	go h.sendPush(n.UserID, push.Message{Title: title, Body: body, Data: data})
}

func (h *Handler) sendPush(userID int64, m push.Message) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	subs, err := h.PushSubs.ForUser(ctx, userID)
	if err != nil {
		h.logger.Error("push abonelikleri okunamadı", zap.Error(err), zap.Int64("user", userID))
		return
	}
	if len(subs) == 0 {
		return
	}

	list := make([]push.Subscription, len(subs))
	for i, s := range subs {
		list[i] = push.Subscription{
			UserID: s.UserID, Platform: s.Platform, Endpoint: s.Endpoint,
			P256DH: s.P256DH, Auth: s.Auth,
		}
	}

	for _, r := range h.Push.Send(ctx, list, m) {
		if r.Gone {
			// Ölü aboneliği işaretle: yoksa her bildirimde boşuna denenir ve push servisi
			// bizi kısıtlamaya başlar.
			if err := h.PushSubs.MarkDead(ctx, r.Sub.UserID, r.Sub.Endpoint); err != nil {
				h.logger.Warn("ölü abonelik işaretlenemedi", zap.Error(err))
			}
			continue
		}
		if r.Err != nil {
			h.logger.Warn("push gönderilemedi", zap.Error(r.Err),
				zap.String("platform", r.Sub.Platform), zap.Int64("user", r.Sub.UserID))
		}
	}
}

// actorName — bildirimi tetikleyen kullanıcının görünen adı (push başlığı).
// Ad çözülemezse "Concord": başlıksız bildirim göndermektense jenerik başlık daha iyi.
func (h *Handler) actorName(ctx context.Context, userID int64) string {
	u, err := h.Users.ByID(ctx, userID)
	if err != nil || u == nil {
		return "Concord"
	}
	if u.DisplayName != "" {
		return u.DisplayName
	}
	return u.Username
}

// pushPreview — mesaj önizlemesi. Push payload'ları boyut sınırlıdır (Web Push ~4KB,
// APNs 4KB) ve kilit ekranında zaten kırpılır → makul uzunlukta kes.
func pushPreview(content string) string {
	const max = 140
	c := strings.TrimSpace(content)
	if c == "" {
		return "Yeni mesaj"
	}
	r := []rune(c)
	if len(r) > max {
		return string(r[:max]) + "…"
	}
	return c
}
