# Global Denetim — 2026-07-17

> **Bağlam değişti:** uygulama **global**. Önceki kararların bir kısmı "Türkiye-odaklı"
> varsayımına dayanıyordu ve bu varsayım altında doğruydu; global bağlamda **yanlışlar**.
> Bu belge ölçülmüş bulguları ve faz planını taşır. Hiçbir madde tahmin değil — hepsi
> çalıştırılarak doğrulandı.

## Özet

**Özellik paritesi İYİ:** 186 endpoint — threads, forums, stage, events, polls, stickers,
webhooks, automod, onboarding, scheduled messages, soundboard hepsi var.
**Eksik olan özellik değil, GLOBALLEŞME.** Uygulama şu an fiilen Türkçe-yalnız bir üründür.

---

## A. Arama global kullanıcının yarısında ÇALIŞMIYOR (ölçüldü)

`search_vector = to_tsvector('turkish', unaccent(x)) || to_tsvector('english', unaccent(x))`

| Dil         | Metin → Sorgu           | Sonuç                                                |
| ----------- | ----------------------- | ---------------------------------------------------- |
| Türkçe      | mesajları → mesaj       | ✅                                                   |
| İngilizce   | tests → test            | ✅                                                   |
| Fransızca   | serveurs → serveur      | ✅ _(tesadüf: çoğul -s)_                             |
| İspanyolca  | servidores → servidor   | ✅ _(tesadüf)_                                       |
| **Almanca** | Nachrichten → Nachricht | ❌ (turkish stemmer `'nachrich'` üretiyor — bozuyor) |
| **Rusça**   | сообщения → сообщение   | ❌ (kök bulma yok)                                   |
| **Japonca** | メッセージがあります    | ❌ **tek token** olarak indeksleniyor                |
| **Çince**   | 这是一条消息            | ❌ **tek token**                                     |

**Kök sebep:** PostgreSQL FTS, CJK'yı **kelimelere ayıramaz** (segmentasyon yok) ve dil
başına tek config seçmek zorundadır. Discord'un JP/KR/CN kitlesi düşünülünce bu, ürünün
büyük bir kısmında aramanın hiç olmaması demek.

**Karar düzeltmesi:** "Meilisearch erken optimizasyon" değerlendirmem **Türkiye-odaklı
varsayıma dayanıyordu ve artık geçersiz.** Roadmap'in en baştaki Meilisearch çağrısı doğruydu:
CJK segmentasyonu + çok-dil + yazım toleransı hazır geliyor. → **FAZ H/I**

## B. API kullanıcıya TÜRKÇE hata döndürüyor (ölçüldü)

- 755 `writeError` çağrısının **305'i** Türkçe metin içeriyor.
- Web: `throw new APIError(status, body.error, body.detail)` → `setError(e?.message)` →
  **detail doğrudan ekrana**. Fransız kullanıcı "sunucu oluşturulamadı" görüyor.
- **İyi haber:** `error` kodları makine-okunur (`already_exists`, `rate_limited`, …) →
  çözüm kod→i18n eşlemesi; API metinleri geliştirici ipucu olarak kalabilir. → **FAZ H/J**

## C. i18n eksik (ölçüldü)

| Alan              | Durum                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| Web sözlük        | yalnızca **tr + en**                                                                |
| Web gömülü Türkçe | **44** string hâlâ `t()` dışında (önceki "898/898 parite" raporum eksikti)          |
| **Mobil i18n**    | **HİÇ YOK** — 238 gömülü Türkçe string → mobil uygulama Türkçe-yalnız               |
| Tarih/saat        | **35** yerde `'tr-TR'` çakılı (mobilde 10) → Fransız kullanıcı Türkçe tarih görüyor |

→ **FAZ J (web), FAZ K (mobil)**

## D. Yasal/uyum boşlukları (global pazarda ZORUNLU)

- **GDPR veri dışa aktarma (Md. 15) YOK** — AB'de yasal hak.
- **Hesap silme (Md. 17 "unutulma hakkı") YOK** — mesaj silme var, hesap silme yok.
- **Yaş kapısı YOK** — COPPA (ABD 13+), DSA (AB) gerektirir; Discord kayıtta doğum tarihi sorar.

→ **FAZ M**

## E. Ses: bölge yönlendirmesi yok

SFU seçici (`/sfu/select`) yalnızca **kanal-yerelliği + yük** bakıyor; **coğrafya/gecikme
yok**. Çok-makine cascade (FAZ C) altyapıyı hazırladı ama Tokyo'daki kullanıcı Frankfurt
node'una düşebilir → 250ms+ gecikme. Global ses için bölge farkındalığı şart. → **FAZ L**

---

# FAZLAR (bölge-ayrık — eşzamanlı çalıştırılabilir)

Kural aynı: her faz **ayrı üst-dizin** sahiplenir; iki faz aynı dosyaya yazmaz.
Çapraz ihtiyaçlar **kontrat** üzerinden (`apps/api/docs/API-KONTRAT.md`).

## FAZ H — API globalleşme (`apps/api/**`) — ✅ ARAMA TAMAM

- **Arama motoru soyutlaması:** `internal/search` arayüzü; Meilisearch sürücüsü + mevcut
  Postgres FTS sürücüsü (fallback). Mesaj yazma/düzenleme/silmede index senkronu.
  _Yapma: senkronu "sonra" bırakma — index bayatlarsa arama sessizce yanlış sonuç verir._
- **Hata sözleşmesi:** her `writeError` kodu **kararlı ve belgeli**; kod→anlam tablosu
  KONTRAT'a. Türkçe `detail` geliştirici ipucu olarak kalır, istemci koda göre çevirir.
- **Kontrat:** arama endpoint'i (dil/`sort`), hata kodu tablosu.
- **Test:** ✅ ÖLÇÜLDÜ — aynı 8 vaka artık **8/8 geçiyor** (gerçek API üzerinden):
  `メッセージ`→JA, `消息`→ZH, `메시지`→KO, `сообщение`→RU, `Nachricht`→DE, `toplantı`/`toplanti`→TR,
  `test`→EN. Postgres yedeğinde aynı test DÜŞÜYOR (dişlilik kanıtlandı).
  Testler: `internal/search/meili_test.go` (14, gerçek Meilisearch'e karşı),
  `e2e/tests/search.spec.ts` (3: global diller, kök bulma/ASCII/alaka, index senkronu).
- **İndeks senkronu bağlandı** (create/edit/delete) ve uçtan uca doğrulandı: yeni mesaj
  indeksleniyor, düzenleme eski metni düşürüyor, silme indeksten kaldırıyor.
- **Backfill:** `cmd/reindex` (sayfalı; 943 mesaj 55ms).

**FAZ H'nin bulduğu 2 gerçek bug:**

1. `sort=recent` KRONOLOJİK DEĞİLDİ: Meilisearch ranking rule sırasında `attribute`
   (terimin metindeki konumu) `sort`'tan önce geliyordu → kullanıcı açıkça "yeniye göre"
   dese bile terim konumu kazanıyordu. `sort` en başa alındı.
2. `created_at` SANİYE hassasiyetindeydi → sohbette mesajlar salkım halinde geldiği için
   aynı saniyedeki mesajlar ayırt edilemiyor, `sort=recent` rastgele sıralıyordu.
   Milisaniyeye çevrildi. (Snowflake ID kullanılamaz: Meilisearch sayıları f64 tutar,
   64-bit ID hassasiyet kaybeder.)

## FAZ I — Arama altyapısı (`infra/**`) — ✅ TAMAM

- ✅ Meilisearch container (compose + k8s StatefulSet — indeks diskte yaşar), `MEILI_ADDR`
  configMap'te, `MEILI_MASTER_KEY` secret'ta (MEILI_ENV=production anahtarsız başlamayı reddeder),
  `cmd/reindex` backfill, CI'da hem e2e servisi hem API job'ı için ayağa kaldırılıyor.
- **Test:** ✅ FAZ H'nin 14 sürücü testi + 3 E2E testi GERÇEK Meilisearch'e karşı yeşil.

## FAZ J — Web globalleşme (`apps/web/**`) — ✅ TAMAM

- ✅ **44 gömülü string** → `t()` (42 yeni anahtar, tr+en). Sözlük paritesi **959/959**.
- ✅ **35 `'tr-TR'`** → `localeTag()` (tek kaynak: aktif locale). Kalan 2 geçiş fonksiyonun
  kendi tanımı.
- ✅ **Hata sözleşmesi bağlandı:** `errText()` — kod→`t('error.<kod>')`, yoksa HTTP durumuna
  göre genel yerelleştirilmiş mesaj; `detail` ASLA ekrana gitmez (konsola yazılır).
  **60 yerde** `e?.message` doğrudan basılıyordu ve `APIError.message` = `"<kod>: <Türkçe detail>"`
  → Fransız kullanıcı **"invalid_name: sunucu adı geçersiz"** görüyordu. Şimdi 0.
- **Test:** ✅ `ui-regressions.spec.ts` — locale=en'de arayüzde Türkçe'ye özgü karakter
  (ç/ğ/ı/ö/ş/ü) taşıyan metin KALMIYOR. Test dişli: tek bir string geri konunca düşüyor.
  Bu test regex taramamın kaçırdığı **5 sızıntı** daha buldu (çok-satırlı JSX + JS string'leri):
  göreli zaman ("az önce") tamamen Türkçeydi, kanal-başlangıcı metni, input ipucu,
  çevrimdışı sayacı, aktivite metni.

> **Dil sayısı (de/fr/es/ru/ja) SONRAYA:** altyapı hazır (tek `localeTag()`, tam parite,
> hata kodları çevrilebilir) ama ~959 anahtarı 5 dile makine çevirisiyle doldurmak
> kalitesiz sonuç verir; gerçek çeviri kaynağı gerektirir → bloke listesinde.

## FAZ K — Mobil globalleşme (`apps/mobile/**`) — ✅ TAMAM

- ✅ **Sıfırdan i18n** (`src/i18n.ts`): web'in `t(key, params)` sözleşmesi ve sözlük yapısı
  birebir yeniden kullanıldı (iki farklı i18n API'si taşımak aynı metnin ayrışmasına yol açar).
  Fark: locale kaynağı — webde kullanıcı seçer, **mobilde CİHAZ DİLİ varsayılan**
  (`expo-localization`); kullanıcı tercihi varsa onu ezer, `loadLocale()` ilk çizimden önce.
- ✅ **264 gömülü metin** tarandı → **259'u çevrildi** (270/270 tr/en paritesi); kalan 5'i
  konsol/Error metni (kullanıcıya gitmez, İngilizceye çevrildi).
- ✅ `errText()` mobilde de var: API `detail`'i Türkçe, ekrana gitmiyor.
- ✅ Desteklenmeyen dilde **İngilizceye** düşer — Türkçe'ye düşmek global kullanıcıya
  anlamadığı bir arayüz göstermek olurdu.
- **Test:** ✅ `scripts/check-i18n.mjs` (CI'da): gömülü Türkçe YOK + tr/en paritesi.
  İki yönden de dişli olduğu kanıtlandı (string geri konunca ve parite bozulunca düşüyor).
  Bundle derleniyor (`expo export --platform android`).

> **Cihazda doğrulama bloke:** gerçek cihaz dili testi emülatör/EAS dev client ister
> (FAZ E ile aynı blokede). Statik denetim regresyonu üreten şeyi — kaynağa Türkçe string
> eklemeyi — kesin yakalar.

## FAZ L — Ses bölge yönlendirme (`apps/voice/**`) — ✅ TAMAM

- ✅ Node kaydına `region` (`VOICE_REGION`); `/sfu/select?region=` bölge farkındalıklı.
- ✅ **Politika sırası: BÖLGE → kanal yerelliği (bölge içinde) → yük.** Kanal başka bölgede
  olsa bile istemci KENDİ bölgesine bağlanır — cascade (FAZ C) node'lar arasını zaten
  köprüler; bunun için var. Öncesinde yalnızca kanal-yerelliği + yük vardı → Tokyo'daki
  kullanıcı Frankfurt node'una düşebiliyordu (250ms+).
- ✅ `/sfu/regions` — istemci bölgeleri alıp **gerçek gecikmeyi ölçer**. Geo-IP ile tahmin
  ETMİYORUZ: VPN/mobil operatör/CGNAT altında sıkça yanılır ve kullanıcıyı yanlış kıtaya yollar.
- ✅ Bilinmeyen bölgede en-az-yüklüye düşer (patlamaz); bölge verilmezse eski davranış.
- **Sözleşme korundu:** `/presence` `{id,name}[]` değişmedi.
- **Test:** ✅ `pnpm --filter @concord/voice test:region` — 2 AYRI bölgede (eu/ap) gerçek node
  process'i; 5/5: bölgeler listeleniyor, ap istemcisi→ap node, eu istemcisi→eu node,
  bilinmeyen bölge düşüyor, bölgesiz eski davranış. **Dişli:** bölge süzgeci kapatılınca
  eu istemcisi ap node'una düşüyor ve test onu yakalıyor. CI'da koşuyor.
- **k8s:** `VOICE_REGION` (ayarlanmazsa tüm node'lar 'default' bölgesinde görünür → bölge
  yönlendirmesi etkisiz kalır; her bölge deployment'ına kendi değeri verilmeli).

## FAZ M — Uyum (`apps/api/**` + `apps/web/**`) — ✅ TAMAM

> Bu faz H ve J ile AYNI dizinlere yazar → onlarla eşzamanlı verilmez.

- GDPR veri dışa aktarma (asenkron iş → indirilebilir arşiv), hesap silme (anonimleştirme
  vs. sert silme kararı belgelenmeli), yaş kapısı (kayıtta doğum tarihi + yaşa göre NSFW).
- **Test:** dışa aktarma arşivi kullanıcının tüm verisini içeriyor mu; silinen hesabın
  mesajları ne oluyor (Discord: "Deleted User" olarak kalır).
