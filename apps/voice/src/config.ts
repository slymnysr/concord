// Concord voice config — mediasoup ayarları + JWT secret + portlar
import type { types as msTypes } from 'mediasoup';

export const config = {
  port: parseInt(process.env.VOICE_PORT ?? '4443', 10),
  jwtSecret: process.env.CONCORD_JWT_SECRET ?? 'dev_jwt_secret_change_in_prod_at_least_32_chars',

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
