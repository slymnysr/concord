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

## FAZ H — API globalleşme (`apps/api/**`)

- **Arama motoru soyutlaması:** `internal/search` arayüzü; Meilisearch sürücüsü + mevcut
  Postgres FTS sürücüsü (fallback). Mesaj yazma/düzenleme/silmede index senkronu.
  _Yapma: senkronu "sonra" bırakma — index bayatlarsa arama sessizce yanlış sonuç verir._
- **Hata sözleşmesi:** her `writeError` kodu **kararlı ve belgeli**; kod→anlam tablosu
  KONTRAT'a. Türkçe `detail` geliştirici ipucu olarak kalır, istemci koda göre çevirir.
- **Kontrat:** arama endpoint'i (dil/`sort`), hata kodu tablosu.
- **Test:** DE/RU/JA/ZH/TR/EN için yaz→ara (yukarıdaki tablo test olarak sabitlenir).

## FAZ I — Arama altyapısı (`infra/**`)

- Meilisearch container (compose + k8s) + adres/anahtar env'leri; ilk-index (backfill) işi.
- **Test:** temiz ortamda ayağa kalkma + FAZ H'nin sürücüsüyle uçtan uca.

## FAZ J — Web globalleşme (`apps/web/**`)

- Kalan **44** gömülü stringi `t()`'ye al; **35** `'tr-TR'` → `getLocale()`/`Intl`.
- Hata kodu→mesaj eşlemesi (FAZ H kontratı); `detail` yalnızca kod eşleşmezse.
- Dil altyapısı: `tr/en` + en az **de/fr/es/ru/ja** iskeleti; eksik anahtar → en'e düşsün.
- **Test:** locale=de'de Türkçe metin KALMAMALI (E2E, mevcut i18n testinin genişletilmişi).

## FAZ K — Mobil globalleşme (`apps/mobile/**`)

- Sıfırdan i18n (238 string) — web'in sözlük yapısını yeniden kullan, cihaz dilini algıla.
- 10 `'tr-TR'` → cihaz locale'i.
- **Test:** cihaz dili de/en iken Türkçe metin kalmaması.

## FAZ L — Ses bölge yönlendirme (`apps/voice/**`)

- Node kaydına `region` (env) + `/sfu/select`'e bölge farkındalığı: aynı bölge → kanal-yerelliği
  → yük. İstemci gecikme ölçümü (ping) ile bölge seçimi.
- **Sözleşme (sabit):** `/presence` `{id,name}[]` değişmez.
- **Test:** 2 bölgeli sahte küme; Tokyo istemcisi Tokyo node'una düşüyor mu.

## FAZ M — Uyum (`apps/api/**` + `apps/web/**` — SIRALI, H/J bitince)

> Bu faz H ve J ile AYNI dizinlere yazar → onlarla eşzamanlı verilmez.

- GDPR veri dışa aktarma (asenkron iş → indirilebilir arşiv), hesap silme (anonimleştirme
  vs. sert silme kararı belgelenmeli), yaş kapısı (kayıtta doğum tarihi + yaşa göre NSFW).
- **Test:** dışa aktarma arşivi kullanıcının tüm verisini içeriyor mu; silinen hesabın
  mesajları ne oluyor (Discord: "Deleted User" olarak kalır).
