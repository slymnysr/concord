# Güvenlik başlıkları — HER add_header tanımlayan location'da include EDİLMELİ.
# nginx kuralı: bir location kendi add_header'ını tanımlarsa ÜST seviyedeki TÜM
# add_header'lar düşer (kalıtım yok). Bu yüzden tek yerde tanımlayıp include ediyoruz.
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# CSP — Vite build inline <script> ÜRETMEZ, o yüzden script-src 'self' (XSS'e karşı sağlam).
# style-src 'unsafe-inline': React/kütüphane runtime <style> enjeksiyonu için (SPA'da nonce
# yönetimi pratik değil). connect-src https:/wss: → API + gateway WebSocket + voice. img/media
# blob:/data: → avatar/emoji/upload önizleme ve ses-görüntü akışları. frame-ancestors 'none' =
# clickjacking savunması (X-Frame-Options'ın CSP karşılığı). Gerçek tarayıcıda SPA'yı kırmadığı
# + ihlal üretmediği test edildi: e2e/tests/csp.spec.ts.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; media-src 'self' blob: https:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
# HSTS — tarayıcıyı yalnızca HTTPS'e zorlar (SSL-stripping savunması). Prod HTTPS'te anlamlı.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
