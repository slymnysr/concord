# Concord Mobil — Özellik Listesi & Test Kılavuzu

Discord paritesi + paritenin ötesinde yenilikler. Her şey `tsc` temiz + `expo export` ile derleniyor;
**gerçek cihaz/backend testi yapılmadı** — bu liste test kontrol listesidir.

## Kimlik & Hesap

- [ ] Sunucu adresli giriş / kayıt
- [ ] Şifremi unuttum + kod ile sıfırlama
- [ ] 2FA'lı giriş (totp kodu)
- [ ] Profil: avatar/banner **fotoğraf yükleme**, görünen ad, bio, zamirler, avatar rengi
- [ ] Durum (çevrimiçi/boşta/rahatsız/görünmez) + özel durum
- [ ] Şifre/e-posta değiştir, e-posta doğrula, 2FA aç/kapat, hesap sil
- [ ] Oturumlar, gizlilik (DM), anahtar kelimeler, bağlantılar (GitHub), **bildirim aç/kapa**
- [ ] Bot geliştirici paneli (uygulama oluştur/token/sil)

## Sunucu & Kanal

- [ ] Sunucu rayı + **klasörler** (uzun-bas: klasöre taşı), kanal/DM listesi, okunmamış göstergeleri
- [ ] Sunucu oluştur / davetle katıl / keşfet
- [ ] Sunucu ayarları: ikon yükleme, ad/açıklama, roller, davetler, yasaklar, AutoMod, denetim kaydı, sunucuya özel profil
- [ ] İçerik: özel emoji, çıkartma, **soundboard (çal)**, slash komut, etkinlik, karşılama, istatistik
- [ ] Üyeler: rol yönet, takma ad, zaman aşımı, at, yasakla (+ sürükle-yenile)
- [ ] Tepki rolleri, kanal takipleri, bot ekleme
- [ ] Kanal oluştur/yeniden adlandır/sil; kanal ayarları (konu, yavaş mod, NSFW, izinler, webhook, zamanlanmış)
- [ ] Forum/thread görünümü, sohbetten thread başlat

## Sohbet

- [ ] Gönder, yanıtla, tepki (+ tam emoji seçici + **son kullanılanlar**), düzenle, sabitle, kaydet, hatırlat, sil
- [ ] **İlet (forward)**, **çevir (→TR)**, düzenleme geçmişi, tepki verenler
- [ ] Dosya/görsel/**GIF**/**sesli mesaj** gönder; embed/link önizleme; anket oluştur/oy ver
- [ ] **Zengin markdown**: kod bloğu, alıntı, başlık, madde, **spoiler ||...||**, `<t:unix>` zaman
- [ ] Bahsetme (@kişi, #kanal), slash komut otomatik tamamlama
- [ ] **Yeni mesajlar ayracı**, yanıta dokun→zıpla, **en alta in**, **taslak kalıcılığı**
- [ ] Yazıyor göstergesi, çevrimiçi durum noktaları, profil kartı (DM/arkadaş/engelle/şikayet/not)
- [ ] Kanal-içi arama + **gelişmiş filtreler** (sabit/görsel/link), arama→mesaja zıpla
- [ ] Kanal bildirim seviyesi (tümü/bahsetmeler/sessiz)

## DM & Arkadaşlar

- [ ] Arkadaş ekle/kabul/sil/engelle (+ sürükle-yenile), yeni DM, **grup DM** (kişi ekle/çıkar)

## Bildirim & Sistem

- [ ] **Anlık bildirim (Firebase'siz)** + uygulama-içi toast (DM/bahsetme)
- [ ] **Bağlantı/yeniden-bağlanma çubuğu** + yeniden bağlanınca tazeleme
- [ ] **Hızlı geçiş (quick switcher)** — tüm kanal/DM'lerde anında zıplama
- [ ] **Dokunsal geri bildirim (haptics)**
- [ ] Bildirim merkezi, kaydedilenler, hatırlatıcılar, klasörler

## Sesli / Görüntülü (yalnız EAS dev client / native build'de)

- [ ] Sesli kanala katıl, mic/sağırlaştır, ses çubuğu
- [ ] **Görüntülü görüşme** (kamera) + video ızgarası (VoiceRoom)
- [ ] **Ekran paylaşımı** (Android)
- [ ] **Sahne (stage)**: el kaldır, konuşmacı yap

## Çalıştırma

Hızlı (ses hariç): `cd apps/mobile && pnpm start --tunnel` + Expo Go.
Ses dahil: `npx eas-cli login && eas init && eas build -p android --profile development` → APK kur → `pnpm start --dev-client --tunnel`. Detay: `BUILD.md`.
