# Concord — Kubernetes manifest'leri

Tüm servisler için temel dağıtım. Sıra:

```bash
kubectl apply -f namespace.yaml
kubectl apply -f secrets.example.yaml   # ÖNCE gerçek değerlerle doldur (aşağıya bak)
kubectl apply -f postgres.yaml -f redis.yaml -f minio.yaml -f clamav.yaml
kubectl apply -f api.yaml -f gateway.yaml -f voice.yaml -f web.yaml
kubectl apply -f monitoring.yaml
kubectl apply -f ingress.yaml
```

## ⚠️ Secret'lar (prod'da zorunlu)
API, dev-default secret ile **başlamayı reddeder** (`config.MustSecure`, FAZ A). Bu yüzden
`concord-secrets` içindeki değerler GERÇEK olmalı:

```bash
kubectl -n concord create secret generic concord-secrets \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
  --from-literal=VOICE_CONTROL_SECRET="$(openssl rand -base64 32)" \
  --from-literal=MEDIA_EVENT_SECRET="$(openssl rand -base64 32)" \
  --from-literal=POSTGRES_PASSWORD="$(openssl rand -base64 24)" \
  --from-literal=MINIO_SECRET_KEY="$(openssl rand -base64 24)"
```

`secrets.example.yaml` yalnızca şablondur — **asla gerçek değerle commit'leme**.

## Ölçekleme notları
- **api**: stateless → `replicas` serbestçe artırılır (rate-limit Redis-backed, ortak sayaç).
- **gateway**: şu an tek-node PubSub. Çok-replica için **libcluster + distributed Presence**
  gerekir (bkz. ROADMAP FAZ D). O yapılana kadar `replicas: 1` bırak.
- **voice**: mediasoup RTC portları **hostPort** ile açılır; çok-makine için router cascade
  gerekir (bkz. ROADMAP FAZ C). O yapılana kadar `replicas: 1`.
- **web**: statik nginx → serbestçe ölçeklenir.
