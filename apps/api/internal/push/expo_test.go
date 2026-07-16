package push

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Expo uç noktasını test sunucusuna yönlendirir (gerçek ağa çıkmadan protokolü doğrular).
func withExpoServer(t *testing.T, h http.HandlerFunc) *ExpoSender {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	s := NewExpoSender(Config{})
	s.url = srv.URL
	return s
}

func sub(token string) Subscription {
	return Subscription{UserID: 1, Platform: "expo", Endpoint: token}
}

func TestExpoSend_Basarili(t *testing.T) {
	s := withExpoServer(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var msgs []expoMessage
		if err := json.Unmarshal(body, &msgs); err != nil {
			t.Errorf("gövde çözülemedi: %v", err)
		}
		if len(msgs) != 1 || msgs[0].To != "ExponentPushToken[abc]" {
			t.Errorf("beklenmeyen gövde: %s", body)
		}
		if msgs[0].Title != "Ayşe" || msgs[0].Body != "merhaba" {
			t.Errorf("başlık/gövde taşınmadı: %+v", msgs[0])
		}
		_, _ = w.Write([]byte(`{"data":[{"status":"ok","id":"t1"}]}`))
	})

	res := s.Send(context.Background(), []Subscription{sub("ExponentPushToken[abc]")}, Message{Title: "Ayşe", Body: "merhaba"})
	if len(res) != 1 || res[0].Err != nil {
		t.Fatalf("başarılı bekleniyordu: %+v", res)
	}
}

// DeviceNotRegistered = uygulama silinmiş/token ölü → abonelik SİLİNMELİ. İşaretlenmezse
// her bildirimde boşuna denenir ve Expo bizi kısıtlar.
func TestExpoSend_OluAbonelikIsaretlenir(t *testing.T) {
	s := withExpoServer(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"status":"error","message":"not registered","details":{"error":"DeviceNotRegistered"}}]}`))
	})

	res := s.Send(context.Background(), []Subscription{sub("ExponentPushToken[olu]")}, Message{Title: "x"})
	if len(res) != 1 || !res[0].Gone {
		t.Fatalf("Gone=true bekleniyordu: %+v", res)
	}
}

// Başka hatalar aboneliği ÖLDÜRMEMELİ (geçici sorun yüzünden cihazı kaybetmeyelim)
func TestExpoSend_GeciciHataOldurmez(t *testing.T) {
	s := withExpoServer(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"status":"error","message":"kota","details":{"error":"MessageRateExceeded"}}]}`))
	})

	res := s.Send(context.Background(), []Subscription{sub("ExponentPushToken[a]")}, Message{Title: "x"})
	if res[0].Err == nil {
		t.Fatal("hata bekleniyordu")
	}
	if res[0].Gone {
		t.Fatal("geçici hata aboneliği öldürmemeli")
	}
}

// Ticket sayısı istekle eşleşmezse hangi ticket'ın hangi aboneliğe ait olduğu bilinemez →
// hepsini hatalı say. "Gitti" demek, gitmemiş bildirimleri başarılı göstermek olurdu.
func TestExpoSend_TicketSayisiUyusmazsaHataSayilir(t *testing.T) {
	s := withExpoServer(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"status":"ok","id":"t1"}]}`))
	})

	res := s.Send(context.Background(), []Subscription{sub("a"), sub("b")}, Message{Title: "x"})
	if len(res) != 2 || res[0].Err == nil || res[1].Err == nil {
		t.Fatalf("hepsi hatalı olmalıydı: %+v", res)
	}
}

func TestExpoSend_ToplamaBolunur(t *testing.T) {
	// Expo tek istekte en fazla 100 kabul eder → 150 abonelik 2 isteğe bölünmeli
	var istekler int
	s := withExpoServer(t, func(w http.ResponseWriter, r *http.Request) {
		istekler++
		var msgs []expoMessage
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &msgs)
		if len(msgs) > expoBatchSize {
			t.Errorf("%d bildirim gönderildi, sınır %d", len(msgs), expoBatchSize)
		}
		tickets := make([]string, len(msgs))
		for i := range msgs {
			tickets[i] = `{"status":"ok","id":"t"}`
		}
		_, _ = w.Write([]byte(`{"data":[` + join(tickets) + `]}`))
	})

	subs := make([]Subscription, 150)
	for i := range subs {
		subs[i] = sub("ExponentPushToken[x]")
	}
	res := s.Send(context.Background(), subs, Message{Title: "x"})
	if len(res) != 150 {
		t.Fatalf("150 sonuç bekleniyordu, %d geldi", len(res))
	}
	if istekler != 2 {
		t.Fatalf("2 istek bekleniyordu, %d yapıldı", istekler)
	}
}

func join(xs []string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += ","
		}
		out += x
	}
	return out
}
