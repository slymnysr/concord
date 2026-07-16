// Push bildirimi GÖNDERİMİ.
//
// NEDEN BU PAKET VAR: abonelikler kaydediliyordu ama HİÇBİR YERDE push gönderilmiyordu —
// kullanıcı izin verir, token yazılır, bildirim asla gitmezdi. Kurulu ama kullanılmayan
// altyapı (ScyllaDB'de yaşanan hata) burada da vardı.
//
// İki protokol: 'expo' → Expo Push Service (FCM/APNs'e kendisi iletir; mobil uygulama
// getExpoPushTokenAsync ile bu token'ı alır), 'web' → VAPID şifreli Web Push.
package push

import (
	"context"
	"errors"
)

// Message — protokolden bağımsız bildirim içeriği.
type Message struct {
	Title string
	Body  string
	// İstemcinin bildirime tıklayınca doğru yere gitmesi için (kanal/mesaj kimlikleri)
	Data map[string]string
}

// Subscription — bir cihaz/tarayıcı aboneliği.
type Subscription struct {
	UserID   int64
	Platform string // "web" | "expo"
	Endpoint string // web: push servisi URL'i, expo: ExponentPushToken[...]
	P256DH   string
	Auth     string
}

// Result — gönderim sonucu. Gone=true ise abonelik ÖLÜ (cihaz kaldırıldı/izin iptal) →
// çağıran satırı silmeli, yoksa her bildirimde boşuna denenir ve servis bizi kısıtlar.
type Result struct {
	Sub  Subscription
	Err  error
	Gone bool
}

var ErrNotConfigured = errors.New("push yapılandırılmadı")

// Sender — tüm protokolleri kapsayan gönderici.
type Sender struct {
	expo *ExpoSender
	web  *WebSender
}

func NewSender(cfg Config) *Sender {
	return &Sender{expo: NewExpoSender(cfg), web: NewWebSender(cfg)}
}

type Config struct {
	// Expo access token — yalnızca "enhanced security" açıksa gerekir; boş olabilir.
	ExpoAccessToken string
	// Web Push VAPID anahtarları. Boşsa web push KAPALIDIR (şifreleme anahtarsız yapılamaz).
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string // "mailto:..." — push servisleri iletişim adresi ister
}

// Send — abonelikleri protokolüne göre böler ve gönderir. Bir protokol yapılandırılmamışsa
// o aboneliklerin sonucu ErrNotConfigured olur (sessizce başarılı sayılmaz).
func (s *Sender) Send(ctx context.Context, subs []Subscription, m Message) []Result {
	var expoSubs, webSubs []Subscription
	for _, sub := range subs {
		switch sub.Platform {
		case "expo":
			expoSubs = append(expoSubs, sub)
		default:
			webSubs = append(webSubs, sub)
		}
	}

	out := make([]Result, 0, len(subs))
	if len(expoSubs) > 0 {
		out = append(out, s.expo.Send(ctx, expoSubs, m)...)
	}
	if len(webSubs) > 0 {
		out = append(out, s.web.Send(ctx, webSubs, m)...)
	}
	return out
}

// WebEnabled — VAPID yapılandırıldı mı (public key'i istemciye vermek için).
func (s *Sender) WebEnabled() bool { return s.web.enabled() }

func (s *Sender) VAPIDPublicKey() string { return s.web.cfg.VAPIDPublicKey }
