package push

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Expo Push Service — mobil uygulamanın getExpoPushTokenAsync ile aldığı token'a gönderir.
// Expo, FCM (Android) ve APNs (iOS) iletimini kendisi yapar; bizim FCM anahtarı taşımamız
// gerekmez (EAS tarafında yapılandırılır).
const expoPushURL = "https://exp.host/--/api/v2/push/send"

// Expo tek istekte en fazla 100 bildirim kabul eder.
const expoBatchSize = 100

type ExpoSender struct {
	cfg    Config
	client *http.Client
}

func NewExpoSender(cfg Config) *ExpoSender {
	return &ExpoSender{cfg: cfg, client: &http.Client{Timeout: 15 * time.Second}}
}

type expoMessage struct {
	To       string            `json:"to"`
	Title    string            `json:"title"`
	Body     string            `json:"body"`
	Data     map[string]string `json:"data,omitempty"`
	Sound    string            `json:"sound,omitempty"`
	Priority string            `json:"priority,omitempty"`
}

type expoTicket struct {
	Status  string `json:"status"`
	ID      string `json:"id"`
	Message string `json:"message"`
	Details struct {
		Error string `json:"error"`
	} `json:"details"`
}

type expoResponse struct {
	Data   []expoTicket `json:"data"`
	Errors []struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"errors"`
}

func (e *ExpoSender) Send(ctx context.Context, subs []Subscription, m Message) []Result {
	out := make([]Result, 0, len(subs))
	for start := 0; start < len(subs); start += expoBatchSize {
		end := start + expoBatchSize
		if end > len(subs) {
			end = len(subs)
		}
		out = append(out, e.sendBatch(ctx, subs[start:end], m)...)
	}
	return out
}

func (e *ExpoSender) sendBatch(ctx context.Context, subs []Subscription, m Message) []Result {
	msgs := make([]expoMessage, len(subs))
	for i, s := range subs {
		msgs[i] = expoMessage{
			To:       s.Endpoint,
			Title:    m.Title,
			Body:     m.Body,
			Data:     m.Data,
			Sound:    "default",
			Priority: "high",
		}
	}

	body, err := json.Marshal(msgs)
	if err != nil {
		return failAll(subs, err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, expoPushURL, bytes.NewReader(body))
	if err != nil {
		return failAll(subs, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if e.cfg.ExpoAccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+e.cfg.ExpoAccessToken)
	}

	resp, err := e.client.Do(req)
	if err != nil {
		return failAll(subs, err)
	}
	defer resp.Body.Close()

	var er expoResponse
	if err := json.NewDecoder(resp.Body).Decode(&er); err != nil {
		return failAll(subs, fmt.Errorf("expo yanıtı çözülemedi (HTTP %d): %w", resp.StatusCode, err))
	}
	if len(er.Errors) > 0 {
		return failAll(subs, fmt.Errorf("expo hatası: %s — %s", er.Errors[0].Code, er.Errors[0].Message))
	}
	// Ticket sayısı istekle eşleşmezse eşleme yapamayız → hepsini hatalı say (sessizce
	// "gitti" demek, gitmemiş bildirimleri başarılı göstermek olurdu)
	if len(er.Data) != len(subs) {
		return failAll(subs, fmt.Errorf("expo %d ticket döndü, %d bekleniyordu", len(er.Data), len(subs)))
	}

	out := make([]Result, len(subs))
	for i, t := range er.Data {
		r := Result{Sub: subs[i]}
		if t.Status != "ok" {
			r.Err = fmt.Errorf("expo: %s (%s)", t.Message, t.Details.Error)
			// DeviceNotRegistered = uygulama silindi/token geçersiz → abonelik ÖLÜ
			r.Gone = t.Details.Error == "DeviceNotRegistered"
		}
		out[i] = r
	}
	return out
}

func failAll(subs []Subscription, err error) []Result {
	out := make([]Result, len(subs))
	for i, s := range subs {
		out[i] = Result{Sub: s, Err: err}
	}
	return out
}
