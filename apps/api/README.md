# Concord API

Go ile yazılmış REST API servisi. Kullanıcı, sunucu, kanal, mesaj CRUD'u burada.

## Kurulum

Go 1.22+ gerekir.

```bash
# Go kurulumu (Ubuntu/WSL)
sudo snap install go --classic
# veya
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc

# Bağımlılıklar
make deps

# Çalıştırma
make run
```

## Endpoint'ler

- `GET /health` — sağlık
- `GET /version` — versiyon
- `/api/v1/*` — Faz 1'de doldurulacak (auth, guilds, channels, messages, users)
