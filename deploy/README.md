# Concord — Tek Sunucu Üretim Dağıtımı (Oracle Cloud ARM)

Bu dizin, Concord'un tamamını (14 servis) **tek bir sunucuda** ayağa kaldıran turn-key
paketidir. Oracle Cloud'un **Always-Free ARM** VM'i için hazırlandı (4 OCPU / 24 GB — tüm
stack'i rahat taşır), ama Docker çalışan her Linux sunucuda çalışır.

Tek HTTP giriş noktası **Caddy** (otomatik HTTPS) → **web** (nginx: statik SPA + `/api`
`/socket` `/voice-*` proxy) → **api / gateway / voice** → **postgres / redis / meilisearch /
minio / clamav**. Ses medyası mediasoup RTC portlarına doğrudan gelir.

Yerel smoke-test'te tüm zincir doğrulandı (api↔postgres/redis/minio/meili bağlandı,
gateway ayakta, web→api proxy 200/400/401 döndü).

---

## Gereksinimler

- Oracle Cloud hesabı (Always-Free yeter) veya Docker çalışan bir Linux VM
- Bir **alan adı** (HTTPS için şart — Caddy Let's Encrypt sertifikasını buna alır)
- E-posta için bir **TLS SMTP sağlayıcısı** (kayıt/şifre-sıfırlama mailleri; aşağıda)

---

## 1) Oracle VM'i oluştur

Oracle Cloud Console → **Compute → Instances → Create Instance**:

- **Image:** Canonical Ubuntu 22.04
- **Shape:** `VM.Standard.A1.Flex` (Ampere ARM) — **4 OCPU, 24 GB RAM** (Always-Free sınırı)
- **SSH key:** kendi public key'ini ekle (bağlanmak için)
- Oluştur, **public IP**'yi not al.

## 2) Ağ portlarını aç (İKİ katman)

**a) Oracle Security List** (VCN → Subnet → Security List → Add Ingress Rules), kaynak `0.0.0.0/0`:

| Port          | Protokol | Ne için                    |
| ------------- | -------- | -------------------------- |
| 80, 443       | TCP      | HTTP/HTTPS (Caddy)         |
| 40000–40040   | UDP      | Ses/görüntü medyası (RTC)  |
| 40000–40040   | TCP      | RTC yedeği (kısıtlı ağlar) |

**b) VM içi firewall** — Ubuntu imajında iptables varsayılan kapalıdır, aç:

```bash
sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo iptables -I INPUT -p udp --dport 40000:40040 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 40000:40040 -j ACCEPT
sudo netfilter-persistent save   # kalıcı yap
```

## 3) Docker kur

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker   # sudo'suz docker
```

## 4) DNS: alan adını VM'e yönlendir

Alan adı sağlayıcında bir **A kaydı**: `concord.ornek.com → <VM_PUBLIC_IP>`.
Yayılmasını bekle (`dig +short concord.ornek.com` IP'yi göstermeli).

## 5) SMTP sağlayıcısı al (e-posta için)

api üretimde **TLS'li SMTP zorunlu tutar** (`MustSecure` — şifre-sıfırlama linki düz metin
gitmesin diye). Ücretsiz seçenekler:

- **Brevo** (brevo.com) — 300 mail/gün ücretsiz, alan adı şart değil. SMTP: `smtp-relay.brevo.com:587`.
- **Resend** (resend.com) — 3000 mail/ay, alan adı doğrulaması ister (alan adın zaten var).

Sağlayıcıdan **SMTP host / kullanıcı / şifre** al. Boş bırakırsan site açılır ama kayıt olunamaz.

## 6) Dağıt

```bash
# En güncel kod feat/mobile-parity dalında (main, PR #1 cihaz testi bitene kadar geride).
git clone -b feat/mobile-parity https://github.com/slymnysr/concord.git
cd concord/deploy

DOMAIN=concord.ornek.com \
SMTP_HOST=smtp-relay.brevo.com SMTP_USER=<brevo_kullanici> SMTP_PASS=<brevo_sifre> \
MAIL_FROM=no-reply@concord.ornek.com \
./deploy.sh
```

`deploy.sh` ne yapar: public IP'yi bulur → tüm sırları (`genkeys`) üretip `.env` yazar →
imajları derler (ARM'de ilk sefer ~10-15 dk) → altyapıyı kaldırır → 59 migration'ı boş DB'ye
uygular → MinIO bucket'ını açar → uygulama + Caddy'yi başlatır. **Yeniden çalıştırılabilir**
(mevcut `.env` ve dolu DB korunur).

## 7) Doğrula

```bash
docker compose -f docker-compose.prod.yml ps      # hepsi Up / healthy olmalı
```

Tarayıcı: `https://concord.ornek.com` — kayıt ol, giriş yap, kanal aç, sesli kanala gir.

---

## Notlar

- **`.env` sırları taşır, git'e KOYMA** (zaten `.gitignore`'da). Yedeğini güvenli yerde tut.
- **Ses için `MS_ANNOUNCED_IP`** = VM public IP. `deploy.sh` otomatik bulur; NAT arkasındaysa
  elle ver: `MS_ANNOUNCED_IP=<ip> ./deploy.sh`.
- **Güncelleme:** `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
- **Loglar:** `docker compose -f docker-compose.prod.yml logs -f api gateway voice web`.
- **TURN yok:** mediasoup bir SFU'dur; istemciler doğrudan public IP'ye bağlanır. Yalnızca çok
  kısıtlı kurumsal ağlar için sonradan coturn eklenebilir.
