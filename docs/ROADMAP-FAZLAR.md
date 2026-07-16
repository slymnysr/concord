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

## FAZ C — Ses Ölçekleme (`apps/voice/`) ✅ TAMAM
**Sahiplenir:** `apps/voice/**`
**Durum:** çok-makine cascade çalışıyor; 2 AYRI node process'iyle KANITLANDI
(`pnpm --filter @concord/voice test:cascade`): A'daki peer produce etti → küme olayı yayıldı →
B pipe kurdu → producer'ı aldı → B'deki peer aynı producer id ile `newProducer` aldı.

**Neden elle pipe:** `router.pipeToRouter({router})` yalnızca AYNI PROCESS'teki router'ları
bağlar → çok-makinede kullanılamaz. mediasoup'un çok-makine yolu izlendi: iki tarafta
`createPipeTransport` (SRTP açık — node'lar arası RTP güvenilmeyen ağdan geçer), ip/port
el sıkışması, sonra bir tarafta `consume` / diğerinde aynı id ile `produce`.

**Parçalar:** `cluster.ts` (Redis node kaydı + kanal üyeliği + olay veriyolu; Redis zaten
yığında vardı, etcd/consul eklemek gereksiz yük olurdu), `pipe.ts` (link ömrü — pipe'lar
(kanal, uzak-node) başına TEK sefer kurulur; her producer için yeni pipe port aralığını
tüketirdi), `cascade.ts` (olay → pipe orkestrasyonu), SFU seçici (`/sfu/select`).

**SFU seçici politikası:** kanalı zaten barındıran node önce, yoksa en az yüklü. Sadece yüke
bakmak aynı kanalı node'lara dağıtır → her yayın için pipe, bant genişliği boşuna N katı.

**Sözleşme korundu:** `/presence` `{id,name}[]` — ama artık küme geneli topluyor. Yalnızca
yerel peer'ları dönmek sözleşmeyi sessizce bozardı (istemci A'ya sorar, B'dekileri göremez).

**FAZ C'nin bulduğu 2 gerçek bug:**
1. **SFU seçici yanlış porta yönlendiriyordu:** uzak node'un adresini yerel porttan
   türetiyordu (`ws://<uzak-host>:<YEREL port>`). Tüm node'lar aynı portu kullanırsa tesadüfen
   çalışır. Artık her node KENDİ wsUrl'ini duyuruyor.
2. **k8s'te voice env adlarının 5'i okunmuyordu** (`ANNOUNCED_IP`, `PORT`, `HTTP_PORT`,
   `RTC_MIN/MAX_PORT` — kod `MS_*`/`VOICE_*` okuyor). Dördü varsayılanla tesadüfen çalışıyordu
   ama `ANNOUNCED_IP` okunmadığı için voice üretimde **127.0.0.1 ilan ediyordu → ICE her
   istemcide düşer, KİMSE KİMSEYİ DUYAMAZDI.** Manifest'in kendi yorumu "ANNOUNCED_IP şarttır,
   yoksa istemci sesi duymaz" diyordu — ve tam da o env ölüydü.

**k8s:** StatefulSet (node kimliği sabit olmalı: değişirse ölü node'lar TTL dolana kadar
hayalet kalır), replicas 2, `VOICE_PIPE_IP=$(HOST_IP)` (127.0.0.1 kalırsa node'lar birbirine
bağlanamaz), `VOICE_CLUSTER_SECRET` (pipe uçları kimliksiz kalırsa yabancı RTP çekebilir).

## FAZ D — Gateway Kümeleme (`apps/gateway/`) ✅ TAMAM
**Sahiplenir:** `apps/gateway/**`
**Durum:** libcluster + dağıtık Phoenix.Presence çalışıyor; 2 node'la KANITLANDI
(gw1 ↔ gw2 kümelendi, gw1'de track edilen kullanıcı gw2'den okundu). 14 ExUnit testi
(gateway'in daha önce HİÇ testi yoktu — CI'daki `mix test` "no tests" deyip yeşil yanıyordu).

**Stratejiler** (`Gateway.Cluster`, `CLUSTER_STRATEGY`): `kubernetes` (headless service DNS),
`epmd` (bilinen host listesi — docker-compose ve YEREL çok-node testi için), `gossip` (UDP
keşif), `none`. Varsayılan artık sessizce gossip DEĞİL: hiçbir node bulamadan "kümelendim"
sanılıyordu → k8s ortamıysa kubernetes, CLUSTER_HOSTS varsa epmd, yoksa kapalı.

**FAZ D'nin bulduğu 3 gerçek bug:**
1. **Çift yayın (kümeleme açılınca patlardı):** RedisBridge her node'da çalışıp aynı Redis
   pattern'ine abone; `Endpoint.broadcast!` ise olayı PubSub ile TÜM node'lara dağıtıyordu →
   her istemci mesajı N kez alırdı (küme içi trafik N²). Doğrusu `local_broadcast`:
   node'lar arası dağıtımı zaten Redis yapıyor, PubSub'ın işi yerel soketler.
2. **Gateway üretimde DEV JWT secret'ına düşüyordu:** `token.ex` `CONCORD_JWT_SECRET`
   okuyordu ama projede hiçbir yer onu set etmiyor (hepsi `JWT_SECRET` veriyor) → API gerçek
   secret'la imzalar, gateway dev secret'la doğrular (WS 403, realtime ölü) VE repo'da açık
   olan dev secret'la üretilmiş SAHTE token'ları kabul ederdi. **Voice de aynı hatadaydı.**
   Üçü `JWT_SECRET`'ta birleştirildi; `runtime.exs` üretimde dev-default'u reddediyor.
3. **Dev'de port sabitti** (4000) → yerelde çok-node kümeyi denemek imkânsızdı; `GATEWAY_PORT`.

**k8s:** `replicas: 2`, headless service (`gateway-headless`, ClusterIP servis tek sanal IP
döndürdüğü için keşifte kullanılamaz), `RELEASE_NODE=gateway@$(POD_IP)`, `RELEASE_COOKIE`
(secret'tan; çerezsiz node'lar el sıkışamaz → runtime.exs açılışta zorunlu kılar).
Ölü env'ler temizlendi: `PORT` ve `REDIS_URL` hiçbir yerde okunmuyordu (var olmayan ayar
düğmesi izlenimi veriyorlardı; Redis ayarı configMap'ten REDIS_HOST/PORT ile geliyor).

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

> ### ✅ MEDYA WIRING'İ TAMAM (F → A koordinasyonu kapandı)
> FAZ A'nın medya kütüphanesi (`internal/media`) hazırdı ama webhook wiring'i bilerek F'e
> bırakılmıştı (gerçek MinIO/ClamAV olmadan doğrulanamazdı). F altyapıyı kurunca yazıldı ve
> **gerçek MinIO + gerçek ClamAV'a karşı uçtan uca doğrulandı:**
> `handlers/media_events.go` (webhook), `storage.GetObject/PutVariant/KeyFromPublicURL`,
> `migrations/0054_media_objects` (durum nesne ANAHTARINA bağlı — mesaj upload'dan sonra
> oluştuğu için attachment satırı henüz yoktur), `router/routes_media.go`,
> `handlers/attachments_guard.go` (zorlama).
>
> **Uçtan uca kanıtlanan:** EXIF'li JPEG → `clean`, tip magic-byte'tan, thumbnail EXIF'siz;
> EICAR → `infected` + imza + depodan silindi; enfekte/dış-URL ek → mesaj reddedildi;
> istemcinin yalan `content_type`/`size_bytes` beyanı yok sayıldı.
>
> **Bu iş sırasında bulunan 3 gerçek bug** (hiçbiri sahte altyapıyla yakalanamazdı):
> ClamAV imzasındaki NUL baytı Postgres INSERT'ini patlatıyordu → enfekte dosya denetim izi
> bırakmadan geçiyordu; `readJSON`'ın `DisallowUnknownFields`'ı tüm MinIO olaylarını 400'lüyordu;
> `mc admin service restart` TTY'siz ortamda ölüyordu.

**Sözleşme (dışarıya):** FAZ A/C/D'ye servis adresleri (env). **Bağımlılık:** Grafana←FAZ A metrics (mantıksal, dosya değil).

## FAZ G — Test & CI (`.github/` + `e2e/`) ✅ TAMAM
**Sahiplenir:** `.github/workflows/**`, `e2e/`
**Durum:** 18 E2E testi yeşil; CI job'ları: web, api, gateway, e2e, mobile, voice, lint-format.
- Kapsam: giriş/kayıt, mesaj CRUD, **realtime çift-yönlü** (iki tarayıcı bağlamı — tek yönlü
  test bu bug'ı kaçırıyordu), ses presence adı + Snowflake string ID, scroll (metin **ve** ses
  kanalı, kanalın kendi sohbeti doldurularak), kanal CRUD + yetki, güvenlik başlıkları,
  /metrics, brute-force sözleşmesi.
- E2E job artık Gateway **ve** Voice'u da ayağa kaldırıyor (yoksa realtime/presence testleri
  yerelde geçip CI'da düşerdi); düşerse servis logları artifact olarak yükleniyor.
- Mobil job: tsc + `expo export --platform android` (bundle gerçekten derleniyor mu).
- API kapsamı `-coverprofile` ile ölçülüyor, job özetine yazılıyor (şu an **%48.4**).

**FAZ G'nin bulduğu ve düzelttiği gerçek bug (FAZ A bölgesi):** brute-force sayacı
`(email OR ip)` tek eşikle çalışıyordu → çapraz hesap kilidi + CGNAT tahribatı. Katmanlandırıldı
(email+ip 5 / email 20 / ip 100), başarılı giriş sayacı sıfırlıyor, 429 Retry-After taşıyor.

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
