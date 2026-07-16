# API Kontratı (FAZ A yazar, FAZ B tüketir)

> FAZ A yeni/değişen endpoint'leri BURAYA yazar; FAZ B buna kodlar. İki AI dosya
> paylaşmadan, sadece bu kontrat üzerinden buluşur. Şekil: method, path, istek, yanıt.

## Medya
_(FAZ A doldurur: thumbnail URL alanı, attachment durumu ready/rejected vb.)_

## Arama
_(FAZ A doldurur: GET /search endpoint şekli, filtreler, yanıt.)_

## Reactions (N+1 fix) — TAMAM
`GET /channels/{channelID}/messages?limit&before` artık her mesajda **gömülü** döndürür:
```
message.reactions: [{ "emoji": string, "count": int, "me": bool }]   // yoksa alan gelmez
```
**FAZ B yapacak:** MessageList mesaj başına `GET .../reactions` ATMAYACAK; listedeki
`message.reactions`'ı kullanacak. Tekil ekle/çıkar endpoint'leri değişmedi (optimistic update aynı).
