#!/bin/sh
# nginx DNS resolver'ını /etc/resolv.conf'tan üret (Docker: 127.0.0.11, k8s: kube-dns).
#
# NEDEN: default.conf'ta proxy_pass DEĞİŞKENLE kullanılıyor (set $up_api http://api:8080)
# ki nginx upstream'i AÇILIŞTA çözmeye çalışıp "host not found in upstream" ile ölmesin.
# Değişkenli proxy_pass ise çalışma anında bir resolver İSTER. Resolver'ı sabit yazmak
# (127.0.0.11) k8s'te kırılır → burada ortamdan türetiyoruz.
#
# conf.d/*.conf http{} içine include edilir; bu dosya alfabetik olarak default.conf'tan
# önce gelir ve resolver http seviyesinde tüm server blokları için geçerli olur.
set -eu

resolvers=$(awk '$1 == "nameserver" && $2 !~ /:/ { printf "%s ", $2 }' /etc/resolv.conf)

if [ -n "$resolvers" ]; then
  {
    echo "# 19-resolver.sh tarafından üretildi — elle düzenleme"
    echo "resolver ${resolvers}valid=10s ipv6=off;"
    echo "resolver_timeout 5s;"
  } > /etc/nginx/conf.d/00-resolver.conf
  echo "19-resolver.sh: resolver => ${resolvers}"
else
  echo "19-resolver.sh: HATA — /etc/resolv.conf'ta IPv4 nameserver yok; proxy çözümlemesi çalışmaz" >&2
  exit 1
fi
