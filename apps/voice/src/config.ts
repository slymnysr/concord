// Concord voice config — mediasoup ayarları + JWT secret + portlar
import type { types as msTypes } from 'mediasoup';

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

// Depo kökündeki .env'i yükle — TEK dosya tüm yığını beslesin diye (apps/api'deki
// config.loadDotEnv ve gateway'deki runtime.exs karşılığı).
//
// NEDEN GEREKLİ: voice `pnpm dev` ile apps/voice'tan çalışır; dotenv yalnızca ÇALIŞMA
// DİZİNİNE bakar, .env ise depo kökündedir. Bu olmadan .env'de JWT_SECRET değiştirmek
// API'yi günceller ama voice'u GÜNCELLEMEZ → voice aşağıdaki dev-default'a düşer,
// API'nin imzaladığı token'ları doğrulayamaz ve HİÇ KİMSE sese katılamaz.
//
// BURADA (config.ts'te) yükleniyor, index.ts'te değil: ES import'ları hoist edilir, yani
// index.ts'in ilk satırı çalışmadan ÖNCE bu modül değerlendirilir ve process.env okunur.
// index.ts'e koymak GEÇ kalırdı.
//
// override YOK (dotenv varsayılanı): zaten set edilmiş değişkenler EZİLMEZ — k8s/CI env'i
// .env'den önce gelir.
function loadRootEnv(): void {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, '.env');
    if (fs.existsSync(p)) {
      // quiet: dotenv aksi hâlde her açılışta reklam/ipucu satırı basar — log gürültüsü
      dotenv.config({ path: p, quiet: true });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return; // dosya sisteminin kökü
    dir = parent;
  }
}
loadRootEnv();

const httpPort = parseInt(process.env.VOICE_HTTP_PORT ?? '4444', 10);

export const config = {
  port: parseInt(process.env.VOICE_PORT ?? '4443', 10),
  httpPort,

  // Çok-makine cascade (FAZ C). Kapalıyken voice tek node çalışır (davranış eskisi gibi).
  cluster: {
    enabled: (process.env.VOICE_CLUSTER_ENABLED ?? 'false') === 'true',
    redisUrl:
      process.env.REDIS_URL ??
      `redis://${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6379'}`,
    // Node kimliği sabit olmalı: yeniden başlayınca aynı kimlikle dönmezse eski kayıt
    // TTL dolana kadar hayalet node olarak kalır. k8s'te pod adı verilir.
    nodeId: process.env.VOICE_NODE_ID ?? os.hostname() ?? randomUUID(),
    // Pipe transport'un DİĞER node'lardan erişilebilir IP'si. 127.0.0.1 yalnızca
    // aynı makinedeki node'lar için doğrudur; çok-makinede gerçek IP şart.
    pipeIp: process.env.VOICE_PIPE_IP ?? '127.0.0.1',
    // Bu node'un iç HTTP adresi — pipe pazarlığı buradan yapılır
    httpUrl: process.env.VOICE_HTTP_URL ?? `http://127.0.0.1:${httpPort}`,
    // İstemcinin bu node'a bağlanacağı WS adresi (SFU seçici bunu döner)
    wsUrl: process.env.VOICE_WS_URL ?? `ws://127.0.0.1:${process.env.VOICE_PORT ?? '4443'}`,
    // Node'lar arası iç çağrıları koruyan secret (pipe pazarlığı dışarı açık olmamalı)
    secret: process.env.VOICE_CLUSTER_SECRET ?? 'dev_voice_cluster_secret',
    // Coğrafi bölge (ör. 'eu-central', 'ap-northeast', 'us-east'). Uygulama GLOBAL:
    // Tokyo'daki kullanıcıyı Frankfurt node'una bağlamak 250ms+ gecikme demek. Cascade
    // (FAZ C) node'lar arasını zaten köprülüyor → istemci KENDİ bölgesindeki node'a bağlanmalı.
    region: process.env.VOICE_REGION ?? 'default',
  },
  // JWT_SECRET — API ve gateway ile AYNI değişken adı. Eskiden CONCORD_JWT_SECRET
  // okunuyordu ama hiçbir yer onu set etmiyordu → voice üretimde dev secret'ına düşüyor,
  // API'nin imzaladığı token'ları doğrulayamıyordu (ses bağlantısı 403). Bkz. gateway/token.ex.
  jwtSecret: process.env.JWT_SECRET ?? 'dev_jwt_secret_change_in_prod_at_least_32_chars',

  // mediasoup worker
  worker: {
    rtcMinPort: parseInt(process.env.MS_RTC_MIN_PORT ?? '40000', 10),
    rtcMaxPort: parseInt(process.env.MS_RTC_MAX_PORT ?? '40100', 10),
    logLevel: 'warn' as msTypes.WorkerLogLevel,
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'] as msTypes.WorkerLogTag[],
  },

  // Router (codec) yapılandırması
  router: {
    // preferredPayloadType'ları mediasoup otomatik atasın — manuel verince
    // RTX (retransmission) codec'leri ile çakışıp "duplicated codec.preferredPayloadType" hatası veriyor
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      // Modern codec'ler önde: AV1 (aynı bantta en iyi görüntü) → VP9 (SVC) → VP8/H264 (uyumluluk)
      {
        kind: 'video',
        mimeType: 'video/AV1',
        clockRate: 90000,
        parameters: {},
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: { 'profile-id': 2, 'x-google-start-bitrate': 1000 },
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: { 'x-google-start-bitrate': 1000 },
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      },
      // Tip notu: RtpCodecCapability.preferredPayloadType tipte zorunlu görünse de
      // RouterOptions.mediaCodecs içinde resmî olarak opsiyoneldir (mediasoup d.ts yorumu) → cast.
    ] as msTypes.RtpCodecCapability[],
  },

  // WebRtcTransport listenIps
  // Production'da public IP'yi announcedIp olarak ver
  webRtcTransport: {
    listenIps: [
      {
        ip: process.env.MS_LISTEN_IP ?? '0.0.0.0',
        announcedIp: process.env.MS_ANNOUNCED_IP ?? '127.0.0.1',
      },
    ],
    initialAvailableOutgoingBitrate: 1_000_000,
    minimumAvailableOutgoingBitrate: 600_000,
    maxIncomingBitrate: 1_500_000,
  },
};
