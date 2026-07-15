# FAZ 2 — Medya Boru Hattı (yürütücü: DİĞER AI)

> Doktrin geçerli (`docs/ROADMAP-FAZLAR.md` §0). Bu faz **backend-only**; web/mobil'e dokunma.
> **FAZ 1 ile HİÇBİR ortak dosyan yok** — aşağıdaki sınıra harfiyen uy.

## 0. Bağlam (mevcut durum — okundu)
- Upload akışı **presigned**: istemci `/uploads/presign`'dan URL alır, dosyayı **doğrudan MinIO'ya**
  PUT eder. **API dosya baytlarını görmez.** (Avatar/emoji/mesaj eki hepsi bu yolu kullanır.)
- Bu yüzden işleme (resize/tarama) senkron yapılamaz → **MinIO nesne-oluşturma event'i** ile
  asenkron işlenir. Bu, hem doğru (S3/Discord deseni) hem de tüm upload türlerini kapsar.

## 1. DOSYA SAHİPLİĞİ (kesin sınır)
- ✅ **SADECE bu faz düzenler / oluşturur:**
  - `apps/api/internal/handlers/uploads.go` (presign sıkılaştırma)
  - `apps/api/internal/storage/minio.go` (GetObject/StatObject/PutVariant helper'ları)
  - YENİ `apps/api/internal/media/*.go` (işleme boru hattı — kendi paketi)
  - YENİ `apps/api/internal/handlers/media_events.go` (MinIO event webhook handler)
  - YENİ `apps/api/internal/router/routes_media.go` (self-registration ile route)
- ⛔ **ASLA DOKUNMA (FAZ 1 / diğer fazların):**
  - `router.go` (bunun yerine `routes_media.go`), `config.go` (env'i kendi paketinde oku),
    `main.go`, `middleware/*`, `messages.go`, `apps/web/*`, `apps/mobile/*`, `infra/*`
    (MinIO event + ClamAV **container** kurulumu FAZ I'in; sen sadece KODU yazarsın.)

## 2. FAZ 1 & FAZ I İLE SÖZLEŞME (ortak dosya YOK, kontrat VAR)
- **Route ekleme (FAZ 1'den):** `routes_media.go` içinde:
  ```go
  package router
  func init() {
      RegisterInternalRoutes(func(r chi.Router, h *handlers.Handler) {
          r.Post("/internal/media/events", h.MediaEvent) // MinIO webhook, secret korumalı
      })
      RegisterAuthedRoutes(func(r chi.Router, h *handlers.Handler) {
          r.Get("/attachments/{id}/thumbnail", h.AttachmentThumbnail) // gerekiyorsa
      })
  }
  ```
  (`RegisterAuthedRoutes`/`RegisterInternalRoutes` FAZ 1 §2.1'de tanımlı. FAZ 1 daha merge
  olmadıysa bu imzaya kodla; merge'de kenetlenir.)
- **MinIO event (FAZ I'den):** MinIO, `s3:ObjectCreated:*` olayını
  `POST /api/v1/internal/media/events` adresine, `X-Media-Secret: $MEDIA_EVENT_SECRET`
  header'ıyla gönderir. Sen bu secret'ı **kendi paketinde** `os.Getenv("MEDIA_EVENT_SECRET")`
  ile oku (config.go'ya EKLEME). FAZ I MinIO'yu buna göre yapılandırır.

## 3. ALT-GÖREVLER

### 3.1 Presign sıkılaştırma (uploads.go)
- Presigned POST **policy koşulları**: izinli `Content-Type` allowlist + **max boyut** (tip başına).
- Bir **pending attachment** kaydı oluştur (durum: `processing`), anahtar (key) + sahip + tür ile.
- ⚠️ **Yapma:** her tipe sınırsız boyut/tip — kötüye kullanım kapısı.

### 3.2 Storage helper'ları (storage/minio.go)
- `GetObject(ctx, key) (io.ReadCloser, error)`, `StatObject`, `PutVariant(ctx, key, variant, r, contentType)`.
- Varyant anahtar deseni: `orig/<key>`, `thumb/<key>` gibi.

### 3.3 İşleme boru hattı (YENİ internal/media/)
Sıra (her adım doğru araçla, kütüphaneyle — stub yok):
1. **İndir** (StatObject boyut + GetObject).
2. **Doğrula**: magic-byte ile gerçek tip (uzantıya güvenme), boyut sınırı, izinli tür.
3. **Görüntüyse**: EXIF **temizle**, gerekiyorsa yeniden-kodla, **thumbnail üret** (ör. 400px)
   (Go: `disintegration/imaging` veya `h2non/bimg` — saf Go/harici servis gerektirmez).
4. **Virüs tarama**: `internal/media/scan.go` — ClamAV INSTREAM istemcisi.
   `os.Getenv("CLAMAV_ADDR")` boşsa **atla + uyar** (fail-open dev; prod'da FAZ I doldurur).
   ⚠️ **Yapma:** taramayı hiç yazma / "sonra ekleriz" deme — arayüz + istemci bu fazda tam olacak.
5. **Sonuç**: varyantları PutVariant ile yaz, attachment kaydını `ready` + thumbnail anahtarıyla güncelle.
   Kötü/enfekte dosyada: kaydı `rejected` yap, orijinali sil.

### 3.4 Event webhook (handlers/media_events.go)
- `MediaEvent(w, r)`: `X-Media-Secret` doğrula (sabit-zaman karşılaştırma), MinIO event JSON'ını parse et,
  her yeni nesne için 3.3 boru hattını (goroutine/kuyruk ile) tetikle. Hızlı 200 dön.
- ⚠️ **Yapma:** secret'ı gevşek karşılaştırma / event'i senkron işleyip webhook'u bloklama.

## 4. TEST (bu fazın parçası)
- `media/*_test.go`: kötü-amaçlı/yanlış-tip dosya reddi (magic-byte), EXIF temizlendi, thumbnail üretildi.
- Enfekte imza (EICAR) → ClamAV varsa `rejected`.
- Webhook: yanlış secret → 401; doğru secret → işleme tetiklenir.

## 5. BİTTİ TANIMI
- Presign tip/boyut zorluyor; yeni upload MinIO event'iyle otomatik işleniyor
  (doğrulama + EXIF-temizleme + thumbnail + tarama), attachment `ready`/`rejected` oluyor.
- `routes_media.go` FAZ 1 mekanizmasıyla route ekliyor; `router.go`/`config.go`/`messages.go`
  **değişmedi** (git diff kanıtlar).
- `go build ./... && go test ./...` yeşil.

## 6. FAZ I'e NOT (ayrı faz — sadece bilgi)
Container + wiring FAZ I'de: ClamAV servisi (`CLAMAV_ADDR`), MinIO bucket notification
(`s3:ObjectCreated:*` → webhook + `MEDIA_EVENT_SECRET`), CDN prefix. Kod tarafı (bu faz) hazır olacak.
