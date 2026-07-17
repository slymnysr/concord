# API Kontratı (FAZ A yazar, FAZ B tüketir)

> FAZ A yeni/değişen endpoint'leri BURAYA yazar; FAZ B buna kodlar. İki AI dosya
> paylaşmadan, sadece bu kontrat üzerinden buluşur. Şekil: method, path, istek, yanıt.

## Medya — TAMAM

Upload akışı **presigned URL** ile istemciden DOĞRUDAN MinIO'ya gider; API baytları görmez.
İşleme (magic-byte doğrulama + EXIF temizleme + thumbnail + ClamAV taraması) MinIO'nun
`ObjectCreated` olayıyla ASENKRON tetiklenir → yükleme biter bitmez ek hazır DEĞİLDİR.

**1) Presign** — değişmedi:

```
POST /api/v1/uploads/presign   { filename, size_bytes }
→ 200 { upload_url, public_url, key, filename }
```

**2) Ek iliştirme** — `POST /channels/{id}/messages` içindeki `attachments[]`:

```
{ url: public_url, filename, content_type?, size_bytes? }
```

`content_type`/`size_bytes` **YOK SAYILIR** — sunucu nesneden kendisi tespit eder
(istemci beyanına güvenilmez). Ek 'clean' değilse **mesaj hiç oluşturulmaz**:

```
→ 400 { "error": "invalid_attachment", "detail": "..." }
```

Detay metinleri (kullanıcıya gösterilebilir):

- `ek "x.jpg": dosya henüz işlenmedi, birkaç saniye sonra tekrar dene` → **yeniden dene**
- `ek "x.jpg": dosya henüz taranıyor, birkaç saniye sonra tekrar dene` → **yeniden dene**
- `ek "x.exe": dosyada virüs bulundu, iliştirilemez` → kalıcı
- `ek "x.jpg": dosya reddedildi (geçersiz/bozuk içerik)` → kalıcı
- `ek "x.png": bu depoya ait olmayan URL` → kalıcı

> **FAZ B yapacak:** yükleme sonrası mesaj gönderimi 400 + `invalid_attachment` alırsa,
> "henüz işlenmedi/taranıyor" metinlerinde kısa bir gecikmeyle YENİDEN DENEMELİ (işleme
> asenkron; tipik olarak 1-3 sn). Diğerlerinde kullanıcıya hatayı göstermeli.

**3) Ek yanıtı** — `message.attachments[]` artık sunucu-tespitli metadata taşır:

```
{
  id: string, message_id: string, filename: string, url: string,
  content_type?: string,   // magic-byte'tan TESPİT EDİLEN gerçek tip (istemci beyanı değil)
  size_bytes: number,      // gerçek boyut
  width?: number,          // yalnızca görüntülerde
  height?: number,         // yalnızca görüntülerde
  thumb_url?: string,      // EXIF'siz JPEG thumbnail (uzun kenar 400px), yalnızca görüntülerde
  created_at: string
}
```

> **FAZ B yapacak:** görüntü eklerinde `thumb_url` varsa listede ONU göster (tam boy
> `url`'i değil) — tam boyu yüklemek sohbet akışında MB'larca gereksiz indirme demek.
> `width`/`height` ile yer tutucu (aspect-ratio kutusu) ayır → görüntü yüklenince
> sayfa ZIPLAMAZ (layout shift). Tam boy yalnızca tıklayınca/lightbox'ta.

## Arama — TAMAM

```
GET /api/v1/search/messages?q=...&sort=...&limit=...
    &guild_id=&channel_id=&author_id=&mentions=&pinned=&before=&after=&during=&has=
→ 200 [ { message: Message, channel: Channel, author?: User } ]
```

- `q` **veya** en az bir operatör zorunlu; ikisi de yoksa `[]` döner (hata değil).
- `limit`: 1..100, varsayılan 25.
- `sort`: **varsayılan alaka** (`ts_rank`, eşitlikte yeni önde). `sort=recent` → kronolojik.
  `q` yoksa alaka anlamsızdır (skor yok) → her zaman kronolojik.

**Arama davranışı (FAZ B'nin UI'da varsayabileceği):**

- **Çok-dilli:** JA/ZH/KO/RU/DE/TR/EN/FR ölçüldü (docs/DENETIM-GLOBAL.md tablosu).
  `メッセージ`, `消息`, `메시지`, `сообщение`, `Nachricht` hepsi bulunur.
- **Kök bulma:** `mesaj` → "mesajları"; `Nachricht` → "Nachrichten"; `test` → "tests".
- **Aksan-duyarsız:** `toplanti` → "toplantı".
- **Yazım toleransı:** `toplanit` → "toplantı".
- ⚠️ **Önek eşleşmesi yalnızca SON kelimeye uygulanır** (Meilisearch davranışı):
  `toplantı` → "toplantılar" bulur, ama `toplantı yarın` sorgusunda "toplantı" son kelime
  olmadığı için çekimli biçim eşleşmez. UI'da bu beklenmedik değil (arama-yazarken davranışı).
- Motor: **Meilisearch** (`MEILI_ADDR`). Yapılandırılmamışsa Postgres FTS'e düşer — ama bu
  düşüş CJK'da aramayı ÖLDÜRÜR, o yüzden üretimde `MEILI_ADDR` zorunludur (config.MustSecure).
- **İndeksleme ASENKRON:** mesaj gönderildikten hemen sonra arama onu bulamayabilir
  (tipik <1sn). İstemci "gönderdim ama aramada yok" durumunu hata saymamalı.

> **FAZ B yapacak:** arama UI'ında alaka/yeni sıralama anahtarı (`sort=recent`) sun.

## Reactions (N+1 fix) — TAMAM

`GET /channels/{channelID}/messages?limit&before` artık her mesajda **gömülü** döndürür:

```
message.reactions: [{ "emoji": string, "count": int, "me": bool }]   // yoksa alan gelmez
```

**FAZ B yapacak:** MessageList mesaj başına `GET .../reactions` ATMAYACAK; listedeki
`message.reactions`'ı kullanacak. Tekil ekle/çıkar endpoint'leri değişmedi (optimistic update aynı).

## Push abonelikleri — TAMAM

```
PUT /api/v1/users/me/push-subscriptions
    { endpoint, platform: "web" | "expo", p256dh?, auth? }
→ 204
```

- `platform: "web"` → `p256dh` + `auth` **zorunlu** (Web Push payload'ı bunlarla şifrelenir).
- `platform: "expo"` → `endpoint` `ExponentPushToken[...]` olmalı; p256dh/auth **gönderilmez**.
- `platform` yoksa geriye dönük çıkarım yapılır (p256dh/auth varsa web, yoksa expo).

## Hata sözleşmesi — İSTEMCİ `error` KODUNU ÇEVİRİR, `detail`'i GÖSTERMEZ

```
{ "error": "<kod>", "detail": "<geliştirici ipucu>" }
```

**KURAL:** `detail` **TÜRKÇEDİR ve kullanıcıya GÖSTERİLMEMELİDİR.** Uygulama global;
Fransız kullanıcıya "sunucu oluşturulamadı" göstermek kabul edilemez. `detail` yalnızca
geliştirici/log içindir (konsola bas, ekrana değil).

**İstemci yapmalı:**

1. `t('error.' + error)` — çevirisi varsa onu göster.
2. Yoksa HTTP durumuna göre GENEL yerelleştirilmiş mesaj (400 → "geçersiz istek",
   403 → "yetkin yok", 404 → "bulunamadı", 429 → "çok fazla istek", 5xx → "bir şeyler ters gitti").
3. `detail`'i ASLA ekrana koyma; konsola yaz.

**Kodlar KARARLIDIR** — bir kod yayınlandıktan sonra anlamı değişmez, silinmez.
Yeni durum için yeni kod eklenir. Şu an 92 kod:

`2fa_required`
`already_enabled`
`already_exists`
`already_following`
`already_member`
`already_published`
`automod_blocked`
`bad_platform`
`bad_request`
`bad_time`
`bad_token`
`banned`
`blocked`
`cannot_ban_owner`
`cannot_delete_everyone`
`cannot_kick_owner`
`communication_disabled`
`conflict`
`dm_restricted`
`email_taken`
`exhausted`
`expired`
`forbidden`
`github_error`
`internal`
`invalid`
`invalid_2fa`
`invalid_actions`
`invalid_answers`
`invalid_attachment`
`invalid_auto_archive`
`invalid_bio`
`invalid_code`
`invalid_content`
`invalid_credentials`
`invalid_description`
`invalid_email`
`invalid_entity_type`
`invalid_format`
`invalid_level`
`invalid_name`
`invalid_question`
`invalid_rate`
`invalid_refresh`
`invalid_response`
`invalid_role`
`invalid_state`
`invalid_status`
`invalid_target`
`invalid_token`
`invalid_topic`
`invalid_trigger`
`invalid_type`
`invalid_username`
`invalid_users`
`invalid_volume`
`limit_reached`
`mail_failed`
`missing`
`missing_arg`
`missing_emoji`
`missing_location`
`missing_permission`
`no_secret`
`no_storage`
`no_token`
`not_announcement`
`not_bot`
`not_configured`
`not_enabled`
`not_found`
`not_member`
`not_stage`
`not_voice`
`nothing_to_update`
`owner_cant_leave`
`owns_guilds`
`perm_escalation`
`poll_expired`
`private_bot`
`rate_limited`
`role_hierarchy`
`self`
`self_follow`
`slowmode`
`too_far`
`too_large`
`too_many_tags`
`too_soon`
`unauthorized`
`weak_password`
`wrong_password`

> `bad_request` / `internal` / `not_found` / `forbidden` genel kodlardır: çağrı yerine göre
> farklı `detail` taşırlar. İstemci bunlar için genel mesaj gösterir. Kullanıcının **eylem
> alabileceği** durumlar (ör. `invalid_attachment`, `rate_limited`, `weak_password`,
> `channel_full`) özel kodlarla ayrılmıştır ve çevrilmelidir.

## Uyum (FAZ M) — yaş kapısı + veri dışa aktarma

**Kayıt artık `birth_date` ZORUNLU** (COPPA 13+/DSA):

```
POST /api/v1/auth/register  { username, email, display_name, password, birth_date: "YYYY-MM-DD" }
→ 400 { error: "invalid_birth_date" }   // eksik/geçersiz/gelecek tarih
→ 403 { error: "underage" }             // 13 yaş altı — verisi DB'ye YAZILMAZ
```

> **FAZ B/K yapacak:** kayıt formunda doğum tarihi alanı ZORUNLU. Alan olmadan kayıt 400 alır.
> `error.underage` ve `error.invalid_birth_date` çevrilmelidir (kullanıcı eylem alabilir).

**Veri dışa aktarma (GDPR Md.15)** — ASENKRON:

```
POST /api/v1/users/me/data-export        → 202 { id: string, status: "pending" }
GET  /api/v1/users/me/data-exports       → 200 [{ id, status, requested_at, ready_at?, expires_at? }]
GET  /api/v1/users/me/data-exports/{id}  → 200 (JSON arşiv) | 409 not_ready | 410 expired | 404
```

- `id` **STRING** (Snowflake 64-bit; JSON sayı JS'te yuvarlanır).
- Bekleyen istek varken yeni POST aynı isteği döner (her istek 41 tablo tarar).
- Arşiv **7 gün** sonra sona erer.

**Hesap silme (GDPR Md.17)** — `DELETE /api/v1/users/me { password }` → 204.
Anonimleştirir, girişi engeller; **mesajlar kalır** (sert silme başkalarının sohbet geçmişini
bozardı — Discord da böyle yapar). Sahip olunan sunucu varsa `409 owns_guilds`.
