# API Kontratı (FAZ A yazar, FAZ B tüketir)

> FAZ A yeni/değişen endpoint'leri BURAYA yazar; FAZ B buna kodlar. İki AI dosya
> paylaşmadan, sadece bu kontrat üzerinden buluşur. Şekil: method, path, istek, yanıt.

## Medya — KISMİ (işleme kütüphanesi hazır, wiring F'e bağlı)

FAZ A `internal/media` HAZIR (doğrulama+EXIF+thumbnail+ClamAV, testli). Ama presigned upload
MinIO'ya doğrudan gittiği için işleme MinIO-event'iyle tetiklenir → **webhook wiring F sonrası** yazılacak.
⚠️ **FAZ F bitince** (MinIO-event + ClamAV) FAZ A tamamlar: webhook + storage variant + attachment
şeması + route → sonra bu bölüm FAZ B için doldurulur (thumbnail URL, attachment status ready/rejected).
Bkz. ROADMAP FAZ F "⚠️ SONRA" notu.

## Arama

_(FAZ A doldurur: GET /search endpoint şekli, filtreler, yanıt.)_

## Reactions (N+1 fix) — TAMAM

`GET /channels/{channelID}/messages?limit&before` artık her mesajda **gömülü** döndürür:

```
message.reactions: [{ "emoji": string, "count": int, "me": bool }]   // yoksa alan gelmez
```

**FAZ B yapacak:** MessageList mesaj başına `GET .../reactions` ATMAYACAK; listedeki
`message.reactions`'ı kullanacak. Tekil ekle/çıkar endpoint'leri değişmedi (optimistic update aynı).
