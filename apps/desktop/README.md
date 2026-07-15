# Concord Masaüstü (Tauri 2)

Web istemcisini (apps/web) native pencerede sarar. Windows'ta WebView2, Linux'ta webkit2gtk kullanır — Chromium gömülmez, kurulum ~10 MB.

## Geliştirme

```bash
# Önkoşul: Rust (rustup) + Linux'ta libwebkit2gtk-4.1-dev vb. (bkz. kök README / CI)
# Vite (:3000) çalışıyor olmalı, sonra:
cd apps/desktop
pnpm tauri dev
```

## Paketleme

```bash
pnpm bundle           # bulunduğun platformun paketleri (Linux: deb+AppImage, Windows: msi+nsis)
```

Windows `.exe`/`.msi` için en kolay yol: push sonrası **GitHub Actions → Desktop Build** (workflow_dispatch) — `.github/workflows/desktop.yml`.

## Masaüstü özellikleri

- **Sistem tepsisi**: sol tık pencereyi açar; menü: Concord'u Göster · Açılışta Başlat (işaretlenebilir) · Çıkış
- **Kapat = tepsiye küçült** (Discord davranışı); gerçek çıkış tepsi menüsünden
- **Pencere konumu/boyutu hatırlanır** (tauri-plugin-window-state)
- **Açılışta başlatma** (tauri-plugin-autostart; tepsi menüsünden aç/kapa)
- **Harici linkler** sistem tarayıcısında açılır (plugin-opener + web köprüsü)
- **Global susturma kısayolu**: `Ctrl+Shift+M` — pencere odakta olmasa da mikrofonu aç/kapa
- **Oyun algılama → otomatik "Oynuyor"**: bilinen oyun süreçleri 15 sn'de bir taranır (`src-tauri/src/main.rs` → `GAMES` listesi); elle ayarlanmış aktivite her zaman önceliklidir

Web tarafı köprüsü: `apps/web/src/desktop.ts` (tarayıcıda no-op; Tauri API'leri lazy import).

## Sunucu seçimi (prod paket)

Paketli uygulamada frontend `tauri://localhost`tan servis edilir; bağlanılacak Concord sunucusu
giriş ekranındaki **"⚙ Sunucu"** düğmesiyle ayarlanır (localStorage `concord_server_base`,
bkz. `apps/web/src/serverConfig.ts`).

## Bilinen notlar

- **Linux'ta sesli/görüntülü sohbet çalışmaz** (Ubuntu dahil çoğu dağıtım): sistem `libwebkit2gtk`
  paketi WebRTC olmadan derlenir (`ENABLE_WEB_RTC=OFF`) — `RTCPeerConnection` motorda yoktur,
  runtime ayarıyla açılamaz (PyGObject ile doğrulandı: enable-webrtc açıkken bile `undefined`).
  Metin/medya tarafı tam çalışır. **Windows'ta sorun yok** — WebView2 Chromium tabanlıdır,
  ses/video tam desteklidir. Linux'ta ses için tarayıcı kullanın.
- WSLg'de tepsi ikonu Windows bildirim alanında görünmeyebilir (WSLg sınırı); gerçek Windows paketinde sorun yok.
- Oto-güncelleme (tauri-plugin-updater) bilinçli olarak sonraya bırakıldı: imzalama anahtarı + release endpoint'i gerektirir, CI release akışıyla birlikte kurulacak.
- Gerçek PTT (basılı tutma) global kısayolu plugin keyup vermediği için yapılmadı; toggle-mute var.
