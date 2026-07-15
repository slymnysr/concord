# Concord Mobil (Expo / React Native)

v1 kapsamı: giriş/kayıt, sunucu rayı + kanal listesi, **gerçek zamanlı sohbet** (Phoenix WS),
DM listesi (4 sn'de bir tazeleme), katılım sistem mesajları, görsel ekler, yazıyor sinyali gönderimi.
Sonraki turlar: push bildirimleri (FCM), sesli sohbet (react-native-webrtc + mediasoup), tepkiler/yanıtlar.

## Telefonda çalıştırma (Expo Go)

1. Telefona **Expo Go** uygulamasını kur (Play Store / App Store).
2. WSL'de Metro'yu tünelle başlat (WSL NAT'ı yüzünden `--tunnel` şart):

```bash
cd apps/mobile
pnpm start --tunnel
```

3. Çıkan QR'ı Expo Go ile okut.

### Telefonun API'ye erişimi (tek seferlik Windows ayarı)

Telefon, bilgisayarındaki Concord servislerine **Windows'un LAN IP'si** üzerinden bağlanır.
WSL portlarını LAN'a açmak için **yönetici PowerShell**'de:

```powershell
$wslIp = (wsl hostname -I).Trim().Split(" ")[0]
netsh interface portproxy add v4tov4 listenport=8080 listenaddress=0.0.0.0 connectport=8080 connectaddress=$wslIp
netsh interface portproxy add v4tov4 listenport=4000 listenaddress=0.0.0.0 connectport=4000 connectaddress=$wslIp
New-NetFirewallRule -DisplayName "Concord Dev" -Direction Inbound -LocalPort 8080,4000 -Protocol TCP -Action Allow
```

Windows LAN IP'ni öğren (`ipconfig` → Wi-Fi IPv4, örn `192.168.1.34`), sonra telefondaki
giriş ekranında **Sunucu adresi** alanına yaz: `http://192.168.1.34`

> Not: WSL IP'si yeniden başlatmada değişebilir; bağlantı koparsa portproxy komutlarını tekrarla.

## Derleme doğrulaması (cihazsız)

```bash
npx tsc --noEmit      # tip kontrolü
npx expo export       # production bundle (Metro çözümleme testi)
```

## APK üretimi (ileride)

EAS Build ile: `npx eas build -p android --profile preview` (Expo hesabı gerektirir).
