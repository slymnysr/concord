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

- **Türkçe kök bulma:** `mesaj` → "mesajları" bulur.
- **Aksan-duyarsız:** `toplanti` → "toplantı" bulur (kullanıcıların çoğu Türkçe karakter yazmaz).
- **İngilizce de köklenir:** `test` → "tests" bulur (karışık içerik).
- Motor: PostgreSQL FTS (`unaccent` + `turkish`‖`english` tsvector). Ayrı bir arama servisi
  (Meilisearch) YOK — gerekçesi ve ölçümü: ROADMAP FAZ A.

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
