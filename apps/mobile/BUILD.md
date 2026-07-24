# Concord Mobil — Çalıştırma & Build

## 1) Hızlı test (Expo Go) — ses HARİÇ her şey

Sesli sohbet dışındaki tüm özellikler Expo Go'da çalışır.

```bash
cd apps/mobile
pnpm start --tunnel
```

Telefonda **Expo Go** uygulamasıyla QR'ı okut. Giriş ekranında **Sunucu adresi** olarak
bilgisayarının LAN IP'sini gir (örn. `http://192.168.1.34`). Backend'in (API :8080, gateway :4000)
açık olması gerekir.

> Not: `react-native-webrtc` native modül olduğundan **sesli sohbet Expo Go'da çalışmaz**.
> Ses için aşağıdaki dev client build şart.

## 2) Sesli sohbet için — EAS Dev Client build (tek seferlik)

Expo hesabı gerekir (ücretsiz). Komutlar:

```bash
cd apps/mobile

# 1. Expo CLI ile giriş (tarayıcı/komut satırı)
npx eas-cli login

# 2. Projeyi EAS'e bağla (app.json'a projectId yazar)
npx eas-cli init

# 3. Android dev client APK derle (Expo bulutunda; ~10-15 dk)
npx eas-cli build --profile development --platform android
```

Build bitince çıkan linkten **APK'yı telefona kur**. Sonra:

```bash
pnpm start --dev-client --tunnel
```

ile dev sunucusunu başlat; kurduğun **Concord dev client** uygulamasıyla bağlan.
Artık sesli kanala (🔊) dokununca mikrofon izni istenir ve sesli sohbet çalışır.

### Yerel build (Expo bulutu yerine kendi makinende)

Android Studio + JDK kuruluysa:

```bash
npx expo prebuild --platform android
pnpm exec expo run:android
```

## 3) Yapılandırma notları

- `app.json`: paket kimliği `com.concord.app`, mikrofon/kamera izinleri ve
  `@config-plugins/react-native-webrtc` plugin'i tanımlı.
- `eas.json`: `development` (dev client, APK), `preview` (APK), `production` profilleri.
- Sunucu adresi uygulamada login ekranından girilir; portsuz host girilirse API `:8080`,
  gateway `:4000`, ses `:4443` portları otomatik türetilir (`src/config.ts`).

## Hâlâ bekleyen (bu repoda kod tarafı dışında)

- **Push bildirimi**: Firebase projesi + backend'de FCM gönderim yolu gerekir.
- **Görüntülü/ekran paylaşımı**: mobilde şimdilik yalnız ses; video katmanı sonraki tur.
