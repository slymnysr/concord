package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
}

func fire(mw func(http.Handler) http.Handler, ip string) int {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = ip
	mw(okHandler()).ServeHTTP(rec, req)
	return rec.Code
}

// Tek instance: max'tan sonra 429.
func TestRateLimit_BlocksAfterMax(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	mw := NewLimiter(rdb).Limit("t", 3, time.Minute)

	allowed, blocked := 0, 0
	for i := 0; i < 5; i++ {
		if fire(mw, "1.2.3.4:1000") == http.StatusTooManyRequests {
			blocked++
		} else {
			allowed++
		}
	}
	if allowed != 3 || blocked != 2 {
		t.Fatalf("beklenen 3 izin / 2 blok, gelen %d/%d", allowed, blocked)
	}
}

// İKİ ayrı limiter (iki API instance'ı), AYNI Redis → ortak sayaç (dağıtık kanıtı).
// in-memory olsaydı her instance kendi 4'ünü sayardı, blok olmazdı.
func TestRateLimit_SharedAcrossInstances(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	mw1 := NewLimiter(redis.NewClient(&redis.Options{Addr: mr.Addr()})).Limit("t", 4, time.Minute)
	mw2 := NewLimiter(redis.NewClient(&redis.Options{Addr: mr.Addr()})).Limit("t", 4, time.Minute)

	// Aynı IP, iki instance'a dağıtık 5 istek: 4 izin (ortak kapasite) + 1 blok
	codes := []int{
		fire(mw1, "9.9.9.9:1"), fire(mw2, "9.9.9.9:1"),
		fire(mw1, "9.9.9.9:1"), fire(mw2, "9.9.9.9:1"),
		fire(mw1, "9.9.9.9:1"),
	}
	blocked := 0
	for _, c := range codes {
		if c == http.StatusTooManyRequests {
			blocked++
		}
	}
	if blocked != 1 {
		t.Fatalf("ortak sayaç bekleniyordu (4 izin sonra 1 blok); blok=%d codes=%v", blocked, codes)
	}
}

// Farklı IP'ler birbirini tüketmez.
func TestRateLimit_PerIPIsolated(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	mw := NewLimiter(redis.NewClient(&redis.Options{Addr: mr.Addr()})).Limit("t", 2, time.Minute)
	// IP-A 2 izin + 1 blok; IP-B hâlâ izinli olmalı
	fire(mw, "10.0.0.1:1")
	fire(mw, "10.0.0.1:1")
	if fire(mw, "10.0.0.1:1") != http.StatusTooManyRequests {
		t.Fatal("IP-A 3. istek bloklanmalıydı")
	}
	if fire(mw, "10.0.0.2:1") != http.StatusOK {
		t.Fatal("IP-B ayrı sayaç olmalı, izin vermeliydi")
	}
}
