# Concord — Kurulum Durumu (Faz 0 Doğrulama)

Tarih: 2026-05-24

## Otomatik tamamlanan ✓

| Bileşen                                            | Durum       | Test                                             |
| -------------------------------------------------- | ----------- | ------------------------------------------------ |
| Klasör yapısı + Turborepo                          | ✓           | dosyalar oluştu                                  |
| Go 1.22.5 (`~/.local/go`)                          | ✓           | `go version`                                     |
| pnpm 9 (global)                                    | ✓           | `pnpm --version`                                 |
| pnpm workspace bağımlılıkları (web + paketler)     | ✓           | 283 paket yüklü                                  |
| Go API bağımlılıkları + build (`apps/api/bin/api`) | ✓           | binary oluştu (~9MB)                             |
| Go API runtime                                     | ✓ ÇALIŞIYOR | `curl localhost:8080/health` → `{"status":"ok"}` |
| Web (Vite dev)                                     | ✓ ÇALIŞIYOR | `curl localhost:3000/` → HTTP 200                |

**Çalışan servisler:**

- API: PID `/tmp/concord-api.pid` — port 8080
- Web: PID `/tmp/concord-web.pid` — port 3000

Durdurmak için:

```bash
kill $(cat /tmp/concord-api.pid) $(cat /tmp/concord-web.pid)
```

## Engellenen (manuel müdahale gerekiyor)

### 1. Docker Desktop WSL Integration

**Sorun:** `docker` komutu WSL içinden erişilemiyor.

**Çözüm:** Windows tarafında Docker Desktop'ı aç → Settings → Resources → WSL Integration → Ubuntu-24.04 için aç → Apply & Restart.

**Sonrası:**

```bash
docker --version  # çalışmalı
cd /home/slmnys/concord && pnpm db:up
```

### 2. Elixir + Erlang/OTP

**Sorun:** Erlang derlemek için sudo gerektiren build dep'leri eksik (libssl-dev, libncurses-dev, vs.). asdf precompiled binary yok, kerl kaynaktan derliyor.

**Çözüm (sudo şifresi gerekli, tek seferlik):**

```bash
# Build deps
sudo apt-get update
sudo apt-get install -y build-essential autoconf m4 libncurses-dev \
  libwxgtk3.2-dev libwxgtk-webview3.2-dev libgl1-mesa-dev libglu1-mesa-dev \
  libpng-dev libssh-dev unixodbc-dev xsltproc fop libxml2-utils libncurses5-dev \
  inotify-tools unzip

# asdf (sudo gerekmez)
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.1
echo '. "$HOME/.asdf/asdf.sh"' >> ~/.bashrc
source ~/.bashrc

# Erlang + Elixir
asdf plugin add erlang
asdf plugin add elixir
asdf install erlang 26.2.5
asdf install elixir 1.16.3-otp-26
asdf global erlang 26.2.5
asdf global elixir 1.16.3-otp-26

# Doğrula
elixir --version
```

Erlang derleme **15-25 dakika** sürer.

**Sonrası:**

```bash
cd /home/slmnys/concord/apps/gateway
mix local.hex --force
mix local.rebar --force
mix deps.get
mix phx.server  # port 4000
```

## Sıradaki

Yukarıdaki 2 manuel adım tamamlandığında:

1. `pnpm db:up` (DB'ler ayağa kalkar)
2. `mix phx.server` (gateway)
3. `tarayıcı → localhost:3000` (Concord landing + app shell görünmeli)

Bunlar bitince Faz 1'e geçilecek (Snowflake ID, auth, postgres şeması, ilk mesaj akışı).
