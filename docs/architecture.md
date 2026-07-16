# Mimari

## Üst düzey diyagram

```
                    ┌─────────────────┐
                    │   İstemciler    │
                    │ web/desktop/RN  │
                    └────────┬────────┘
                             │
                  ┌──────────┴───────────┐
                  │                      │
              HTTPS/REST              WSS
                  │                      │
            ┌─────▼─────┐  Redis  ┌──────▼──────┐
            │   Go API  │ PubSub  │   Phoenix   │
            │   (chi)   │────────►│   Gateway   │
            └─────┬─────┘ (olay)  └──────┬──────┘
                  │                      │
       ┌──────────┼──────────┐           │
       │          │          │           │
   ┌───▼───┐  ┌──▼───┐  ┌───▼────┐  ┌───▼──────┐
   │  PG   │  │Redis │  │ MinIO  │  │  Voice   │
   │(meta+ │  │cache+│  │(medya) │  │(mediasoup)│
   │ msgs) │  │pubsub│  └────────┘  └──────────┘
   └───────┘  └──────┘
```

> **Doğruluk notu (2026-07):** Diyagram önceden API↔Gateway arasını *gRPC*, mesajları da
> *ScyllaDB* gösteriyordu — ikisi de gerçeği yansıtmıyordu. Gerçek: iletişim **Redis PubSub**
> (`concord:guild:*` kanalları, `RedisBridge`), mesajlar **PostgreSQL**'de (`messages` tablosu,
> `search_vector` ile FTS). ScyllaDB provisyonlanmış ama hiç kullanılmıyordu → **kaldırıldı**.
> Mesaj-ölçek gerçek ihtiyaç olunca planlı bir faz olarak ele alınacak (bkz. `ROADMAP-FAZLAR.md` TIER 4).

## Servisler ve Sorumluluklar

### Gateway (Phoenix)
- WebSocket bağlantı yönetimi (milyonlarca eşzamanlı)
- Authentication (JWT doğrulama)
- Channel join/leave (guild, dm, user kanalları)
- Presence (online/offline/idle/dnd)
- Heartbeat
- Mesaj yayını (PubSub üzerinden API'den gelen olayları istemcilere ulaştırır)

### API (Go)
- Kullanıcı kaydı, giriş, JWT üretimi
- Guild/Channel/Role CRUD
- Mesaj yazma (Scylla'ya yazar, ardından Gateway PubSub'a yayar)
- Dosya yükleme (MinIO/R2'ye)
- Arkadaşlık sistemi
- Moderasyon endpoint'leri

### Voice (Node.js + mediasoup)
- WebRTC SFU (Selective Forwarding Unit)
- Audio producer/consumer
- Video + ekran paylaşımı
- Opus codec
- Simulcast (mobil → düşük kalite, masaüstü → yüksek)

## Veri Akışı: Mesaj Gönderme

1. İstemci → `POST /api/v1/channels/{id}/messages` (Go API)
2. API → JWT doğrular, izin kontrolü yapar
3. API → ScyllaDB'ye mesajı yazar (snowflake ID üretir)
4. API → Redis PubSub'a `MESSAGE_CREATE` event'i yayar
5. Gateway → ilgili `guild:{id}` topic'ine subscribe olan tüm istemcilere WebSocket üzerinden iletir

## Snowflake ID

Discord-stili 64-bit ID:
```
| 42 bit timestamp (ms since epoch) | 5 bit worker_id | 5 bit process_id | 12 bit sequence |
```

Sortable, distributed, çakışmasız.
