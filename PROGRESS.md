# Concord — İlerleme Raporu

## Çalışan Servisler

| Servis | Port | Durum |
|--------|------|-------|
| Gateway (Elixir/Phoenix) | 4000 | ✓ |
| API (Go/chi) | 8080 | ✓ |
| Web (React/Vite) | 3000 | ✓ |
| Voice (Node/mediasoup) | 4443 (WS), 4444 (HTTP) | ✓ |
| PostgreSQL | 5433 | ✓ (9 migration) |
| Redis | 6379 | ✓ |
| ScyllaDB | 9042 | ✓ |
| MinIO | 9000/9001 | ✓ |

## Tamamlanan Fazlar

**Faz 0 — İskele**
- Turborepo monorepo, Docker compose, CI/CD

**Faz 1 — MVP Chat**
- Auth (register/login/refresh/me + JWT + Argon2id)
- Snowflake ID üretici (Go)
- Guild/channel/message CRUD
- Phoenix Gateway + Redis PubSub
- Real-time mesaj akışı
- Frontend: AuthPage, ServerRail, ChannelList, MessageList, MessageInput, MemberList

**Faz 1.x — Yönetim**
- Davet seçenekleri (max-use, expire) + UI
- Rol sistemi + 41 permission bitmask
- Permission middleware (RequirePerm + ManageRoles vs.)
- Channel permission overrides (role/user allow/deny)
- Ban/Kick/Timeout endpoint'leri
- ServerSettingsModal (4 sekme: Genel, Roller, Üyeler, Banlanmış)

**Faz 2 — Voice**
- mediasoup voice servisi (Node.js)
- WebRTC signaling (WebSocket)
- Web voice client (mediasoup-client)
- Kamera + ekran paylaşımı (video producer/consumer)
- Voice presence (HTTP polling, channel list'te göster)
- Modern UI: video grid + mikrofon/kamera/ekran/leave butonları

**Faz 3 — Direct Messages**
- DM kanalları (channels.type='dm') + dm_participants tablosu
- DM açma + listeleme endpoint'leri
- Friendship sistemi (request/accept/remove)
- AddFriendModal UI

**Faz 4 — Dosya + Reaksiyonlar**
- MinIO entegrasyonu (S3 uyumlu)
- Presigned URL ile direkt upload
- Mesajda attachment desteği (image/video/file preview)
- Reactions: add/remove + emoji picker

**Faz 5 — Etkileşim**
- @mentions parse + bildirim oluşturma
- Notifications endpoint + bell UI
- Mesaj edit + delete (backend + UI: hover menü, inline edit)
- Markdown desteği (bold, italic, underline, strike, code, blockquote, spoiler, link, mention)
- Real-time WebSocket entegrasyonu:
  - MESSAGE_UPDATE, MESSAGE_DELETE
  - REACTION_ADD, REACTION_REMOVE
  - NOTIFICATION (kullanıcı kanalı)
  - TYPING_START
- Typing indicator (4sn throttled gönderim, 5sn TTL gösterim)
- Kullanıcı durumu (online/idle/dnd/invisible)
- Full-text search (PostgreSQL ts_vector + GIN)

## Test Hesabı

- E-posta: `slmnys@concord.com`
- Parola: `sifre12345`
- Kullanıcı: `slmnys`

## Hızlı Komutlar

```bash
# Tüm servisleri yeniden başlat
pkill -f 'bin/api'; pkill -f 'mix phx.server'; pkill -f 'tsx watch'
cd /home/slmnys/concord/apps/api && \
  POSTGRES_DSN='postgres://concord:concord_dev@localhost:5433/concord?sslmode=disable' \
  JWT_SECRET='dev_jwt_secret_change_in_prod_at_least_32_chars' \
  nohup ./bin/api > /tmp/concord-api.log 2>&1 &

cd /home/slmnys/concord/apps/gateway && \
  . /home/slmnys/.asdf/asdf.sh && \
  JWT_SECRET='dev_jwt_secret_change_in_prod_at_least_32_chars' \
  nohup mix phx.server > /tmp/concord-gateway.log 2>&1 &

cd /home/slmnys/concord/apps/voice && \
  nohup pnpm dev > /tmp/concord-voice.log 2>&1 &

cd /home/slmnys/concord/apps/web && \
  nohup pnpm dev > /tmp/concord-web.log 2>&1 &
```

## Sırada (öncelik sırası)

1. **DM tam sayfa UI** — Home butonu → DM mode (currently sadece modal)
2. **Search frontend** — header'da arama bar'ı çalışsın
3. **Threads** — mesaja cevap thread'i
4. **Pinned messages** — kanalda sabitlenmiş mesajlar
5. **Custom emoji per server** — sunucu emoji yönetimi
6. **Bot API + webhooks** — Faz 6
7. **Mobile (React Native)** — Faz 7
8. **Desktop (Electron)** — Faz 8
9. **Production deployment** — Türkiye DC, Cloudflare R2, KVKK uyum belgesi
