# Concord

Türkiye için yerli Discord alternatifi. **İşlevsel parite hedefine ulaşıldı** (~300 özellik: metin/ses/video, forum-sahne-duyuru kanalları, roller/izinler, AutoMod, bot API'si, anketler, 2FA, e-posta akışları, oyun algılamalı masaüstü uygulaması...). Ayrıntılı parite haritası: [`DISCORD_GAP_ANALIZ.md`](DISCORD_GAP_ANALIZ.md).

## Mimari

| Bileşen               | Teknoloji                               | Klasör                                            |
| --------------------- | --------------------------------------- | ------------------------------------------------- |
| Gateway (WebSocket)   | Elixir/Phoenix                          | `apps/gateway`                                    |
| API (REST)            | Go + chi                                | `apps/api`                                        |
| Voice/Video SFU       | Node.js + mediasoup                     | `apps/voice`                                      |
| Web istemcisi         | React + Vite + Redux Toolkit + Tailwind | `apps/web`                                        |
| Masaüstü              | **Tauri 2** (WebView2/webkit2gtk)       | `apps/desktop` ([README](apps/desktop/README.md)) |
| Mobil                 | React Native (planlı)                   | `apps/mobile`                                     |
| Ana DB                | PostgreSQL                              | docker compose                                    |
| Cache/PubSub          | Redis                                   | docker compose                                    |
| Object storage        | MinIO (dev) → Cloudflare R2 (prod)      | docker compose                                    |
| Dev SMTP              | MailHog (`http://localhost:8025`)       | docker compose                                    |
| Mesaj DB (ölçek fazı) | ScyllaDB                                | docker compose                                    |

## Geliştirme Ortamı

### 1. Gerekli runtime'lar

```bash
# pnpm (Node 20+)
npm install -g pnpm@9

# Elixir (Ubuntu/WSL)
sudo apt-get install -y elixir erlang-dev erlang-xmerl erlang-os-mon

# Go 1.22+
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc && source ~/.bashrc

# (Masaüstü için) Rust + sistem kütüphaneleri
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Docker Desktop (WSL entegrasyonu açık)
```

### 2. Altyapıyı başlat

```bash
cp .env.example .env
pnpm db:up   # PostgreSQL(5433) Redis MinIO MailHog ScyllaDB
```

Migration'lar `apps/api/migrations/` altında (şu an 53). Uygulama:

```bash
PGPASSWORD=concord_dev psql -h localhost -p 5433 -U concord -d concord -f apps/api/migrations/XXXX.up.sql
```

### 3. Bağımlılıklar

```bash
pnpm install
cd apps/gateway && mix deps.get && cd ../..
cd apps/api && go mod download && cd ../..
```

### 4. Servisler

> **Ayarlar tek yerden:** dört servis de (API, gateway, voice, web) **depo kökündeki `.env`**
> dosyasını kendi okur — servisi başlatırken env değişkeni export etmen gerekmez. Anahtar
> değiştirdiğinde (`JWT_SECRET` vb.) **hepsini yeniden başlat**: biri eski secret'la kalırsa
> HTTP çalışmaya devam eder ama WebSocket'ler 403 alır ve yalnızca realtime/ses sessizce ölür.
> Zaten set edilmiş env değişkenleri `.env`'i EZER (k8s/CI böyle çalışır).
> Yeni anahtar üretmek için: `cd apps/api && go run ./cmd/genkeys`

```bash
# Gateway (4000)
cd apps/gateway && mix phx.server
# API (8080)
cd apps/api && go build -o bin/api ./cmd/api && ./bin/api
# Voice SFU (4443/4444)
cd apps/voice && pnpm dev
# Web (3000)
cd apps/web && pnpm dev
# Masaüstü penceresi (Vite çalışırken)
cd apps/desktop && pnpm tauri dev
```

Tarayıcı: `http://localhost:3000` · Gönderilen dev mailleri: `http://localhost:8025`

## Paketler / Dağıtım

- **Masaüstü**: GitHub Actions → **Desktop Build** workflow'u Windows (`.msi`/`.exe`) ve Linux (`.deb`/`.AppImage`) paketleri üretir (`v*` tag'i veya elle tetikleme).
- **Bot geliştirme**: [`docs/BOT_API.md`](docs/BOT_API.md)

## Yol Haritası (kalanlar)

- Mobil uygulama (React Native)
- Masaüstü oto-güncelleme (release imza altyapısıyla)
- Ölçekleme fazı: mesajları ScyllaDB'ye taşıma, k8s dağıtımı, Türkiye DC
- KVKK/5651 uyum dokümantasyonu ve veri ihracı araçları

## Lisans

Henüz seçilmedi.
