#!/usr/bin/env bash
# Concord — sıfırdan VM kurulumu (Oracle Ubuntu 22.04 ARM). Tek komutla firewall +
# Docker + kod + deploy. SSH üzerinden yerelden çalıştırılır:
#
#   ssh ubuntu@<VM_IP> 'SMTP_HOST=.. SMTP_USER=.. SMTP_PASS=.. bash -s' < vm-bootstrap.sh
#
# DOMAIN verilmezse public IP'den otomatik sslip.io adı türetilir (concord.<ip>.sslip.io)
# → Caddy otomatik Let's Encrypt HTTPS alır, alan adı satın almaya gerek yok.
# SMTP_* verilmezse site açılır ama kayıt/şifre-sıfırlama maili gönderilemez (sonra eklenir).
# Idempotent: tekrar çalıştırılabilir.
set -euo pipefail
REPO="${REPO:-https://github.com/slymnysr/concord.git}"
GIT_REF="${GIT_REF:-feat/mobile-parity}"

echo "==> 1/4 Firewall (iptables): 80/443 TCP + 40000-40040 UDP/TCP"
sudo iptables -C INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT 2>/dev/null || \
  sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo iptables -C INPUT -p udp --dport 40000:40040 -j ACCEPT 2>/dev/null || \
  sudo iptables -I INPUT -p udp --dport 40000:40040 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 40000:40040 -j ACCEPT 2>/dev/null || \
  sudo iptables -I INPUT -p tcp --dport 40000:40040 -j ACCEPT
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq netfilter-persistent iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save >/dev/null 2>&1 || true

echo "==> 1.5/4 Swap (düşük RAM'de OOM koruması)"
MEM_GB=$(free -g | awk '/^Mem:/{print $2}')
if [ "${MEM_GB:-99}" -lt 16 ] && [ ! -f /swapfile ]; then
  sudo fallocate -l 8G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=8192
  sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo "   swap açıldı (RAM=${MEM_GB}GB)"
fi

echo "==> 2/4 Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

echo "==> 3/4 Kod (dal: ${GIT_REF})"
if [ ! -d concord ]; then
  git clone -b "$GIT_REF" "$REPO" concord
else
  git -C concord fetch --depth 1 origin "$GIT_REF" && git -C concord checkout -f "$GIT_REF" && git -C concord reset --hard "origin/$GIT_REF"
fi
cd concord/deploy

# DOMAIN yoksa sslip.io'dan türet (public IP → concord.<ip-tireli>.sslip.io)
if [ -z "${DOMAIN:-}" ]; then
  IP="$(curl -s https://api.ipify.org || curl -s https://ifconfig.me || true)"
  [ -n "$IP" ] && DOMAIN="concord.${IP//./-}.sslip.io"
fi
echo "==> DOMAIN=${DOMAIN:-<yok>}"

echo "==> 4/4 Deploy (docker root grubu için sudo -E)"
sudo -E DOMAIN="${DOMAIN:-}" \
  SMTP_HOST="${SMTP_HOST:-}" SMTP_PORT="${SMTP_PORT:-587}" \
  SMTP_USER="${SMTP_USER:-}" SMTP_PASS="${SMTP_PASS:-}" \
  MAIL_FROM="${MAIL_FROM:-}" \
  bash ./deploy.sh

echo ""
echo "======================================================"
echo " BİTTİ → https://${DOMAIN:-<domain>}"
echo "======================================================"
