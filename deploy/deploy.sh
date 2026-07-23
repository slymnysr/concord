#!/usr/bin/env bash
# Concord — tek komutla üretim/demo kurulumu (Oracle Cloud ARM için).
#
# Kullanım (deploy/ dizininden, VM'de):
#   DOMAIN=concord.ornek.com ./deploy.sh
#
# DOMAIN vermezsen localhost varsayılır (yalnızca yerel test; gerçek HTTPS olmaz).
# Yeniden çalıştırılabilir: .env varsa korunur, migration'lar yalnızca boş DB'de uygulanır.
set -euo pipefail
cd "$(dirname "$0")"

DOMAIN="${DOMAIN:-localhost}"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> Concord dağıtımı — DOMAIN=$DOMAIN"

# 1) Ön koşullar
command -v docker >/dev/null || { echo "HATA: docker kurulu değil. Önce Docker kur."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "HATA: docker compose (v2) yok."; exit 1; }

# 2) Public IP (mediasoup ANNOUNCED_IP) — verilmemişse otomatik bul
if [ -z "${MS_ANNOUNCED_IP:-}" ]; then
  if [ "$DOMAIN" = "localhost" ]; then
    MS_ANNOUNCED_IP=127.0.0.1
  else
    MS_ANNOUNCED_IP="$(curl -s https://api.ipify.org || curl -s https://ifconfig.me || echo '')"
  fi
fi
[ -n "$MS_ANNOUNCED_IP" ] || { echo "HATA: public IP bulunamadı. MS_ANNOUNCED_IP=<ip> ver."; exit 1; }
echo "==> Public IP (ANNOUNCED_IP): $MS_ANNOUNCED_IP"

# 3) .env üret (yoksa) — sırları genkeys ile, gerisi konteyner ağ değerleri
if [ -f .env ]; then
  echo "==> .env zaten var, korunuyor. (Yeniden üretmek için sil.)"
else
  echo "==> Sırlar üretiliyor (genkeys, docker içinde)..."
  docker run --rm -e GOTOOLCHAIN=auto -v "$(cd .. && pwd)":/src -w /src/apps/api \
    golang:1.25-alpine sh -c 'go run ./cmd/genkeys' | grep -E '^[A-Z_]+=' > .env
  PGPW="$(openssl rand -hex 24)"; REDISPW="$(openssl rand -hex 24)"
  # genkeys POSTGRES_PASSWORD üretiyor; onu kullan
  grep -q '^POSTGRES_PASSWORD=' .env || echo "POSTGRES_PASSWORD=$PGPW" >> .env
  PGPW="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
  MEILIKEY="$(grep '^MEILI_MASTER_KEY=' .env | cut -d= -f2-)"
  cat >> .env <<EOF
# ---- konteyner ağı + dağıtım ----
NODE_ENV=production
API_PORT=8080
DOMAIN=$DOMAIN
MS_ANNOUNCED_IP=$MS_ANNOUNCED_IP
MS_RTC_MIN_PORT=40000
MS_RTC_MAX_PORT=40040
PUBLIC_BASE_URL=https://$DOMAIN
WEB_BASE_URL=https://$DOMAIN
ALLOWED_ORIGINS=https://$DOMAIN
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=concord
POSTGRES_DB=concord
POSTGRES_DSN=postgres://concord:$PGPW@postgres:5432/concord?sslmode=disable
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDISPW
MEILI_ADDR=http://meilisearch:7700
MEILI_KEY=$MEILIKEY
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=concord
MINIO_BUCKET=concord
MINIO_PUBLIC_BASE=https://$DOMAIN/files
CLAMAV_ADDR=clamav:3310
# E-posta (TLS'li SMTP ZORUNLU — api MustSecure). Bir sağlayıcının bilgilerini
# deploy'dan önce ver:  SMTP_HOST=smtp-relay.brevo.com SMTP_USER=... SMTP_PASS=... ./deploy.sh
# Boş bırakılırsa site açılır ama kayıt/şifre-sıfırlama mailleri gönderilemez.
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_REQUIRE_TLS=true
MAIL_FROM=${MAIL_FROM:-no-reply@$DOMAIN}
AUTH_RATE_LIMIT_PER_MIN=60
API_RATE_LIMIT_PER_MIN=600
WORKER_ID=1
EOF
  echo "==> .env üretildi ($(grep -cE '^[A-Z_]+=' .env) anahtar)."
  grep -q '^SMTP_HOST=.\+' .env || echo "==> UYARI: SMTP_HOST boş — site açılır ama e-posta (kayıt/şifre sıfırlama) GÖNDERİLEMEZ. Sağlayıcı bilgisi ekleyip 'api'yi yeniden başlat."
fi

# 4) İmajları derle
echo "==> İmajlar derleniyor (ilk sefer uzun sürer)..."
$COMPOSE build

# 5) Altyapıyı başlat, postgres sağlıklı olana kadar bekle
echo "==> Altyapı başlatılıyor..."
$COMPOSE up -d postgres redis meilisearch minio clamav
echo -n "==> Postgres bekleniyor"
for i in $(seq 1 60); do
  if $COMPOSE exec -T postgres pg_isready -U concord >/dev/null 2>&1; then echo " ✓"; break; fi
  echo -n "."; sleep 2
done

# 6) Migration'lar — yalnızca boş DB'de (users tablosu yoksa) sırayla uygula
if $COMPOSE exec -T postgres psql -U concord -d concord -tAc \
     "select to_regclass('public.users')" 2>/dev/null | grep -q users; then
  echo "==> DB zaten kurulu, migration atlanıyor."
else
  echo "==> Migration'lar uygulanıyor (59 dosya)..."
  for f in ../apps/api/migrations/[0-9]*.up.sql; do
    $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U concord -d concord < "$f" >/dev/null
  done
  echo "==> Migration'lar tamam."
fi

# 7) MinIO bucket'ı oluştur (yoksa)
$COMPOSE exec -T minio sh -c \
  'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; \
   mc mb --ignore-existing local/concord >/dev/null 2>&1; \
   mc anonymous set download local/concord >/dev/null 2>&1' || echo "(minio bucket adımı atlandı — elle kurulabilir)"

# 8) Uygulama + kenar
echo "==> Uygulama servisleri başlatılıyor..."
$COMPOSE up -d api gateway voice web caddy

echo ""
echo "======================================================"
echo " Concord ayakta.  https://$DOMAIN"
echo " Durum:   $COMPOSE ps"
echo " Loglar:  $COMPOSE logs -f api gateway voice web"
echo " E-posta:  SMTP_HOST=$(grep '^SMTP_HOST=' .env | cut -d= -f2- | grep -q . && echo 'ayarlı' || echo 'BOŞ — mail gitmez')"
echo "======================================================"
