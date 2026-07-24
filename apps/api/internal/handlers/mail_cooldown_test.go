package handlers

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// Mail bombing koruması gerçekten çalışıyor mu? Bir saldırgan kurbanın adresini
// forgot-password/change-email'e tekrar tekrar girip inbox'ını dolduramamalı.
func TestMailCooldown(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis: %v", err)
	}
	t.Cleanup(mr.Close)
	h := &Handler{Redis: redis.NewClient(&redis.Options{Addr: mr.Addr()})}
	ctx := context.Background()

	// 1) İlk istek geçmeli (meşru kullanıcı maili almalı)
	if !h.mailCooldownGeçti(ctx, "kurban@x.com") {
		t.Fatal("ilk istek engellendi — cooldown meşru sıfırlamayı kırıyor")
	}
	// 2) Aynı adrese HEMEN ikinci istek ENGELLENMELİ — mail bombing burada durur
	if h.mailCooldownGeçti(ctx, "kurban@x.com") {
		t.Fatal("aynı adrese ikinci mail geçti — MAIL BOMBING mümkün")
	}
	// 3) Harf/boşluk varyantı da AYNI adres sayılmalı (normalize) — yoksa "KURBAN@x.com"
	//    ile cooldown atlatılırdı
	if h.mailCooldownGeçti(ctx, "  KURBAN@X.com ") {
		t.Fatal("harf/boşluk varyantı cooldown'ı atlattı — normalize eksik")
	}
	// 4) Farklı adres bağımsız olmalı (bir kullanıcının cooldown'ı başkasını kilitlemesin)
	if !h.mailCooldownGeçti(ctx, "baskasi@x.com") {
		t.Fatal("farklı adres engellendi — cooldown adres başına değil, global")
	}
	// 5) Pencere dolunca aynı adres tekrar geçmeli (kalıcı kilit değil)
	mr.FastForward(mailCooldownWindow + time.Second)
	if !h.mailCooldownGeçti(ctx, "kurban@x.com") {
		t.Fatal("pencere sonrası hâlâ engelli — cooldown süresi bitmiyor")
	}
}

// Redis yoksa fail-open: mail engellenmemeli (Redis arızası meşru sıfırlamayı kilitlememeli;
// kaba kötüye kullanımı IP rate-limit yine keser).
func TestMailCooldown_RedisYok(t *testing.T) {
	h := &Handler{Redis: nil}
	if !h.mailCooldownGeçti(context.Background(), "x@x.com") {
		t.Fatal("Redis yokken mail engellendi — fail-open olmalı")
	}
}
