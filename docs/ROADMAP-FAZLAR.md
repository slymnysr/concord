# Concord — Fazlı Yol Haritası (ajan-dağıtımına uygun)

Bu doküman, projeyi **Discord paritesi + ötesi** hedefine taşıyacak işleri
**kod-bölgesi izolasyonuna** göre fazlara böler. Amaç: her fazı **ayrı bir ajana**
verebilmek ve **iki ajanın aynı kod parçasına aynı anda dokunmaması**.

---

## 0. DOKTRİN — HER FAZDA GEÇERLİ (ihlal = iş reddedilir)

1. **Doğru çözümü İLK seferde yap.** İlk zorlukta daha kötü 2. seçeneğe kaçmak
   YASAK. Örnek anti-desen (yapma): _"ScyllaDB provisyonladık ama üşenip mesajları
   Postgres'e yazdık, dokümana Scylla yazdık"_. Bir şeyi kuruyorsan **gerçekten** kur
   ya da hiç kurma. Yarım/yalan altyapı bırakma.
2. **Stub / TODO / "şimdilik böyle" YASAK.** Bir işi başlattıysan bitir. Bırakılan
   TODO = tamamlanmamış faz.
3. **Faz izolasyonu kutsal.** Her fazın bir **dosya bölgesi (🗂)** vardır. O bölgenin
   DIŞINDAKİ dosyalara dokunma. Başka fazın darboğaz dosyasını (`router.go`, `api.ts`,
   `store.ts`) düzenlemen gerekiyorsa → yanlış fazdasın, önce bağımlılığı bekle.
4. **Kolaya kaçıp kapsamı daraltma.** "Basit tutalım" diye özelliği kırpma; doktrin
   = en iyi yöntem + yüksek özen.
5. **Her faz kendi testini yazar.** Dokunduğun kodun testi o fazın parçasıdır
   (FAZ T sadece E2E/CI iskeletini kurar, birim testleri değil).
6. **Sözleşme değiştirme.** Servisler arası kontrat (Redis olay şeması, JSON alanları,
   ID'ler **string**) sabit. Değiştirmen gerekiyorsa bu ayrı bir koordinasyon fazıdır.

---

## 1. PARALELLİK HARİTASI

```
TAM BAĞIMSIZ (aynı anda 6 ayrı ajana verilebilir — sıfır çakışma):
  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
  │ FAZ V   │ │ FAZ G    │ │ FAZ M  │ │ FAZ I  │ │ FAZ T  │ │ FAZ W1       │
  │ (voice) │ │ (gateway)│ │(mobile)│ │(infra) │ │(test)  │ │(web-refactor)│
  └─────────┘ └──────────┘ └────────┘ └────────┘ └────────┘ └──────────────┘

API+WEB ÖZELLİK OMURGASI (router.go + api.ts darboğazı → kendi içinde SIRALI,
ama yukarıdaki 6'ya paralel):
  FAZ 1 (API çekirdek, router.go sahibi)
     └──> FAZ 2 (Medya) ─┐
     └──> FAZ 3 (Arama) ─┼─ üçü de router.go + api.ts'e dokunur → SIRAYLA (biri biter, öbürü başlar)
     └──> FAZ W2 (Reactions) ─┘

TIER 4 — FARKLILAŞTIRICILAR: her biri kendi detay planını ister (gelecek).
```

**Kural:** Aynı satırdaki fazlar paralel. `router.go` sahibi = FAZ 1; `api.ts`/`store.ts`
sahibi = FAZ W2. FAZ 2/3/W2 bu iki dosyaya dokunduğu için birbirine **paralel değil**.

---

## TIER 1 — TEMEL (önce bunlar; T/I, F1'e paralel başlayabilir)

### FAZ 1 — API Çekirdek & Güvenlik Tabanı
- 🗂 **Bölge:** `apps/api/internal/middleware/*`, `apps/api/internal/router/router.go`,
  `apps/api/cmd/api/main.go`, `apps/api/internal/config/config.go`
- ⛔ **Sahiplenir (başkası dokunamaz):** `router.go` (tüm route kaydı), `main.go`, `config.go`
- 🎯 **İş (doğru çözüm):**
  - **Rate limiting** — Redis-backed token-bucket, per-IP + per-user; auth/mesaj/upload
    route'larına uygulanır. _Yapma: in-memory map (2. instance'ta sıfırlanır = ScyllaDB tuzağı)._
  - **Prometheus `/metrics`** + istek süresi/sayısı/hata middleware'i (RED metrikleri).
  - **OTel trace** hook'ları (context propagation, span'ler).
  - **Prod secret zorlaması** — `config.go`: `JWT_SECRET`/`VOICE_CONTROL_SECRET` dev
    default ise ve `ENV=production` ise **başlatmayı FAIL et** (panik + net mesaj).
  - **Güvenlik başlıkları + CORS** sıkılaştırma (prod origin allowlist).
  - **Snowflake ID serialization denetimi** — tüm JSON response'larda ID'ler string mi?
    (JWT sızıntısı düzeldi; başka sızıntı var mı satır satır doğrula/düzelt.)
- 🔗 **Bağımlılık:** yok. ⚠️ Route-ekleyen fazlar (2/3/W2) bunun bitmesini bekler.
- ✅ **Test:** middleware birim + rate-limit integration (2 instance senaryosu) + secret-fail testi.
- 🏁 **Bitti:** `/metrics` canlı, rate-limit 2-instance'ta çalışıyor, prod-secret guard doğrulandı.

---

## TIER 1 — İZOLE ALTYAPI (F1'e ve birbirine paralel)

### FAZ T — Test & E2E & CI Altyapısı
- 🗂 **Bölge:** `.github/workflows/*`, YENİ `e2e/`, `playwright.config.ts`, test yardımcıları
- ⛔ **Sahiplenir:** tüm `.github/workflows/` (CI'ı başka faz düzenlemez)
- 🎯 **İş:** Playwright E2E süiti (kara-kutu, UI/API sözleşmesine dayanır → iç refaktörlere
  dayanıklı): giriş, mesaj gönder/düzenle/sil/tepki, realtime çift-yönlü, kanal CRUD, ses
  presence ismi, scroll. CI'da: lint + go test + tsc + expo export + E2E job. Coverage raporu.
  _Yapma: "birkaç smoke yeter" deme — kritik akışların hepsini kapsa._
- 🔗 **Bağımlılık:** yok (çalışan ortama karşı test eder). ✅ Kendisi test altyapısı.
- 🏁 **Bitti:** CI'da E2E job yeşil, PR'da otomatik koşuyor.

### FAZ I — Dağıtım & Gözlemlenebilirlik Altyapısı + Scylla Temizliği
- 🗂 **Bölge:** `infra/*` (`docker-compose.yml`, `infra/k8s/*`), YENİ `apps/{gateway,voice,web}/Dockerfile`
- ⛔ **Sahiplenir:** tüm `infra/`, `docker-compose.yml` (Scylla dahil), servis Dockerfile'ları
- 🎯 **İş:**
  - **Scylla kararı (doktrin gereği):** şu an atıl + tasarım-kod uyuşmazlığı. **Kaldır**
    (docker-compose + docs/architecture.md düzelt). Mesaj-ölçek gerçek ihtiyaç olunca
    **ayrı, planlı bir faz** olarak gelir (bkz. TIER 4). _Yapma: atıl bırakma._
  - `gateway/voice/web` için prod **Dockerfile** (şu an sadece api var).
  - **Prometheus + Grafana** compose/k8s + dashboard'lar (F1'in `/metrics`'ini tüketir).
  - k8s manifest'leri tüm servisler için (deployment/service/ingress).
- 🔗 **Bağımlılık:** Grafana dashboard'ları F1'in `/metrics`'ini bekler (dosya çakışması yok, sadece mantıksal).
- 🏁 **Bitti:** `docker compose -f prod` tüm servisleri ayağa kaldırıyor, Grafana'da RED metrikleri görünüyor, Scylla yok.

---

## TIER 2 — BAĞIMSIZ SERVİSLER (hepsi birbirine + Tier 1'e paralel)

### FAZ V — Ses Ölçekleme
- 🗂 **Bölge:** `apps/voice/src/*` (tamamı izole)
- 🎯 **İş:** mediasoup çok-makine — `pipeToRouter` ile router cascade, SFU seçici
  (yük dağıtımı), yatay ölçek. _Yapma: "tek makine yeter" deyip bırakma — cascade'i gerçekten kur._
- 🔗 **Bağımlılık:** yok. Kontrat: `/presence` `{id,name}[]` şeması sabit kalmalı.
- ✅ **Test:** 2 sanal makine/worker'da peer'ler birbirini duyar (signaling E2E).
- 🏁 **Bitti:** N worker/makine arası ses aktarımı doğrulandı.

### FAZ G — Gateway Kümeleme
- 🗂 **Bölge:** `apps/gateway/lib/*` (tamamı izole)
- 🎯 **İş:** **libcluster** ile BEAM node keşfi + **distributed Phoenix.Presence**
  (çok-node presence), oturum-yapışkanlık gerektirmeyen bağlantı dağıtımı. _Yapma:
  tek-node `:pg` PubSub'da bırakma — "milyonlarca bağlantı" hedefi tek node'da imkânsız._
- 🔗 **Bağımlılık:** yok. Kontrat: Redis olay şeması sabit.
- ✅ **Test:** 2 node, bir node'a bağlı kullanıcı diğer node'daki olayı alır.
- 🏁 **Bitti:** çok-node presence + mesaj yayını doğrulandı.

### FAZ M — Mobil Sağlamlaştırma
- 🗂 **Bölge:** `apps/mobile/*` (tamamı izole — kendi `api.ts`'i var, web'inkinden ayrı)
- 🎯 **İş:** cihaz testi bug'ları, EAS build (ses/kamera/push native), offline sağlamlık,
  push FCM entegrasyonu. _Yapma: "Expo Go'da çalışıyor" deyip native tarafı atlama._
- 🔗 **Bağımlılık:** backend kontratı sabit. ✅ **Test:** EAS dev client'ta FEATURES.md listesi.
- 🏁 **Bitti:** gerçek cihazda ses/görüntü/push çalışıyor.

### FAZ W1 — Web Bileşen Refaktörü (Tanrı-bileşenler)
- 🗂 **Bölge:** `apps/web/src/components/ServerSettingsModal.tsx` (2515 satır),
  `apps/web/src/components/UserSettingsModal.tsx` (1905 satır) — **SADECE bu 2 dosya + yeni alt-bileşenler**
- ⛔ **Kısıt:** `api.ts` / `store.ts` / `MessageList.tsx`'e **DOKUNMA** (onlar başka fazın).
  Bu faz saf bileşen bölme: her sekmeyi ayrı dosyaya çıkar, davranışı değiştirme.
- 🎯 **İş:** 2500 satırlık modalleri sekme-başına alt-bileşenlere böl (`ServerSettings/GeneralTab.tsx` vb.).
  _Yapma: davranış/stil değiştirme — bu sadece yapısal refaktör._
- 🔗 **Bağımlılık:** yok. ✅ **Test:** görsel regresyon yok (E2E ayar akışları geçer).
- 🏁 **Bitti:** hiçbir dosya >600 satır, davranış birebir aynı.

---

## TIER 3 — API+WEB ÖZELLİK OMURGASI (FAZ 1 sonrası; kendi içinde SIRALI)

> ⚠️ Üçü de `router.go` + `apps/web/src/api.ts` + `store.ts`'e dokunur → **paralel DEĞİL**.
> Sıra önemsiz ama **aynı anda ikisi çalışmaz**. Her biri full-stack (API+web) tek ajan.

### FAZ 2 — Medya Boru Hattı (full-stack)
- 🗂 **Bölge:** `apps/api/internal/storage/*`, `apps/api/internal/handlers/upload*.go`,
  `apps/web/src/components/<upload/attachment ilgili>`, `api.ts` (medya bölümü), `router.go` (yeni route)
- 🎯 **İş:** yüklemede **thumbnail/resize** (bant genişliği), **EXIF temizleme**, **tip+boyut
  zorlaması**, **virüs/içerik tarama** (ClamAV veya eşdeğeri), imzalı URL + CDN prefix.
  _Yapma: "ham dosyayı serve edelim" deme — güvenlik + maliyet riski._
- 🔗 **Bağımlılık:** FAZ 1 (router). ✅ **Test:** kötü-amaçlı dosya reddi, resize doğrulama.

### FAZ 3 — Arama Motoru (full-stack)
- 🗂 **Bölge:** `apps/api/internal/handlers/search.go`, arama repo, `apps/api/internal/handlers/messages.go`
  (yazımda index'leme hook'u), `api.ts` (arama bölümü), `router.go`, infra: Meilisearch/Typesense container
- 🎯 **İş:** gerçek full-text motoru (Meilisearch/Typesense) — mesaj yazımında index'le,
  gelişmiş filtreler, alaka sıralaması. _Yapma: Postgres `ILIKE`'ta bırakma — ölçeklenmez._
- 🔗 **Bağımlılık:** FAZ 1 (router). ⚠️ `messages.go` yazım yoluna dokunur — FAZ 2 ile çakışmaz
  (F2 upload, F3 messages), ama TIER 4 mesaj-ölçek fazıyla koordine.
- ✅ **Test:** index tutarlılığı (yaz→ara), silme→index düşer.

### FAZ W2 — Reactions Görüntü Performansı (full-stack, N+1 fix)
- 🗂 **Bölge:** `apps/api/internal/handlers/reactions.go` (toplu okuma), `apps/web/src/components/MessageList.tsx`
  (reaction render), `apps/web/src/api.ts` (`reactions.batch`), `store.ts`, `router.go`
- ⛔ **Sahiplenir:** `api.ts` + `store.ts` (bu yüzden F2/F3 ile sıralı)
- 🎯 **İş:** mesaj listesi tek istekte reaction'ları getirir (embed veya batch endpoint) —
  şu an 50 mesaj = 50 istek. _Yapma: "çalışıyor ya" deyip N+1'i bırakma._
- 🔗 **Bağımlılık:** FAZ 1. ✅ **Test:** 50 mesajlık kanalda ağ isteği sayısı ≤ 2.

---

## TIER 4 — FARKLILAŞTIRICILAR ("Discord'un ötesi" — her biri kendi detay planını ister)

Bunlar büyük, yeni-kod ağırlıklı; her biri ileride **kendi fazlı planıyla** açılır. Bölgeleri
büyük ölçüde yeni dosyalar → mevcut fazlarla düşük çakışma, ama başlarken kendi izolasyon
analizini yap.

- **Mesaj-Ölçek (Scylla/partition):** GERÇEK ihtiyaç doğunca (metrikler gösterince) mesajları
  partition'lı store'a taşı. Planlı yap — bugün premature. (I fazında Scylla kaldırıldı; bu onun doğru zamanı.)
- **E2E şifreli DM** (Discord'da yok) — gizlilik konumlanması. Kripto + anahtar yönetimi.
- **AI katmanı** — mesaj özetleme, akıllı arama, AI moderasyon (çeviri zaten var).
- **Plugin/eklenti SDK** + zengin bot API — geliştirici platformu.
- **Federasyon** — sunucular arası (self-host kozunu büyüt).
- **Admin paneli + analytics** — self-host edenler için.

---

## ÖZET — ajan dağıtım tablosu

| Faz | Bölge | Paralel-güvenli? | Bekler |
|-----|-------|------------------|--------|
| FAZ 1 | API middleware/router/main/config | Tier-2/T/I ile ✓ | — |
| FAZ T | .github, e2e | herkesle ✓ | — |
| FAZ I | infra, Dockerfiles | herkesle ✓ | (Grafana←F1 metrics) |
| FAZ V | apps/voice | herkesle ✓ | — |
| FAZ G | apps/gateway | herkesle ✓ | — |
| FAZ M | apps/mobile | herkesle ✓ | — |
| FAZ W1 | 2 settings modal | herkesle ✓ | — |
| FAZ 2 | medya (api+web) | Tier-2/T/I ile ✓; **F3/W2 ile ✗** | FAZ 1 |
| FAZ 3 | arama (api+web) | Tier-2/T/I ile ✓; **F2/W2 ile ✗** | FAZ 1 |
| FAZ W2 | reactions (api+web, api.ts sahibi) | Tier-2/T/I ile ✓; **F2/F3 ile ✗** | FAZ 1 |

**En verimli başlangıç:** FAZ 1 + T + I + V + G + M + W1 = **7 ajan aynı anda, çakışmasız.**
FAZ 1 bitince 2→3→W2 sırayla.
