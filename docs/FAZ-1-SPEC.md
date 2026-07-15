# FAZ 1 — API Çekirdek & Güvenlik Tabanı (yürütücü: ANA AI)

> Doktrin geçerli (`docs/ROADMAP-FAZLAR.md` §0). İlk zorlukta kötü seçeneğe kaçma,
> stub/TODO bırakma, kendi bölgenin dışına çıkma.

## 0. Neden bu faz önce?
`router.go` bir darboğaz. Bu faz onu **self-registration** desenine çevirir → bundan sonra
FAZ 2/3/W2 route'larını **kendi dosyalarına** yazar, `router.go`'ya bir daha dokunmaz.
Böylece FAZ 2 (diğer AI) ile **hiç ortak dosya kalmaz**.

## 1. DOSYA SAHİPLİĞİ (kesin sınır)
- ✅ **SADECE bu faz düzenler:**
  - `apps/api/internal/router/router.go`
  - `apps/api/cmd/api/main.go` (New() çağrısı + Prometheus registry burada)
  - `apps/api/internal/config/config.go`
  - YENİ `apps/api/internal/middleware/ratelimit.go`
  - YENİ `apps/api/internal/middleware/metrics.go`
- ⛔ **ASLA DOKUNMA:** `handlers/*`, `repo/*`, `storage/*`, `uploads.go`, `messages.go`,
  `apps/web/*`, `apps/voice/*`, `apps/gateway/*`, `apps/mobile/*`, `infra/*`
  (Bunlar FAZ 2 ve diğer fazların. Route eklemen gerekiyorsa router.go'ya EKLEME —
  mekanizma zaten diğer fazların kendi dosyasında eklemesini sağlıyor.)

## 2. ALT-GÖREVLER

### 2.1 Route self-registration mekanizması (router.go) — ÖNCE BU
`New(h, iss)` içindeki inline route bloklarını KORU (silme), sadece **uzatma noktası** ekle:
```go
// Özellik fazları kendi dosyalarında (aynı `router` paketi) init() ile buraya eklenir.
// router.go'ya bir daha dokunulmaz.
type RouteRegistrar func(r chi.Router, h *handlers.Handler)

var authedRegistrars []RouteRegistrar
var internalRegistrars []RouteRegistrar // secret-korumalı, JWT'siz (ör. voice-internal, medya event)

func RegisterAuthedRoutes(fn RouteRegistrar)   { authedRegistrars = append(authedRegistrars, fn) }
func RegisterInternalRoutes(fn RouteRegistrar) { internalRegistrars = append(internalRegistrars, fn) }
```
- Auth `r.Group` içinde, mevcut route'ların SONUNDA: `for _, reg := range authedRegistrars { reg(r, h) }`
- Anonim/internal bölümde: `for _, reg := range internalRegistrars { reg(r, h) }`
- **Sözleşme (FAZ 2 buna kodlar):** FAZ 2, `router` paketinde YENİ bir dosya (`routes_media.go`)
  açar, `func init(){ RegisterAuthedRoutes(...) / RegisterInternalRoutes(...) }` ile route ekler.
  Aynı paket, AYRI dosya → çakışma yok.

### 2.2 Rate limiting (YENİ middleware/ratelimit.go)
- **Redis-backed** token-bucket (`h.Redis` / config'ten client). Anahtar: IP + (varsa) userID.
- Katmanlı limit: auth endpoint'leri sıkı (ör. 5/dk login), genel API orta, upload/presign ayrı.
- 429 + `Retry-After` header döndür.
- Router'da global `r.Use(mw.RateLimit(rdb, ...))` VEYA grup-bazlı uygula.
- ⚠️ **Yapma:** in-memory `map[string]int` — 2. instance'ta limit sıfırlanır (ScyllaDB tuzağı).
  Redis şart; test 2-instance senaryosunu kanıtlamalı.

### 2.3 Prometheus metrics (YENİ middleware/metrics.go + main.go)
- RED metrikleri: istek sayısı, süre (histogram), hata oranı — method+route+status label'lı.
- `main.go`'da `promhttp.Handler()` → router'a `/metrics` (self-registration YERİNE router.go'da
  doğrudan, çünkü router.go bu fazın; ör. `r.Handle("/metrics", promhttp.Handler())`).
- ⚠️ **Yapma:** sadece log'a sayı basıp "metrics var" deme — gerçek /metrics endpoint + histogram.

### 2.4 Prod secret zorlaması (config.go)
- `JWT_SECRET` / `VOICE_CONTROL_SECRET` dev-default değeriyle eşitse VE `ENV=production` ise
  → `log.Fatal` (başlatmayı reddet, net mesaj). Dev'de uyarı yeterli.
- ⚠️ **Yapma:** prod'da zayıf default'la sessizce başlama.

### 2.5 CORS + güvenlik başlıkları (router.go)
- CORS `AllowedOrigins` env'den (prod'da `*.concord.com` yerine gerçek allowlist).
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS (prod) middleware.

### 2.6 ID-serialization denetimi (SADECE DOĞRULAMA — kod değişikliği YOK)
- Zaten temiz doğrulandı (API struct ID'leri string; JWT düzeldi). Yeniden hızlı grep ile teyit et,
  temizse bu alt-görev **bitti** (dosya değiştirme). Sızıntı bulursan → o dosya senin değil;
  bulguyu `docs/FAZ-1-SPEC.md` altına NOT düş, ilgili faza bırak (bölge ihlali yapma).

## 3. TEST (bu fazın parçası)
- `middleware/ratelimit_test.go`: limit aşımı 429; **2 ayrı limiter aynı Redis → ortak sayaç** (2-instance kanıtı).
- `config` secret-guard testi: prod+default → fatal path.
- `/metrics` 200 + beklenen metrik adları.

## 4. BİTTİ TANIMI
- `router.go` self-registration'lı; `RegisterAuthedRoutes`/`RegisterInternalRoutes` dışa açık.
- Rate-limit 2-instance'ta ortak sayaçla çalışıyor (test yeşil).
- `/metrics` canlı; prod-secret guard doğrulandı; güvenlik başlıkları var.
- `go build ./... && go test ./...` yeşil. Çalışma ağacında bu fazın dosyaları dışında değişiklik YOK.
