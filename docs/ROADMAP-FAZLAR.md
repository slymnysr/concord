# Concord — Bağımsız Faz Planı (eşzamanlı çoklu-AI)

## TEMEL İLKE
**Bölme birimi = üst-dizin (servis).** Her faz TAM BİR dizini sahiplenir; dizinler
kesişmez → iki AI asla aynı dosyaya yazamaz (matematiksel garanti). Fazlar arası bağ
varsa **dosya değil, SÖZLEŞME** (API kontratı) üzerinden olur; her AI kendi dizininde kalır.

> Neden servis-içi bölmedik: `apps/api` içinde iki iş `router.go`/`main.go`'yu paylaşır →
> bağımsız olamaz. O yüzden `apps/api`'nin TAMAMI tek AI'a gider.

## DOKTRİN (her fazda geçerli)
1. Doğru çözümü İLK seferde yap; ilk zorlukta kötü 2. seçeneğe kaçma (ScyllaDB anti-deseni yasak).
2. Stub/TODO/"şimdilik" yasak — başlattığın işi bitir.
3. **Kendi dizininin DIŞINA çıkma.** Başka bölgeye dokunman gerekiyorsa → o iş senin değil,
   sözleşmeyle çöz.
4. Her faz kendi testini yazar (FAZ G sadece E2E/CI iskeleti).

---

## FAZLAR — hepsi AYNI ANDA, farklı AI'lara verilebilir (kesişen dosya YOK)

| Faz | Dizin (sahiplendiği bölge) | Dil |
|-----|----------------------------|-----|
| **FAZ A** | `apps/api/` | Go |
| **FAZ B** | `apps/web/` | React/TS |
| **FAZ C** | `apps/voice/` | Node/mediasoup |
| **FAZ D** | `apps/gateway/` | Elixir |
| **FAZ E** | `apps/mobile/` | Expo/RN |
| **FAZ F** | `infra/` + her app'in `Dockerfile`'ı | Docker/k8s |
| **FAZ G** | `.github/` + `e2e/` | CI/Playwright |

Bu 7 dizin ayrıktır → **7 AI aynı anda, sıfır çakışma.**

---

## FAZ A — Backend Çekirdek & Özellikler (`apps/api/`)
**Sahiplenir:** `apps/api/**` (router, handlers, repo, middleware, storage, config, migrations)
**Yapılacaklar (denetimden):**
- **Rate limiting** — Redis token-bucket (per-IP + per-user), auth/upload sıkı. _Yapma: in-memory map._
- **Prometheus `/metrics`** + RED middleware (istek/süre/hata).
- **Prod secret zorlaması** — `config.go`: prod'da dev-default secret ise başlatmayı FAIL et.
- **CORS/güvenlik başlıkları** — env'den allowlist.
- **Medya işleme** — presign sıkılaştırma (tip/boyut) + MinIO-event ile async resize/EXIF-temizleme/thumbnail/virüs-tarama (ClamAV; adres env'den, container FAZ F'te). _Yapma: ham dosya serve etme._
- **Arama** — Meilisearch/Typesense; mesaj yazımında index'le; alaka sıralaması. _Yapma: ILIKE'ta bırakma._
- **Reactions N+1** — mesaj listesi tek istekte reaction getirir (embed veya batch endpoint).
- **ID-serialization** — zaten temiz (string); teyit et.
**Sözleşme (dışarıya):** FAZ B'nin çağıracağı endpoint şekilleri (medya/arama/reactions-batch) —
bu dosyada `## API-KONTRAT` başlığı altında yayınla ki FAZ B ona kodlasın.
**Bağımlılık:** FAZ F sağlar → Meilisearch/ClamAV adresleri (env). **Test:** handler + rate-limit(2-instance) + medya(kötü dosya reddi) + arama(yaz→ara).

## FAZ B — Web (`apps/web/`)
**Sahiplenir:** `apps/web/**` (`api.ts`, `store.ts`, tüm `components/`)
**Yapılacaklar:**
- **Tanrı-bileşen refaktörü** — `ServerSettingsModal`(2515) + `UserSettingsModal`(1905) sekme-başına böl (>600 satır kalmasın).
- **Reactions N+1 (web tarafı)** — FAZ A'nın batch/embed endpoint'ini kullan (`MessageList`).
- **Yeni endpoint tüketimi** — medya thumbnail'leri, arama UI'ı (FAZ A kontratına göre).
- **i18n tamamlama** — kalan ~40 bileşeni `t()` ile sar.
**Sözleşme (dışarıdan):** FAZ A'nın `## API-KONTRAT`'ını tüketir. **Test:** bileşen davranışı korunur (E2E ayar akışları).

## FAZ C — Ses Ölçekleme (`apps/voice/`)
**Sahiplenir:** `apps/voice/**`
**Yapılacaklar:** mediasoup **çok-makine** — `pipeToRouter` cascade + SFU seçici (yük dağıtımı). _Yapma: tek makinede bırakma._
**Sözleşme (sabit):** `/presence` `{id,name}[]` şeması değişmez. **Test:** 2 worker/makine arası ses aktarımı.

## FAZ D — Gateway Kümeleme (`apps/gateway/`)
**Sahiplenir:** `apps/gateway/**`
**Yapılacaklar:** **libcluster** node keşfi + **distributed Phoenix.Presence** (çok-node). _Yapma: tek-node `:pg`'de bırakma._
**Sözleşme (sabit):** Redis olay şeması değişmez. **Test:** 2 node, çapraz-node presence + yayın.

## FAZ E — Mobil (`apps/mobile/`)
**Sahiplenir:** `apps/mobile/**`
**Yapılacaklar:** cihaz testi bug'ları, **EAS build** (native ses/kamera/push), offline sağlamlık, **FCM push** entegrasyonu. _Yapma: "Expo Go'da çalışıyor" deyip native'i atlama._
**Sözleşme (dışarıdan):** backend API kontratı sabit. **Test:** EAS dev client'ta FEATURES.md listesi.

## FAZ F — Dağıtım & Gözlemlenebilirlik & Altyapı (`infra/` + Dockerfile'lar)
**Sahiplenir:** `infra/**`, `apps/{gateway,voice,web}/Dockerfile` (yeni), `docker-compose.yml`
**Yapılacaklar:**
- `gateway/voice/web` için prod **Dockerfile** (şu an sadece api var).
- **Prometheus + Grafana** (FAZ A'nın `/metrics`'ini tüketir) + dashboard'lar.
- **k8s** manifest'leri (tüm servisler).
- **ClamAV** container (`CLAMAV_ADDR` env → FAZ A `internal/media.Scan` bunu kullanır).
- **MinIO bucket-notification** (`s3:ObjectCreated:*`) → FAZ A medya webhook'una POST.
- **ScyllaDB'yi KALDIR** (atıl + tasarım-kod uyuşmazlığı) + `docs/architecture.md` düzelt. _Yapma: atıl bırakma._
- Prod secret yönetimi (vault/env).

> ### ⚠️ SONRA — F BİTİNCE FAZ A MEDYA WIRING'İ (unutma!)
> FAZ A'nın medya **işleme kütüphanesi** (`internal/media`: doğrulama+EXIF+thumbnail+ClamAV,
> testli) **HAZIR** ama **webhook wiring'i yazılmadı** — bilerek F'e bırakıldı (gerçek MinIO/ClamAV
> olmadan doğrulanamaz). **F, ClamAV + MinIO-event'i kurduktan SONRA**, FAZ A'da şunlar yazılıp
> **gerçek altyapıya karşı test edilecek:** (1) `handlers/media_events.go` webhook (MinIO event JSON
> parse + `X-Media-Secret` doğrula), (2) `storage.GetObject/PutVariant`, (3) attachment durum+variant
> **migration**, (4) `router/routes_media.go` self-registered route. Bu, F ile A arasında **son bir
> koordinasyon adımı** — F'siz A "eksiksiz" sayılmaz. (Detay: `apps/api/internal/media/media.go` baş yorum.)

**Sözleşme (dışarıya):** FAZ A/C/D'ye servis adresleri (env). **Bağımlılık:** Grafana←FAZ A metrics (mantıksal, dosya değil).

## FAZ G — Test & CI (`.github/` + `e2e/`)
**Sahiplenir:** `.github/workflows/**`, YENİ `e2e/`, `playwright.config.ts`
**Yapılacaklar:** Playwright E2E (kara-kutu: giriş, mesaj CRUD, realtime çift-yönlü, ses presence adı, scroll, kanal CRUD); CI'da lint+go test+tsc+expo export+E2E; coverage. _Yapma: birkaç smoke ile yetinme._
**Sözleşme:** çalışan ortama karşı (iç koda bağımsız). **Test:** kendisi.

---

## ÇAPRAZ-BÖLGE SÖZLEŞMELERİ (dosya değil, anlaşma)
Bir özellik iki bölgeye yayılıyorsa (ör. arama = FAZ A endpoint + FAZ B UI), iki AI **kontrat**
üzerinden buluşur, kendi dizininde kalır:
- **A ↔ B:** FAZ A `apps/api/docs/API-KONTRAT.md`'e yeni endpoint şekillerini yazar; FAZ B ona kodlar.
- **F → A/C/D:** FAZ F servis adreslerini env olarak sağlar (Meilisearch/ClamAV/Prometheus).
- **Sabit kontratlar:** Redis olay şeması (D), `/presence {id,name}[]` (C), ID'ler string (hepsi).

## GARANTİ
7 fazın dizinleri ayrık üst-dizinler → **hiçbir iki AI aynı dosyaya yazamaz.** Özellik-düzeyi
bağ yalnızca kontrat üzerinden; kod bloğu düzeyinde sıfır karışma.

## TIER 4 (gelecek, kendi bölge-planını ister)
E2E şifreli DM, AI katmanı, plugin SDK, federasyon, mesaj-ölçek (Scylla'nın doğru zamanı),
admin panel. Her biri ilgili dizin(ler)e düşer; başlarken aynı bölge-izolasyon analizini yap.
