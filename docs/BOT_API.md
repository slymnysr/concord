# Concord Bot API

Bot oluşturma: **Kullanıcı Ayarları → Geliştirici → Oluştur**. Token yalnızca oluşturma/sıfırlama anında gösterilir.

## Kimlik doğrulama

REST isteklerinde:

```
Authorization: Bot <token>
```

Bot, eklendiği sunucularda normal bir üyedir — rol/izin sistemi aynen uygulanır.

## Hızlı başlangıç

```bash
TOKEN="scd_..."
API="http://localhost:8080/api/v1"

# Botun kendi kimliği
curl -s $API/users/me -H "Authorization: Bot $TOKEN"

# Kanala mesaj gönder
curl -s -X POST $API/channels/<CHANNEL_ID>/messages \
  -H "Authorization: Bot $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Merhaba! 🤖"}'

# Zengin embed ile
curl -s -X POST $API/channels/<CHANNEL_ID>/messages \
  -H "Authorization: Bot $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"","embeds":[{"title":"Başlık","description":"Açıklama","color":3066993}]}'
```

## Gateway (gerçek zamanlı olaylar)

1. JWT al:

```bash
curl -s -X POST $API/auth/bot-session -H "Authorization: Bot $TOKEN" -d '{}'
# → {"access_token":"...","user_id":"..."}
```

2. Phoenix WebSocket'e bağlan: `ws://localhost:4000/socket/websocket?token=<JWT>&vsn=2.0.0`
3. Sunucu kanalına katıl: `["1","1","guild:<GUILD_ID>","phx_join",{}]`
4. Olaylar: `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `GUILD_MEMBER_ADD`, `TYPING_START`, `presence_diff`…

## Sunucuya ekleme

- Kendi botunu: Geliştirici sekmesi → **Sunucuya Ekle** (Sunucuyu Yönet yetkisi gerekir).
- Başkasının botunu: uygulama `public` olmalı; `POST /guilds/{id}/bots {"application_id":"..."}`.

## Sınırlar ve notlar

- Kullanıcı başına en fazla 25 uygulama.
- Token sıfırlanınca eskisi anında geçersiz olur.
- Bot hesapları parola ile giriş yapamaz; `/auth/login` çalışmaz.
- Uygulama silinince bot tüm sunuculardan çıkarılır, mesajları "Silinmiş Bot" olarak kalır.
