// Sidcord mobil ses istemcisi — mediasoup-client + react-native-webrtc.
// Ses-odaklı (mic produce + consume, mute/deafen). Web voice.ts'in mobil/ses alt kümesi.
// NOT: react-native-webrtc native modül gerektirir → Expo Go'da DEĞİL, EAS dev client / native build'de çalışır.
import { Device } from 'mediasoup-client';
import { mediaDevices } from 'react-native-webrtc';
import { voiceWsUrl } from './config';
import { getAccessToken } from './api';

type Handler = (payload?: any) => void;
export interface VoicePeer { userId: string; serverMute?: boolean }

class VoiceClient {
  private ws: WebSocket | null = null;
  private device: any = null;
  private sendTransport: any = null;
  private recvTransport: any = null;
  private audioProducer: any = null;
  private micStream: any = null;
  private cameraProducer: any = null;
  private cameraStream: any = null;
  private screenProducer: any = null;
  private screenStream: any = null;
  private consumers = new Map<string, any>();      // producerId -> consumer
  private producerOwner = new Map<string, string>(); // producerId -> userId
  private videoRemotes = new Map<string, { userId: string; source: string; stream: any }>();
  private stage = false;
  private meId = '';
  stageSpeakers = new Set<string>();
  stageHands = new Set<string>();
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private requestId = 0;
  private handlers: Record<string, Handler[]> = {};
  channelId: string | null = null;
  channelName = '';
  peers = new Map<string, VoicePeer>();
  private muted = false;
  private deafened = false;

  on(e: string, h: Handler) { (this.handlers[e] ??= []).push(h); }
  off(e: string, h: Handler) { this.handlers[e] = (this.handlers[e] ?? []).filter((x) => x !== h); }
  private emit(e: string, p?: any) { for (const h of this.handlers[e] ?? []) h(p); }

  isConnected() { return !!this.channelId && !!this.audioProducer; }
  isMuted() { return this.muted; }
  isDeafened() { return this.deafened; }
  participants(): VoicePeer[] { return Array.from(this.peers.values()); }

  async connect(channelId: string, channelName = '', opts?: { meId?: string; stage?: boolean }) {
    const token = getAccessToken();
    if (!token) throw new Error('Oturum yok');
    if (this.ws) await this.disconnect();
    this.channelId = channelId;
    this.channelName = channelName;
    this.stage = !!opts?.stage;
    this.meId = opts?.meId ?? '';

    this.ws = new WebSocket(voiceWsUrl(channelId, token));
    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error('ws yok'));
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('Ses sunucusuna bağlanılamadı'));
    });
    this.ws.onmessage = (evt: any) => this.onMessage(String(evt.data));
    this.ws.onclose = () => this.emit('disconnected', { channelId: this.channelId });

    try {
      const caps = await this.request('getRouterRtpCapabilities');
      this.device = new Device();
      await this.device.load({ routerRtpCapabilities: caps });

      const joinRes = await this.request('join');
      for (const p of joinRes.peers ?? []) {
        const uid = String(p.userId ?? p.id ?? p);
        this.peers.set(uid, { userId: uid });
      }
      this.stageSpeakers = new Set<string>((joinRes.stageSpeakers ?? []).map(String));
      this.stageHands = new Set<string>((joinRes.stageHands ?? []).map(String));
      this.emit('change');

      await this.createSendTransport();
      await this.createRecvTransport();

      for (const p of joinRes.producers ?? []) {
        const src = p.appData?.source ?? 'mic';
        if (['mic', 'camera', 'screen'].includes(src)) this.consume(p.producerId, String(p.userId), src).catch(() => {});
      }

      this.micStream = await mediaDevices.getUserMedia({ audio: true, video: false });
      const track = (this.micStream as any).getAudioTracks()[0];
      this.audioProducer = await this.sendTransport.produce({
        track,
        appData: { source: 'mic' },
        codecOptions: { opusFec: true, opusDtx: true },
      });
      // Sahne kanalında dinleyiciysen mikrofon kapalı başlar
      if (this.stage && !this.amSpeaker()) this.setMuted(true);
      this.emit('connected', { channelId });
      this.emit('change');
    } catch (e) {
      await this.disconnect();
      throw e;
    }
  }

  private async createSendTransport() {
    const info = await this.request('createWebRtcTransport', { direction: 'send' });
    this.sendTransport = this.device.createSendTransport({
      id: info.id, iceParameters: info.iceParameters, iceCandidates: info.iceCandidates, dtlsParameters: info.dtlsParameters,
    });
    this.sendTransport.on('connect', ({ dtlsParameters }: any, cb: any, eb: any) =>
      this.request('connectTransport', { transportId: info.id, dtlsParameters }).then(() => cb()).catch(eb));
    this.sendTransport.on('produce', ({ kind, rtpParameters, appData }: any, cb: any, eb: any) =>
      this.request('produce', { kind, rtpParameters, appData }).then(({ id }: any) => cb({ id })).catch(eb));
  }

  private async createRecvTransport() {
    const info = await this.request('createWebRtcTransport', { direction: 'recv' });
    this.recvTransport = this.device.createRecvTransport({
      id: info.id, iceParameters: info.iceParameters, iceCandidates: info.iceCandidates, dtlsParameters: info.dtlsParameters,
    });
    this.recvTransport.on('connect', ({ dtlsParameters }: any, cb: any, eb: any) =>
      this.request('connectTransport', { transportId: info.id, dtlsParameters }).then(() => cb()).catch(eb));
  }

  private async consume(producerId: string, userId: string, source = 'mic') {
    if (!this.device || !this.recvTransport) return;
    const data = await this.request('consume', { producerId, rtpCapabilities: this.device.rtpCapabilities });
    const consumer = await this.recvTransport.consume({
      id: data.id, producerId: data.producerId, kind: data.kind, rtpParameters: data.rtpParameters,
    });
    this.consumers.set(producerId, consumer);
    this.producerOwner.set(producerId, userId);
    if (data.kind === 'video') {
      const MS = (globalThis as any).MediaStream;
      this.videoRemotes.set(producerId, { userId, source, stream: MS ? new MS([consumer.track]) : null });
    } else if (this.deafened) {
      try { consumer.track.enabled = false; } catch {}
    }
    consumer.on('trackended', () => this.removeConsumer(producerId));
    if (!this.peers.has(userId)) this.peers.set(userId, { userId });
    this.emit('change');
  }

  private removeConsumer(producerId: string) {
    try { this.consumers.get(producerId)?.close(); } catch {}
    this.consumers.delete(producerId);
    this.producerOwner.delete(producerId);
    this.videoRemotes.delete(producerId);
    this.emit('change');
  }

  // --- Kamera (görüntülü görüşme) ---
  isCameraOn() { return !!this.cameraProducer; }
  localCameraStream() { return this.cameraStream; }
  videoStreams() { return Array.from(this.videoRemotes.entries()).map(([producerId, v]) => ({ producerId, ...v })); }

  async publishCamera() {
    if (!this.sendTransport || this.cameraProducer) return;
    this.cameraStream = await mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false } as any);
    const track = (this.cameraStream as any).getVideoTracks()[0];
    this.cameraProducer = await this.sendTransport.produce({ track, appData: { source: 'camera' } });
    this.emit('change');
  }
  async stopCamera() {
    try { this.cameraProducer?.close(); this.cameraStream?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
    this.cameraProducer = null; this.cameraStream = null;
    this.emit('change');
  }
  toggleCamera() { return this.cameraProducer ? this.stopCamera() : this.publishCamera(); }

  // --- Ekran paylaşımı (Android; iOS broadcast extension gerektirir, desteklenmez) ---
  isScreenOn() { return !!this.screenProducer; }
  async publishScreen() {
    if (!this.sendTransport || this.screenProducer) return;
    this.screenStream = await (mediaDevices as any).getDisplayMedia();
    const track = (this.screenStream as any).getVideoTracks()[0];
    this.screenProducer = await this.sendTransport.produce({ track, appData: { source: 'screen' } });
    track.addEventListener?.('ended', () => this.stopScreen());
    this.emit('change');
  }
  async stopScreen() {
    try { this.screenProducer?.close(); this.screenStream?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
    this.screenProducer = null; this.screenStream = null;
    this.emit('change');
  }
  toggleScreen() { return this.screenProducer ? this.stopScreen() : this.publishScreen(); }

  // --- Sahne (stage) ---
  isStageChannel() { return this.stage; }
  amSpeaker() { return !this.stage || this.stageSpeakers.has(this.meId); }
  myHandRaised() { return this.stageHands.has(this.meId); }
  speakerIds() { return Array.from(this.stageSpeakers); }
  handIds() { return Array.from(this.stageHands); }
  raiseHand(raise: boolean) {
    try { this.ws?.send(JSON.stringify({ type: 'stageHand', payload: { raised: raise } })); } catch {}
  }
  makeSpeaker(userId: string, isSpeaker: boolean) {
    try { this.ws?.send(JSON.stringify({ type: 'stageSpeaker', payload: { userId, isSpeaker } })); } catch {}
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      if (m) this.audioProducer?.pause(); else this.audioProducer?.resume();
      const t = this.micStream?.getAudioTracks?.()[0];
      if (t) t.enabled = !m;
    } catch {}
    if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify({ type: 'voiceState', payload: { mute: m } })); } catch {} }
    this.emit('change');
  }
  setDeafened(d: boolean) {
    this.deafened = d;
    for (const c of this.consumers.values()) { try { c.track.enabled = !d; } catch {} }
    if (d && !this.muted) this.setMuted(true);
    this.emit('change');
  }
  toggleMute() { this.setMuted(!this.muted); }
  toggleDeafen() { this.setDeafened(!this.deafened); }

  async disconnect() {
    try {
      this.audioProducer?.close();
      this.cameraProducer?.close();
      this.screenProducer?.close();
      this.micStream?.getTracks?.().forEach((t: any) => t.stop());
      this.cameraStream?.getTracks?.().forEach((t: any) => t.stop());
      this.screenStream?.getTracks?.().forEach((t: any) => t.stop());
      for (const c of this.consumers.values()) { try { c.close(); } catch {} }
      this.sendTransport?.close();
      this.recvTransport?.close();
      if (this.ws && this.ws.readyState === 1) { await this.request('leave').catch(() => {}); this.ws.close(); }
    } catch {}
    this.consumers.clear(); this.producerOwner.clear(); this.peers.clear(); this.videoRemotes.clear();
    this.stageSpeakers.clear(); this.stageHands.clear(); this.stage = false;
    this.ws = null; this.device = null; this.sendTransport = null; this.recvTransport = null;
    this.audioProducer = null; this.micStream = null; this.cameraProducer = null; this.cameraStream = null;
    this.screenProducer = null; this.screenStream = null;
    const ch = this.channelId;
    this.channelId = null; this.channelName = ''; this.muted = false; this.deafened = false;
    this.emit('change'); this.emit('disconnected', { channelId: ch });
  }

  private onMessage(raw: string) {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.replyTo) {
      const p = this.pending.get(msg.replyTo);
      if (p) { this.pending.delete(msg.replyTo); msg.type === 'error' ? p.reject(new Error(msg.payload?.message ?? 'hata')) : p.resolve(msg.payload); }
      return;
    }
    switch (msg.type) {
      case 'peer:joined':
        this.peers.set(String(msg.payload.userId), { userId: String(msg.payload.userId) });
        this.emit('change');
        break;
      case 'peer:left': {
        const uid = String(msg.payload.userId);
        for (const [pid, owner] of this.producerOwner.entries()) if (owner === uid) this.removeConsumer(pid);
        this.peers.delete(uid);
        this.emit('change');
        break;
      }
      case 'newProducer': {
        const src = msg.payload.appData?.source ?? 'mic';
        if (['mic', 'camera', 'screen'].includes(src)) this.consume(msg.payload.producerId, String(msg.payload.userId), src).catch(() => {});
        break;
      }
      case 'producerClosed':
        if (msg.payload?.producerId) this.removeConsumer(String(msg.payload.producerId));
        break;
      case 'voiceState': {
        const uid = String(msg.payload.userId);
        const pe = this.peers.get(uid) ?? { userId: uid };
        pe.serverMute = !!msg.payload.serverMute;
        this.peers.set(uid, pe);
        this.emit('change');
        break;
      }
      case 'stageHand': {
        const uid = String(msg.payload.userId);
        if (msg.payload.raised) this.stageHands.add(uid); else this.stageHands.delete(uid);
        this.emit('change');
        break;
      }
      case 'stageSpeaker': {
        const uid = String(msg.payload.userId);
        if (msg.payload.isSpeaker) this.stageSpeakers.add(uid); else this.stageSpeakers.delete(uid);
        this.stageHands.delete(uid);
        if (uid === this.meId) this.setMuted(!msg.payload.isSpeaker);
        this.emit('change');
        break;
      }
    }
  }

  private request(type: string, payload?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) { reject(new Error('ws kapalı')); return; }
      const id = String(++this.requestId);
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, type, payload }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('zaman aşımı: ' + type)); } }, 10000);
    });
  }
}

export const voice = new VoiceClient();
