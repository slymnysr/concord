package push

import (
	"context"
	"encoding/json"
	"net/http"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// Web Push (VAPID) — tarayıcı aboneliklerine gönderir. Payload, aboneliğin p256dh/auth
// anahtarlarıyla ŞİFRELENİR; anahtarlar olmadan gönderim yapılamaz (protokol gereği).
type WebSender struct {
	cfg Config
}

func NewWebSender(cfg Config) *WebSender { return &WebSender{cfg: cfg} }

func (w *WebSender) enabled() bool {
	return w.cfg.VAPIDPublicKey != "" && w.cfg.VAPIDPrivateKey != ""
}

func (w *WebSender) Send(ctx context.Context, subs []Subscription, m Message) []Result {
	if !w.enabled() {
		// Sessizce başarılı saymak, bildirimlerin gittiğini sanmamıza yol açardı
		return failAll(subs, ErrNotConfigured)
	}

	payload, err := json.Marshal(map[string]any{"title": m.Title, "body": m.Body, "data": m.Data})
	if err != nil {
		return failAll(subs, err)
	}

	out := make([]Result, 0, len(subs))
	for _, s := range subs {
		r := Result{Sub: s}
		resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
			Endpoint: s.Endpoint,
			Keys:     webpush.Keys{P256dh: s.P256DH, Auth: s.Auth},
		}, &webpush.Options{
			Subscriber:      w.cfg.VAPIDSubject,
			VAPIDPublicKey:  w.cfg.VAPIDPublicKey,
			VAPIDPrivateKey: w.cfg.VAPIDPrivateKey,
			TTL:             60 * 60 * 24, // 1 gün: cihaz kapalıysa açılınca alsın
		})
		if err != nil {
			r.Err = err
			out = append(out, r)
			continue
		}
		resp.Body.Close()
		// 404/410 = abonelik ölü (tarayıcı izni iptal / profil silindi)
		if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
			r.Gone = true
			r.Err = errStatus(resp.StatusCode)
		} else if resp.StatusCode >= 300 {
			r.Err = errStatus(resp.StatusCode)
		}
		out = append(out, r)
	}
	return out
}

type statusErr int

func (s statusErr) Error() string { return "web push HTTP " + http.StatusText(int(s)) }
func errStatus(code int) error    { return statusErr(code) }
