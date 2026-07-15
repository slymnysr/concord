// Concord voice istemcisi — mediasoup-client + WebSocket signaling
// Audio + video (kamera) + ekran paylaşımı destekler.
import { Device, types as msTypes } from 'mediasoup-client';
import { tokenStore } from './api';
import { wsUrl } from './serverConfig';
import { isBlurEnabled, createBlurredTrack, type BlurredTrack } from './videoEffects';
import { isMusicMode, isRnnoiseEnabled, createNoiseSuppressedTrack, type SuppressedTrack } from './audioEffects';

type Handler = (m: any) => void;
type RequestPending = { resolve: (v: any) => void; reject: (e: any) => void };

export interface RemoteStreamInfo {
  userId: string;
  producerId: string;
  kind: 'audio' | 'video';
  source: 'mic' | 'camera' | 'screen' | 'screen-audio';
  stream: MediaStream;
}

// Yayın kalitesi tercihi (kamera + ekran) — VoiceTab'dan ayarlanır
export function streamQuality(): { width: number; height: number; fps: number; camBitrate: number; screenBitrate: number } {
  const res = parseInt(localStorage.getItem('concord_stream_res') ?? '720', 10);
  const fps = parseInt(localStorage.getItem('concord_stream_fps') ?? '30', 10);
  const table: Record<number, { w: number; h: number; cam: number; scr: number }> = {
    480: { w: 854, h: 480, cam: 1_000_000, scr: 1_500_000 },
    720: { w: 1280, h: 720, cam: 2_500_000, scr: 3_000_000 },
    1080: { w: 1920, h: 1080, cam: 4_500_000, scr: 6_000_000 },
  };
  const q = table[res] ?? table[720];
  return { width: q.w, height: q.h, fps: [15, 30, 60].includes(fps) ? fps : 30, camBitrate: q.cam, screenBitrate: q.scr };
}

class VoiceClient {
  private ws: WebSocket | null = null;
  private device: Device | null = null;
  private sendTransport: msTypes.Transport | null = null;
  private recvTransport: msTypes.Transport | null = null;
  private requestId = 0;
  private pending = new Map<string, RequestPending>();
  private eventHandlers: Record<string, Handler[]> = {};

  // Local stream'ler
  private micStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private cameraEffect: BlurredTrack | null = null;
  private micEffect: SuppressedTrack | null = null;
  private channelAudioBitrate = 64000;
  private screenAudioProducer: msTypes.Producer | null = null;
  // Kullanıcı bazlı bekleyen ekran sesi (ekran izlenmeye başlayınca consume edilir)
  private pendingScreenAudio = new Map<string, string>();
  // Son yerel ses aktivitesi (AFK kanalına taşıma için; App.tsx periyodik kontrol eder)
  lastLocalVoiceActivity = Date.now();
  private screenStream: MediaStream | null = null;

  // Local producers
  private audioProducer: msTypes.Producer | null = null;
  private cameraProducer: msTypes.Producer | null = null;
  private screenProducer: msTypes.Producer | null = null;

  channelId: string | null = null;

  // Uzak medyalar
  private remotes = new Map<string, RemoteStreamInfo>(); // producerId -> info
  private remoteAudioEls = new Map<string, HTMLAudioElement>();
  private producerSource = new Map<string, 'mic' | 'camera' | 'screen' | 'screen-audio'>();
  private consumers = new Map<string, msTypes.Consumer>(); // producerId -> consumer (kapatmak için)
  // Discord davranışı: video/ekran yayınları "İzle" denmeden consume edilmez (otomatik gösterilmez)
  private pendingVideo = new Map<string, { userId: string; source: 'camera' | 'screen' }>();
  // Sunucu (mod) susturma/sağırlaştırma durumu — ikon gösterimi için
  private serverVoice = new Map<string, { mute: boolean; deafen: boolean }>();

  getServerVoice(userId: string): { mute: boolean; deafen: boolean } {
    return this.serverVoice.get(userId) ?? { mute: false, deafen: false };
  }

  // === SAHNE (Stage) — konuşmacı / dinleyici / el kaldırma ===
  private stageSpeakers = new Set<string>(); // konuşmacı userId'leri
  private stageHands = new Set<string>(); // el kaldıran (konuşma isteyen) userId'leri

  getStageSpeakers(): Set<string> { return new Set(this.stageSpeakers); }
  getStageHands(): Set<string> { return new Set(this.stageHands); }
  isStageSpeaker(userId: string): boolean { return this.stageSpeakers.has(userId); }

  // Dinleyici → konuşma iste (el kaldır/indir)
  requestToSpeak(raise: boolean) {
    this.ws?.send(JSON.stringify({ type: 'stageHand', payload: { raised: raise } }));
  }
  // Moderatör → birini konuşmacı yap / dinleyiciye al
  setStageSpeaker(userId: string, isSpeaker: boolean) {
    this.ws?.send(JSON.stringify({ type: 'stageSpeaker', payload: { userId, isSpeaker } }));
  }

  // Henüz izlenmeyen (consume edilmemiş) yayınlar — "İzle" kartları için
  availableStreams(): { producerId: string; userId: string; source: 'camera' | 'screen' }[] {
    return Array.from(this.pendingVideo.entries()).map(([producerId, v]) => ({ producerId, ...v }));
  }

  // Bir yayını izlemeye başla (talep üzerine consume)
  async watchStream(producerId: string) {
    const p = this.pendingVideo.get(producerId);
    if (!p) return;
    this.pendingVideo.delete(producerId);
    try {
      await this.consume(producerId, p.userId, p.source);
    } catch (e) {
      // Başarısızsa geri ekle ki tekrar denenebilsin
      this.pendingVideo.set(producerId, p);
      throw e;
    }
    // Ekran izlenmeye başladıysa bekleyen ekran sesini de aç
    if (p.source === 'screen') {
      const audioPid = this.pendingScreenAudio.get(p.userId);
      if (audioPid) {
        this.pendingScreenAudio.delete(p.userId);
        this.consume(audioPid, p.userId, 'screen-audio').catch(() => {
          this.pendingScreenAudio.set(p.userId, audioPid);
        });
      }
    }
    this.emit('streams:changed', {});
  }

  // İzlemeyi bırak — consumer'ı kapat, tekrar "bekleyen" yap
  unwatchStream(producerId: string) {
    const info = this.remotes.get(producerId);
    const consumer = this.consumers.get(producerId);
    try { consumer?.close(); } catch { /* yoksay */ }
    this.consumers.delete(producerId);
    if (info && info.kind === 'video' && (info.source === 'camera' || info.source === 'screen')) {
      this.pendingVideo.set(producerId, { userId: info.userId, source: info.source });
    }
    // Ekran izlemesi bırakıldıysa ekran sesini de kapat (tekrar izlenirse geri gelir)
    if (info?.source === 'screen') {
      for (const [pid, r] of this.remotes.entries()) {
        if (r.userId === info.userId && r.source === 'screen-audio') {
          this.removeRemote(pid);
          this.pendingScreenAudio.set(info.userId, pid);
          break;
        }
      }
    }
    this.remotes.delete(producerId);
    this.emit('remotes:changed', {});
    this.emit('streams:changed', {});
  }

  // Discord davranışı: mic + KAMERA otomatik consume edilir (görüntü hemen gelir);
  // sadece EKRAN PAYLAŞIMI "İzle" denmeden gösterilmez (gate'lenir).
  private handleIncomingProducer(producerId: string, userId: string, source: 'mic' | 'camera' | 'screen' | 'screen-audio') {
    if (source === 'screen') {
      this.pendingVideo.set(producerId, { userId, source });
      this.emit('streams:changed', {});
      return;
    }
    if (source === 'screen-audio') {
      // Ekran sesi izleme kapısının arkasında bekler; kullanıcı ekranı izlerse duyulur.
      // İzleyici ekranı zaten izliyorsa (ses sonradan geldi) hemen consume et.
      const watchingScreen = Array.from(this.remotes.values()).some(
        (r) => r.userId === userId && r.source === 'screen',
      );
      if (watchingScreen) {
        this.consume(producerId, userId, source).catch((e) => console.warn('consume failed', e));
      } else {
        this.pendingScreenAudio.set(userId, producerId);
      }
      return;
    }
    this.consume(producerId, userId, source).catch((e) => console.warn('consume failed', e));
  }

  // Bir uzak akışı kaldır (consumer kapandığında / producer kapandığında)
  private removeRemote(producerId: string) {
    // Yayıncı ekranı tamamen kapattıysa bekleyen ekran-sesi kaydını da düşür
    for (const [uid, pid] of this.pendingScreenAudio.entries()) {
      if (pid === producerId) this.pendingScreenAudio.delete(uid);
    }
    const el = this.remoteAudioEls.get(producerId);
    el?.pause();
    el?.remove();
    this.remoteAudioEls.delete(producerId);
    const g = this.audioGains.get(producerId);
    if (g) { try { g.disconnect(); } catch { /* yoksay */ } this.audioGains.delete(producerId); }
    try { this.consumers.get(producerId)?.close(); } catch { /* yoksay */ }
    this.consumers.delete(producerId);
    this.remotes.delete(producerId);
    this.pendingVideo.delete(producerId);
    this.emit('remotes:changed', {});
    this.emit('streams:changed', {});
  }

  on(event: string, h: Handler) {
    (this.eventHandlers[event] ??= []).push(h);
  }
  off(event: string, h: Handler) {
    const list = this.eventHandlers[event];
    if (!list) return;
    this.eventHandlers[event] = list.filter((x) => x !== h);
  }
  private emit(event: string, payload: any) {
    for (const h of this.eventHandlers[event] ?? []) h(payload);
  }

  remoteStreams(): RemoteStreamInfo[] {
    return Array.from(this.remotes.values());
  }

  async connect(channelId: string) {
    // Kısıtlı webview'larda anlamlı hata: Linux dağıtım webkit'leri çoğunlukla
    // WebRTC'siz derlenir (motor yok — ayarla açılamaz). Windows WebView2 tam destekler.
    if (typeof RTCPeerConnection === 'undefined') {
      const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      throw new Error(
        isDesktop
          ? 'Linux masaüstü sürümünde sistem webview\'ı WebRTC içermiyor — sesli sohbet için Windows uygulamasını veya tarayıcıyı kullan (http://localhost:3000)'
          : 'Bu tarayıcı WebRTC desteklemiyor — güncel Chrome/Firefox/Edge ile katıl',
      );
    }
    const token = tokenStore.access();
    if (!token) throw new Error('no token');
    if (this.ws) await this.disconnect();
    this.channelId = channelId;
    // Hata halinde zombi stream kalmaması için cleanup garanti
    try {
      await this._doConnect(channelId, token);
    } catch (e) {
      try {
        this.micStream?.getTracks().forEach((t) => t.stop());
        this.cameraStream?.getTracks().forEach((t) => t.stop());
        this.screenStream?.getTracks().forEach((t) => t.stop());
      } catch {}
      this.micStream = null;
      this.cameraStream = null;
      this.screenStream = null;
      this.channelId = null;
      if (this.ws) {
        try {
          this.ws.close();
        } catch {}
        this.ws = null;
      }
      throw e;
    }
  }

  private async _doConnect(channelId: string, token: string) {

    const url = `${wsUrl('/voice-ws/')}?token=${encodeURIComponent(token)}&channel=${channelId}`;
    this.ws = new WebSocket(url);

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error('no ws'));
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });

    this.ws.onmessage = (evt) => this.onMessage(evt.data as string);
    this.ws.onclose = () => this.emit('disconnected', {});

    const caps = await this.request('getRouterRtpCapabilities');
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: caps });

    const joinRes = await this.request('join');
    const { peers, producers: existing } = joinRes;
    this.channelAudioBitrate = Number(joinRes.audioBitrate) || 64000;
    this.emit('joined', { peers });
    // Mevcut producer'lar transportlar hazır olduktan sonra tüketilecek
    if (Array.isArray(existing)) {
      (this as any).__pendingProducers = existing;
    }
    // Sahne durumunu başlat (mevcut konuşmacılar + el kaldıranlar)
    this.stageSpeakers = new Set<string>((joinRes.stageSpeakers ?? []).map(String));
    this.stageHands = new Set<string>((joinRes.stageHands ?? []).map(String));
    this.emit('stage:changed', {});

    await this.createSendTransport();
    await this.createRecvTransport();

    // İlk tüketim için recv transport'un connect'i gereklidir.
    // mediasoup connect olayı ilk consume çağrısında ateşlenir.
    // O yüzden mevcut producer'ları join yanıtından sonra tüketelim
    if (Array.isArray((this as any).__pendingProducers)) {
      for (const p of (this as any).__pendingProducers) {
        const src = (p.appData?.source as 'mic' | 'camera' | 'screen') ?? 'mic';
        // Ekran/kamera otomatik consume edilmez — "İzle" beklenir (Discord davranışı).
        // Ama recvTransport connect'i için en az bir consume gerekir; mic varsa o tetikler.
        this.handleIncomingProducer(p.producerId, p.userId, src);
      }
      (this as any).__pendingProducers = undefined;
    }

    // Mikrofonu otomatik aç (kullanıcının seçtiği input cihazıyla)
    const inputId = localStorage.getItem('concord_input_device');
    const musicMode = isMusicMode();
    // Kullanıcı ayarları (varsayılan açık) — VoiceTab'dan kontrol edilir.
    // Müzik modunda tüm ses işleme kapatılır (enstrüman/müzik sesini bozar) + stereo.
    const audioConstraints: MediaTrackConstraints = musicMode
      ? {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
        }
      : {
          echoCancellation: localStorage.getItem('concord_echo_cancel') !== '0',
          noiseSuppression: localStorage.getItem('concord_noise_suppress') !== '0',
          autoGainControl: localStorage.getItem('concord_auto_gain') !== '0',
        };
    if (inputId && inputId !== 'default') {
      audioConstraints.deviceId = { exact: inputId };
    }
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });
    const audioTrack = this.micStream.getAudioTracks()[0];

    // Gelişmiş gürültü engelleme (RNNoise) — producer'a temizlenmiş track gider,
    // ham track (PTT/mute/konuşma analizi) olduğu gibi kalır. Müzik modunda devre dışı.
    let producerTrack = audioTrack;
    if (!musicMode && isRnnoiseEnabled()) {
      try {
        this.micEffect = await createNoiseSuppressedTrack(audioTrack);
        producerTrack = this.micEffect.track;
      } catch (e) {
        console.warn('RNNoise başlatılamadı, ham mikrofonla devam:', e);
        this.micEffect = null;
      }
    }

    this.audioProducer = await this.sendTransport!.produce({
      track: producerTrack,
      appData: { source: 'mic' },
      // Kanal ayarındaki ses bitrate'i (join yanıtından) — opus encoder hedefi.
      // opusFec: paket kaybında ses kopmasını ciddi azaltır (in-band forward error correction).
      codecOptions: {
        opusMaxAverageBitrate: musicMode
          ? Math.max(this.channelAudioBitrate, 128000)
          : this.channelAudioBitrate,
        opusStereo: musicMode,
        opusDtx: !musicMode,
        opusFec: true,
      },
    });
    this.producerSource.set(this.audioProducer.id, 'mic');

    // AFK takibi: kendi mikrofonumun ses aktivitesini izle
    this.lastLocalVoiceActivity = Date.now();
    this.startSpeakingAnalyzer('__self__', this.micStream);

    // PTT: kullanıcı tuşa basana kadar mikrofonu kapalı tut
    const pttEnabled = localStorage.getItem('concord_ptt') === '1';
    if (pttEnabled) {
      const pttKey = localStorage.getItem('concord_ptt_key') ?? 'Space';
      audioTrack.enabled = false;
      this.audioProducer.pause();
      const down = (e: KeyboardEvent) => {
        if ((e.code === pttKey || e.key === pttKey) && this.audioProducer) {
          audioTrack.enabled = true;
          this.audioProducer.resume();
        }
      };
      const up = (e: KeyboardEvent) => {
        if ((e.code === pttKey || e.key === pttKey) && this.audioProducer) {
          audioTrack.enabled = false;
          this.audioProducer.pause();
        }
      };
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      (this as any).__pttCleanup = () => {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
      };
    }
    this.startRttMonitor();
    this.emit('connected', { channelId });
  }

  // Cihazın desteklediği en modern video codec'i: AV1 > VP9 (> default VP8)
  private pickVideoCodec(): any | undefined {
    const codecs = (this.device?.rtpCapabilities?.codecs ?? []) as any[];
    for (const mime of ['video/AV1', 'video/VP9']) {
      const c = codecs.find((x) => String(x.mimeType).toLowerCase() === mime.toLowerCase());
      if (c) return c;
    }
    return undefined;
  }

  // Katmanlı yayın: AV1/VP9'da SVC (tek encoding, scalabilityMode), VP8/H264'te klasik
  // 3 katmanlı simulcast. Zayıf ağdaki izleyiciye SFU otomatik düşük katman gönderir.
  private videoEncodings(codecMime: string | undefined, maxBitrate: number, kind: 'camera' | 'screen') {
    const svc = codecMime && /av1|vp9/i.test(codecMime);
    if (svc) {
      // Ekranda spatial katman maliyetli ve metin keskinliğini bozar → yalnız temporal
      const mode = kind === 'screen' ? 'L1T3' : 'L3T3';
      return [{ scalabilityMode: mode, maxBitrate }];
    }
    return [
      { rid: 'r0', scaleResolutionDownBy: 4, maxBitrate: Math.max(120_000, Math.round(maxBitrate / 8)) },
      { rid: 'r1', scaleResolutionDownBy: 2, maxBitrate: Math.round(maxBitrate / 3) },
      { rid: 'r2', scaleResolutionDownBy: 1, maxBitrate },
    ];
  }

  async publishCamera(): Promise<MediaStream> {
    if (!this.sendTransport) throw new Error('not connected');
    if (this.cameraStream) return this.cameraStream;
    const videoId = localStorage.getItem('concord_video_device');
    const q = streamQuality();
    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: q.width },
      height: { ideal: q.height },
      frameRate: { ideal: q.fps },
    };
    if (videoId && videoId !== 'default') videoConstraints.deviceId = { exact: videoId };
    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    const rawTrack = this.cameraStream.getVideoTracks()[0];
    let track = rawTrack;
    let previewStream = this.cameraStream;
    if (isBlurEnabled()) {
      try {
        this.cameraEffect = await createBlurredTrack(rawTrack);
        track = this.cameraEffect.track;
        previewStream = this.cameraEffect.stream;
      } catch (e) {
        // Model yüklenemedi (ör. çevrimdışı) → blursuz devam et
        console.warn('video blur başlatılamadı, ham görüntüyle devam:', e);
        this.cameraEffect = null;
      }
    }
    track.contentHint = 'motion';
    const camCodec = this.pickVideoCodec();
    this.cameraProducer = await this.sendTransport.produce({
      track,
      codec: camCodec,
      encodings: this.videoEncodings(camCodec?.mimeType, q.camBitrate, 'camera'),
      codecOptions: { videoGoogleStartBitrate: 1000 },
      appData: { source: 'camera' },
    });
    this.producerSource.set(this.cameraProducer.id, 'camera');
    this.emit('local:camera', { stream: previewStream });
    return previewStream;
  }

  async unpublishCamera() {
    const pid = this.cameraProducer?.id;
    if (pid) this.ws?.send(JSON.stringify({ type: 'closeProducer', payload: { producerId: pid } }));
    this.cameraProducer?.close();
    this.cameraEffect?.stop();
    this.cameraEffect = null;
    this.cameraStream?.getTracks().forEach((t) => t.stop());
    if (this.cameraProducer) this.producerSource.delete(this.cameraProducer.id);
    this.cameraProducer = null;
    this.cameraStream = null;
    this.emit('local:camera', { stream: null });
  }

  // Arka plan bulanıklaştırmayı aç/kapa — kamera açıksa yayını canlı değiştirir (replaceTrack)
  async setVideoBlur(enabled: boolean): Promise<void> {
    const { setBlurEnabledFlag } = await import('./videoEffects');
    setBlurEnabledFlag(enabled);
    if (!this.cameraProducer || !this.cameraStream) return;
    const rawTrack = this.cameraStream.getVideoTracks()[0];
    if (!rawTrack) return;
    if (enabled) {
      const fx = await createBlurredTrack(rawTrack); // hata fırlatırsa çağıran toast gösterir
      await this.cameraProducer.replaceTrack({ track: fx.track });
      this.cameraEffect?.stop();
      this.cameraEffect = fx;
      this.emit('local:camera', { stream: fx.stream });
    } else {
      await this.cameraProducer.replaceTrack({ track: rawTrack });
      this.cameraEffect?.stop();
      this.cameraEffect = null;
      this.emit('local:camera', { stream: this.cameraStream });
    }
  }

  isVideoBlurOn(): boolean {
    return isBlurEnabled();
  }

  async publishScreen(): Promise<MediaStream> {
    if (!this.sendTransport) throw new Error('not connected');
    if (this.screenStream) return this.screenStream;
    const q = streamQuality();
    // @ts-ignore — getDisplayMedia
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: q.fps, width: { ideal: q.width }, height: { ideal: q.height } },
      // Sekme/uygulama sesi de paylaşılsın (kullanıcı paylaşım penceresinde onaylarsa)
      audio: true,
    });
    const track = this.screenStream.getVideoTracks()[0];
    track.onended = () => this.unpublishScreen();
    track.contentHint = 'detail';
    const scrCodec = this.pickVideoCodec();
    this.screenProducer = await this.sendTransport.produce({
      track,
      codec: scrCodec,
      encodings: this.videoEncodings(scrCodec?.mimeType, q.screenBitrate, 'screen'),
      codecOptions: { videoGoogleStartBitrate: 1500 },
      appData: { source: 'screen' },
    });
    this.producerSource.set(this.screenProducer.id, 'screen');
    // Ekran sesi (varsa) ayrı producer olarak gider; izleyen taraf izlerken duyar
    const audioTrack = this.screenStream.getAudioTracks()[0];
    if (audioTrack) {
      this.screenAudioProducer = await this.sendTransport.produce({
        track: audioTrack,
        appData: { source: 'screen-audio' },
      });
      this.producerSource.set(this.screenAudioProducer.id, 'screen-audio');
    }
    this.emit('local:screen', { stream: this.screenStream });
    return this.screenStream;
  }

  async unpublishScreen() {
    const pid = this.screenProducer?.id;
    if (pid) this.ws?.send(JSON.stringify({ type: 'closeProducer', payload: { producerId: pid } }));
    const apid = this.screenAudioProducer?.id;
    if (apid) this.ws?.send(JSON.stringify({ type: 'closeProducer', payload: { producerId: apid } }));
    this.screenProducer?.close();
    this.screenAudioProducer?.close();
    this.screenStream?.getTracks().forEach((t) => t.stop());
    if (this.screenProducer) this.producerSource.delete(this.screenProducer.id);
    if (this.screenAudioProducer) this.producerSource.delete(this.screenAudioProducer.id);
    this.screenProducer = null;
    this.screenAudioProducer = null;
    this.screenStream = null;
    this.emit('local:screen', { stream: null });
  }

  // Discord web ile aynı davranış: sustur = producer.pause + track.enabled=false.
  // === Speaking indicator (Discord paritesi) ===
  private speakingUsers = new Set<string>();
  private speakingAnalyzers = new Map<string, { ac: AudioContext; raf?: number }>();

  speakingSet(): Set<string> {
    return new Set(this.speakingUsers);
  }

  // === Kullanıcı bazlı ses seviyesi (0.0 - 2.0, GainNode ile %200'e kadar) ===
  private playbackCtx: AudioContext | null = null;
  private audioGains = new Map<string, GainNode>(); // producerId -> gain

  private ensurePlaybackCtx(): AudioContext | null {
    if (!this.playbackCtx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.playbackCtx = new AC();
    }
    if (this.playbackCtx.state === 'suspended') this.playbackCtx.resume().catch(() => {});
    return this.playbackCtx;
  }

  // Uzak ses akışını GainNode üzerinden çalar (>%100 amplifikasyon için). Başarısız olursa
  // el.volume'a düşer (max %100).
  private attachGain(producerId: string, userId: string, stream: MediaStream, el: HTMLAudioElement) {
    const ctx = this.ensurePlaybackCtx();
    if (!ctx) {
      el.volume = Math.min(1, this.getUserVolume(userId));
      return;
    }
    try {
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = this.getUserVolume(userId);
      src.connect(gain).connect(ctx.destination);
      el.muted = true; // çalma Web Audio üzerinden
      this.audioGains.set(producerId, gain);
    } catch {
      el.volume = Math.min(1, this.getUserVolume(userId));
    }
  }

  getUserVolume(userId: string): number {
    const v = localStorage.getItem('concord_vol_' + userId);
    if (v === null) return 1;
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : 1;
  }

  setUserVolume(userId: string, vol: number) {
    const v = Math.min(2, Math.max(0, vol));
    localStorage.setItem('concord_vol_' + userId, String(v));
    for (const [producerId, info] of this.remotes.entries()) {
      if (info.userId === userId && info.kind === 'audio') {
        const gain = this.audioGains.get(producerId);
        if (gain) gain.gain.value = v;
        else {
          const el = this.remoteAudioEls.get(producerId);
          if (el) el.volume = Math.min(1, v);
        }
      }
    }
    this.emit('volume:changed', { userId, volume: v });
  }

  startSpeakingAnalyzer(userId: string, stream: MediaStream) {
    if (this.speakingAnalyzers.has(userId)) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ac = new AC();
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const meta: { ac: AudioContext; raf?: number } = { ac };
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (const v of data) sum += v;
        const avg = sum / data.length;
        const wasSpeaking = this.speakingUsers.has(userId);
        const isSpeaking = avg > 18;
        // AFK takibi: kendi mikrofonumda ses varken son aktivite zamanını güncelle
        if (isSpeaking && userId === '__self__') this.lastLocalVoiceActivity = Date.now();
        if (isSpeaking !== wasSpeaking) {
          if (isSpeaking) this.speakingUsers.add(userId);
          else this.speakingUsers.delete(userId);
          this.emit('speaking:changed', { userId, speaking: isSpeaking });
        }
        meta.raf = requestAnimationFrame(tick);
      };
      this.speakingAnalyzers.set(userId, meta);
      tick();
    } catch {}
  }

  stopSpeakingAnalyzer(userId: string) {
    const meta = this.speakingAnalyzers.get(userId);
    if (!meta) return;
    if (meta.raf) cancelAnimationFrame(meta.raf);
    try {
      meta.ac.close();
    } catch {}
    this.speakingAnalyzers.delete(userId);
    if (this.speakingUsers.delete(userId)) {
      this.emit('speaking:changed', { userId, speaking: false });
    }
  }

  // Track aktif kalır, hızlı toggle, RTP gönderilmez, sessizlik üretir.
  // Tarayıcı sekme ikonu (Discord web'de de) yanmaya devam eder — bu beklenen.
  private micEnabled = true;

  setMicrophoneEnabled(enabled: boolean) {
    if (!this.audioProducer) return;
    this.micEnabled = enabled;
    if (enabled) {
      this.audioProducer.resume();
      this.micStream?.getAudioTracks().forEach((t) => (t.enabled = true));
    } else {
      this.audioProducer.pause();
      this.micStream?.getAudioTracks().forEach((t) => (t.enabled = false));
    }
    this.emit('mic:changed', { enabled });
  }

  // Global kısayol (masaüstü Ctrl+Shift+M) için — bağlı değilken sessizce yok sayılır
  toggleMicrophone() {
    this.setMicrophoneEnabled(!this.micEnabled);
  }

  // === Bağlantı kalitesi (RTT) — VoiceStatusBar'daki sinyal çubukları için ===
  private rttMs: number | null = null;
  private rttTimer: number | null = null;

  getRtt(): number | null {
    return this.rttMs;
  }

  private startRttMonitor() {
    this.stopRttMonitor();
    this.rttTimer = window.setInterval(async () => {
      try {
        const stats = await this.sendTransport?.getStats();
        if (!stats) return;
        let rtt: number | undefined;
        stats.forEach((s: any) => {
          if (s.type === 'candidate-pair' && (s.nominated || s.selected) && typeof s.currentRoundTripTime === 'number') {
            rtt = s.currentRoundTripTime;
          }
        });
        if (rtt !== undefined) {
          this.rttMs = Math.round(rtt * 1000);
          this.emit('rtt', { ms: this.rttMs });
        }
      } catch { /* stats alınamadı — bir sonraki turda tekrar */ }
    }, 3000);
  }

  private stopRttMonitor() {
    if (this.rttTimer !== null) {
      window.clearInterval(this.rttTimer);
      this.rttTimer = null;
    }
    this.rttMs = null;
  }

  private deafened = false;

  // Deafen: tüm remote audio'ları sustur + mikrofonu da kapat (Discord davranışı)
  setDeafened(deaf: boolean) {
    this.deafened = deaf;
    for (const el of this.remoteAudioEls.values()) {
      el.muted = deaf;
    }
    if (deaf) {
      this.setMicrophoneEnabled(false);
    }
    this.emit('deafen:changed', { deafened: deaf });
  }

  isDeafened(): boolean {
    return this.deafened;
  }

  isConnected(): boolean {
    return this.channelId != null && !!this.audioProducer;
  }

  isMicrophoneEnabled(): boolean {
    return this.audioProducer ? !this.audioProducer.paused : true;
  }

  async disconnect() {
    this.stopRttMonitor();
    this.stopSpeakingAnalyzer('__self__');
    this.micEffect?.stop();
    this.micEffect = null;
    try {
      this.audioProducer?.close();
      this.cameraProducer?.close();
      this.screenProducer?.close();
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.cameraStream?.getTracks().forEach((t) => t.stop());
      this.screenStream?.getTracks().forEach((t) => t.stop());
      this.sendTransport?.close();
      this.recvTransport?.close();
      for (const el of this.remoteAudioEls.values()) {
        el.pause();
        el.remove();
      }
      this.remoteAudioEls.clear();
      for (const g of this.audioGains.values()) try { g.disconnect(); } catch {}
      this.audioGains.clear();
      this.playbackCtx?.close().catch(() => {});
      this.playbackCtx = null;
      this.remotes.clear();
      this.producerSource.clear();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        await this.request('leave').catch(() => {});
        this.ws.close();
      }
    } catch (e) {
      console.warn('disconnect error', e);
    }
    this.ws = null;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.audioProducer = null;
    this.cameraProducer = null;
    this.screenProducer = null;
    this.micStream = null;
    this.cameraStream = null;
    this.screenStream = null;
    this.channelId = null;
    const cleanup = (this as any).__pttCleanup;
    if (cleanup) {
      cleanup();
      (this as any).__pttCleanup = null;
    }
    this.emit('remotes:changed', {});
  }

  private async createSendTransport() {
    if (!this.device) return;
    const info = await this.request('createWebRtcTransport', { direction: 'send' });
    this.sendTransport = this.device.createSendTransport({
      id: info.id,
      iceParameters: info.iceParameters,
      iceCandidates: info.iceCandidates,
      dtlsParameters: info.dtlsParameters,
    });
    this.sendTransport.on('connect', ({ dtlsParameters }, cb, eb) => {
      this.request('connectTransport', { transportId: info.id, dtlsParameters })
        .then(() => cb())
        .catch(eb);
    });
    this.sendTransport.on('produce', ({ kind, rtpParameters, appData }, cb, eb) => {
      this.request('produce', { kind, rtpParameters, appData })
        .then(({ id }: { id: string }) => cb({ id }))
        .catch(eb);
    });
  }

  private async createRecvTransport() {
    if (!this.device) return;
    const info = await this.request('createWebRtcTransport', { direction: 'recv' });
    this.recvTransport = this.device.createRecvTransport({
      id: info.id,
      iceParameters: info.iceParameters,
      iceCandidates: info.iceCandidates,
      dtlsParameters: info.dtlsParameters,
    });
    this.recvTransport.on('connect', ({ dtlsParameters }, cb, eb) => {
      this.request('connectTransport', { transportId: info.id, dtlsParameters })
        .then(() => cb())
        .catch(eb);
    });
  }

  private async consume(producerId: string, userId: string, source: 'mic' | 'camera' | 'screen' | 'screen-audio' = 'mic') {
    if (!this.device || !this.recvTransport) return;
    const data = await this.request('consume', {
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });
    const consumer = await this.recvTransport.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters,
    });
    const stream = new MediaStream([consumer.track]);
    const info: RemoteStreamInfo = {
      userId,
      producerId,
      kind: data.kind as 'audio' | 'video',
      source,
      stream,
    };
    this.remotes.set(producerId, info);
    this.consumers.set(producerId, consumer);
    // Track biterse (gönderen yayını durdurursa) akışı kaldır
    consumer.on('trackended', () => this.removeRemote(producerId));

    if (data.kind === 'audio') {
      const el = document.createElement('audio');
      el.srcObject = stream;
      el.autoplay = true;
      // Output device seçimi (Chrome destekli)
      const outputId = localStorage.getItem('concord_output_device');
      if (outputId && outputId !== 'default' && 'setSinkId' in el) {
        (el as any).setSinkId(outputId).catch(() => {});
      }
      document.body.appendChild(el);
      this.remoteAudioEls.set(producerId, el);
      // GainNode ile ses seviyesi (%0-200). Mute toggle yerine gain kullanılır.
      this.attachGain(producerId, userId, stream, el);
      // Speaking indicator için analyser başlat
      this.startSpeakingAnalyzer(userId, stream);
    }
    this.emit('remotes:changed', {});
    this.emit('consumed', info);
  }

  private async onMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.replyTo) {
      const p = this.pending.get(msg.replyTo);
      if (p) {
        this.pending.delete(msg.replyTo);
        if (msg.type === 'error') p.reject(new Error(msg.payload?.message ?? 'error'));
        else p.resolve(msg.payload);
      }
      return;
    }

    switch (msg.type) {
      case 'peer:joined':
        this.emit('peer:joined', msg.payload);
        break;
      case 'peer:left':
        for (const [pid, info] of this.remotes.entries()) {
          if (info.userId === msg.payload.userId) {
            const el = this.remoteAudioEls.get(pid);
            el?.pause();
            el?.remove();
            this.remoteAudioEls.delete(pid);
            const g = this.audioGains.get(pid);
            if (g) { try { g.disconnect(); } catch {} this.audioGains.delete(pid); }
            try { this.consumers.get(pid)?.close(); } catch { /* yoksay */ }
            this.consumers.delete(pid);
            this.remotes.delete(pid);
          }
        }
        // Ayrılan kişinin izlenmeyen yayınlarını da temizle
        for (const [pid, v] of this.pendingVideo.entries()) {
          if (v.userId === msg.payload.userId) this.pendingVideo.delete(pid);
        }
        this.stopSpeakingAnalyzer(msg.payload.userId);
        this.emit('remotes:changed', {});
        this.emit('streams:changed', {});
        this.emit('peer:left', msg.payload);
        break;
      case 'newProducer': {
        const src = (msg.payload.appData?.source as 'mic' | 'camera' | 'screen') ?? 'mic';
        this.handleIncomingProducer(msg.payload.producerId, msg.payload.userId, src);
        break;
      }
      case 'voiceState': {
        // Mod sunucu-susturma/sağırlaştırma yaptı (enforce voice server'da; bu sadece UI içindir)
        const { userId, serverMute, serverDeaf } = msg.payload;
        this.serverVoice.set(String(userId), { mute: !!serverMute, deafen: !!serverDeaf });
        this.emit('voiceState:changed', { userId: String(userId), serverMute: !!serverMute, serverDeaf: !!serverDeaf });
        break;
      }
      case 'producerClosed': {
        // Gönderen kamerayı/ekranı kapattı → akışı/kartı kaldır
        if (msg.payload?.producerId) this.removeRemote(String(msg.payload.producerId));
        break;
      }
      case 'stageHand': {
        const { userId, raised } = msg.payload;
        if (raised) this.stageHands.add(String(userId));
        else this.stageHands.delete(String(userId));
        this.emit('stage:changed', {});
        break;
      }
      case 'stageSpeaker': {
        const { userId, isSpeaker } = msg.payload;
        const uid = String(userId);
        if (isSpeaker) this.stageSpeakers.add(uid);
        else this.stageSpeakers.delete(uid);
        this.stageHands.delete(uid); // konuşmacı olunca el iner
        // Bensem mikrofonu aç/kapat (konuşmacı=aç, dinleyici=kapat)
        const myId = String((window as any).__concord_store?.getState?.()?.auth?.user?.id ?? '');
        if (uid === myId) this.setMicrophoneEnabled(isSpeaker);
        this.emit('stage:changed', {});
        break;
      }
    }
  }

  private request(type: string, payload?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('ws not open'));
        return;
      }
      const id = String(++this.requestId);
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, type, payload }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout: ${type}`));
        }
      }, 10000);
    });
  }
}

export const voice = new VoiceClient();

// Sayfa kapatılırken/yenilenirken ses oturumunu temizle — tarayıcının
// "zombi" kamera/mikrofon stream tutmaması için
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      voice.disconnect();
    } catch {}
  });
  window.addEventListener('pagehide', () => {
    try {
      voice.disconnect();
    } catch {}
  });
}
