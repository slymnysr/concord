// Anahtar üretici — .env için gereken tüm secret'ları üretir.
//
// NEDEN AYRI ARAÇ: anahtarların elle "rastgele" yazılması en yaygın hatalardan biri —
// insan üretimi diziler tahmin edilebilir. Hepsi crypto/rand'dan gelir.
// VAPID özel: Web Push protokolü P-256 ECDSA çifti ister, rastgele bayt yetmez.
//
// Kullanım: go run ./cmd/genkeys  (veya `make keys`)
package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func rnd(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		fmt.Fprintln(os.Stderr, "rastgele üretilemedi:", err)
		os.Exit(1)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func hexRnd(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		fmt.Fprintln(os.Stderr, "rastgele üretilemedi:", err)
		os.Exit(1)
	}
	return hex.EncodeToString(b)
}

func main() {
	// Web Push VAPID — P-256 ECDSA çifti (protokol gereği; rastgele bayt İŞE YARAMAZ)
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		fmt.Fprintln(os.Stderr, "VAPID üretilemedi:", err)
		os.Exit(1)
	}

	fmt.Printf("JWT_SECRET=%s\n", rnd(48))
	fmt.Printf("VOICE_CONTROL_SECRET=%s\n", rnd(32))
	fmt.Printf("VOICE_CLUSTER_SECRET=%s\n", rnd(32))
	fmt.Printf("MEDIA_EVENT_SECRET=%s\n", rnd(32))
	fmt.Printf("MEILI_MASTER_KEY=%s\n", rnd(32))
	fmt.Printf("SECRET_KEY_BASE=%s\n", rnd(48))
	fmt.Printf("RELEASE_COOKIE=%s\n", hexRnd(32))
	fmt.Printf("VAPID_PUBLIC_KEY=%s\n", pub)
	fmt.Printf("VAPID_PRIVATE_KEY=%s\n", priv)
	fmt.Printf("POSTGRES_PASSWORD=%s\n", rnd(24))
	fmt.Printf("MINIO_SECRET_KEY=%s\n", rnd(24))
	fmt.Printf("GRAFANA_PASSWORD=%s\n", rnd(18))
}
