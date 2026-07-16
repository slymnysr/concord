#!/usr/bin/env bash
# MinIO bucket-notification kurulumu — yüklenen her nesne için FAZ A'nın medya webhook'unu tetikler.
#
# NEDEN GEREKLİ: Upload'lar presigned URL ile İSTEMCİDEN DOĞRUDAN MinIO'ya gider; API dosya
# baytlarını hiç görmez. Bu yüzden işleme (magic-byte doğrulama + EXIF temizleme + thumbnail +
# virüs tarama) MinIO'nun ObjectCreated olayıyla asenkron tetiklenir.
#
# SÖZLEŞME (ROADMAP FAZ F ↔ FAZ A):
#   MinIO → POST {API}/api/v1/internal/media/events   header: X-Media-Secret: $MEDIA_EVENT_SECRET
#
# ⚠️ Bu betik, FAZ A'nın webhook endpoint'i YAZILDIKTAN SONRA anlamlıdır. Endpoint yoksa
#    MinIO olayları 404 alır (zararsız; MinIO yeniden dener). Bkz. ROADMAP FAZ F "⚠️ SONRA".
#
# Kullanım:
#   MEDIA_EVENT_SECRET=... API_URL=http://concord-host:8080 ./setup-notifications.sh
set -euo pipefail

MINIO_ALIAS="${MINIO_ALIAS:-concord}"
MINIO_URL="${MINIO_URL:-http://localhost:9000}"
MINIO_USER="${MINIO_USER:-concord}"
MINIO_PASS="${MINIO_PASS:-concord_dev_minio}"
BUCKET="${MINIO_BUCKET:-concord-uploads}"
API_URL="${API_URL:-http://host.docker.internal:8080}"
SECRET="${MEDIA_EVENT_SECRET:?MEDIA_EVENT_SECRET gerekli}"

WEBHOOK_ID="concord-media"
ENDPOINT="${API_URL}/api/v1/internal/media/events"

echo "→ mc alias: ${MINIO_ALIAS} (${MINIO_URL})"
mc alias set "${MINIO_ALIAS}" "${MINIO_URL}" "${MINIO_USER}" "${MINIO_PASS}" >/dev/null

echo "→ webhook hedefi tanımlanıyor: ${ENDPOINT}"
mc admin config set "${MINIO_ALIAS}" "notify_webhook:${WEBHOOK_ID}" \
  endpoint="${ENDPOINT}" \
  auth_token="${SECRET}" \
  queue_limit="1000"

echo "→ MinIO yeniden başlatılıyor (config değişikliği için şart)"
mc admin service restart "${MINIO_ALIAS}"
sleep 5

echo "→ bucket olayı bağlanıyor: ${BUCKET} → ObjectCreated"
mc event add "${MINIO_ALIAS}/${BUCKET}" "arn:minio:sqs::${WEBHOOK_ID}:webhook" \
  --event put || echo "  (olay zaten bağlı olabilir — sorun değil)"

echo "→ mevcut olaylar:"
mc event list "${MINIO_ALIAS}/${BUCKET}"

echo "✓ tamam. Yüklenen her nesne ${ENDPOINT} adresine POST edilecek."
echo "  NOT: MinIO 'auth_token'ı Authorization header'ı olarak gönderir."
echo "  FAZ A webhook'u bunu doğrulamalı (Bearer/token karşılaştırması)."
