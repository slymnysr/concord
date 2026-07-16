# Güvenlik başlıkları — HER add_header tanımlayan location'da include EDİLMELİ.
# nginx kuralı: bir location kendi add_header'ını tanımlarsa ÜST seviyedeki TÜM
# add_header'lar düşer (kalıtım yok). Bu yüzden tek yerde tanımlayıp include ediyoruz.
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
