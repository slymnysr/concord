// WebSocket signaling — istemci komutlarını routerlar
// İstemci akışı:
// 1) connect (token + channelId)
// 2) getRouterRtpCapabilities → server döner
// 3) createWebRtcTransport (send/recv)
// 4) connectTransport (dtlsParameters)
// 5) produce (kind, rtpParameters)
// 6) consume (producerId, rtpCapabilities)
// 7) leave

import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import pino from 'pino';
import { config } from './config.js';
import { getRoom, listPeerIds, getVoiceState, setVoiceState, applyVoiceStateToPeer } from './room.js';

const log = pino({ name: 'voice/signaling', level: 'info' });

// API'den kalıcı server-mute/deaf durumunu çekmek için (voice server restart durabilitesi)
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8080/api/v1';
const VOICE_CONTROL_SECRET = process.env.VOICE_CONTROL_SECRET ?? 'dev_voice_control_secret_change_me';

// Kanal join politikası: kullanıcı limiti + ses bitrate'i + limit muafiyeti (API'den)
async function fetchJoinPolicy(
  channelId: string,
  userId: string,
): Promise<{ user_limit: number; bitrate: number; can_bypass: boolean } | null> {
  try {
    const res = await fetch(
      `${API_INTERNAL_URL}/voice-internal/can-join?channel_id=${encodeURIComponent(channelId)}&user_id=${encodeURIComponent(userId)}`,
      { headers: { 'x-voice-secret': VOICE_CONTROL_SECRET } },
    );
    if (!res.ok) return null;
    return (await res.json()) as { user_limit: number; bitrate: number; can_bypass: boolean };
  } catch {
    return null; // API erişilemezse limit uygulanmaz (kullanılabilirlik > kısıt)
  }
}

async function loadPersistedVoiceState(channelId: string, userId: string): Promise<void> {
  try {
    const res = await fetch(
      `${API_INTERNAL_URL}/voice-internal/state?channel_id=${encodeURIComponent(channelId)}&user_id=${encodeURIComponent(userId)}`,
      { headers: { 'x-voice-secret': VOICE_CONTROL_SECRET } },
    );
    if (!res.ok) return;
    const st = (await res.json()) as { mute?: boolean; deafen?: boolean };
    if (st.mute || st.deafen) {
      setVoiceState(userId, { mute: !!st.mute, deafen: !!st.deafen });
      applyVoiceStateToPeer(userId);
    }
  } catch {
    /* API erişilemezse sessizce geç — enforcement gateway/DB üzerinden zaten korunuyor */
  }
}

// Kontrol endpoint'inin (presence_http) odaya yayın yapabilmesi için wss referansı
let wssRef: WebSocketServer | null = null;
export function broadcastToChannel(channelId: string, m: { type: string; payload?: any }) {
  if (!wssRef) return;
  for (const client of wssRef.clients) {
    const c = client as AuthedSocket;
    if (c.readyState === WebSocket.OPEN && c.channelId === channelId) {
      try { c.send(JSON.stringify(m)); } catch { /* yoksay */ }
    }
  }
}

interface Message {
  id?: string;
  type: string;
  payload?: any;
  replyTo?: string;
}

type AuthedSocket = WebSocket & { userId?: string; userName?: string; channelId?: string; socketId?: string };

export function startSignaling() {
  const wss = new WebSocketServer({ port: config.port });
  wssRef = wss;
  log.info({ port: config.port }, 'voice signaling listening');

  wss.on('connection', (ws: AuthedSocket, req) => {
    const url = new URL(req.url ?? '/', `http://localhost`);
    const token = url.searchParams.get('token') ?? '';
    const channelId = url.searchParams.get('channel') ?? '';
    if (!channelId) {
      ws.close(4001, 'channel required');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { uid?: string | number; sub?: string; name?: string };
      // sub (JWT'de string) tercih edilir; uid JS'te sayı olarak gelirse Snowflake
      // ID'si 2^53 sınırını aşıp hassasiyet kaybeder (…792 → …790). sub kayıpsızdır.
      ws.userId = String(decoded.sub ?? decoded.uid ?? '');
      ws.userName = typeof decoded.name === 'string' ? decoded.name : '';
      if (!ws.userId) throw new Error('uid missing');
    } catch (e) {
      log.warn({ err: String(e) }, 'auth failed');
      ws.close(4002, 'unauthorized');
      return;
    }

    ws.socketId = uuid();
    ws.channelId = channelId;
    const room = getRoom(channelId);

    log.info({ userId: ws.userId, channelId }, 'ws connected');

    // Diğer üyelere bildir (yeni peer geldi)
    broadcast(wss, channelId, ws.userId!, {
      type: 'peer:joined',
      payload: { userId: ws.userId, name: ws.userName },
    });

    ws.on('message', async (raw) => {
      let msg: Message;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      try {
        await handleMessage(ws, wss, msg);
      } catch (e) {
        log.error({ err: String(e), type: msg.type }, 'handler error');
        send(ws, { type: 'error', replyTo: msg.id, payload: { message: String(e) } });
      }
    });

    ws.on('close', () => {
      if (!ws.userId || !ws.channelId) return;
      const r = getRoom(ws.channelId);
      r.removePeer(ws.userId);
      broadcast(wss, ws.channelId, ws.userId, {
        type: 'peer:left',
        payload: { userId: ws.userId },
      });
    });
  });
}

async function handleMessage(ws: AuthedSocket, wss: WebSocketServer, msg: Message) {
  if (!ws.userId || !ws.channelId) return;
  const room = getRoom(ws.channelId);

  switch (msg.type) {
    case 'getRouterRtpCapabilities': {
      const router = await room.router();
      send(ws, { type: 'routerRtpCapabilities', replyTo: msg.id, payload: router.rtpCapabilities });
      return;
    }

    case 'join': {
      // Kanal kullanıcı limiti (taşıma/kanal yönetme yetkisi olanlar dolu kanala girebilir)
      const policy = await fetchJoinPolicy(ws.channelId, ws.userId);
      if (policy && policy.user_limit > 0 && !policy.can_bypass) {
        const current = listPeerIds(ws.channelId).filter((id) => id !== ws.userId).length;
        if (current >= policy.user_limit) {
          send(ws, {
            type: 'error',
            replyTo: msg.id,
            payload: {
              code: 'channel_full',
              message: `Kanal dolu (${policy.user_limit} kişi sınırı)`,
            },
          });
          return;
        }
      }
      await room.addPeer(ws.userId, ws.socketId!, ws.userName);
      // Kalıcı server-mute/deaf durumunu API'den yükle (voice server yeniden başlamış olabilir)
      await loadPersistedVoiceState(ws.channelId, ws.userId);
      const peerIds = listPeerIds(ws.channelId).filter((id) => id !== ws.userId);
      const existing = room.otherProducers(ws.userId).map((x) => ({
        producerId: x.producer.id,
        userId: x.peerId,
        kind: x.producer.kind,
        appData: x.producer.appData,
      }));
      send(ws, {
        type: 'joined',
        replyTo: msg.id,
        payload: {
          peers: peerIds,
          producers: existing,
          stageSpeakers: Array.from(room.stageSpeakers),
          stageHands: Array.from(room.stageHands),
          // Kanalın ses bitrate ayarı (bps) — client opus encoder'ına uygular
          audioBitrate: policy?.bitrate ?? 64000,
        },
      });
      return;
    }

    case 'getChannelPresence': {
      // Login olmuş ama kanala katılmamış birinin de sorgulayabilmesi için
      // ayrıca kullanılır (sidebar'da kim bağlı)
      const cid = msg.payload?.channelId as string | undefined;
      if (!cid) return;
      send(ws, {
        type: 'channelPresence',
        replyTo: msg.id,
        payload: { channelId: cid, peers: listPeerIds(cid) },
      });
      return;
    }

    case 'createWebRtcTransport': {
      const peer = room.peers.get(ws.userId);
      if (!peer) {
        send(ws, { type: 'error', replyTo: msg.id, payload: { message: 'peer not found' } });
        return;
      }
      const direction = msg.payload?.direction as 'send' | 'recv';
      const info = await room.createTransport(peer, direction);
      send(ws, { type: 'transportCreated', replyTo: msg.id, payload: info });
      return;
    }

    case 'connectTransport': {
      const peer = room.peers.get(ws.userId);
      if (!peer) return;
      const { transportId, dtlsParameters } = msg.payload;
      const t = peer.sendTransport?.id === transportId ? peer.sendTransport : peer.recvTransport;
      if (!t) return;
      await t.connect({ dtlsParameters });
      send(ws, { type: 'transportConnected', replyTo: msg.id, payload: { transportId } });
      return;
    }

    case 'produce': {
      const peer = room.peers.get(ws.userId);
      if (!peer || !peer.sendTransport) return;
      const { kind, rtpParameters, appData } = msg.payload;
      const producer = await peer.sendTransport.produce({ kind, rtpParameters, appData });
      peer.producers.set(producer.id, producer);
      // Sunucuda susturulmuşsa mikrofon producer'ını anında duraklat (yeniden bağlanışta da geçerli)
      if ((appData?.source === 'mic' || kind === 'audio') && getVoiceState(ws.userId).mute) {
        producer.pause().catch(() => {});
      }
      send(ws, { type: 'produced', replyTo: msg.id, payload: { id: producer.id } });
      broadcast(wss, ws.channelId, ws.userId, {
        type: 'newProducer',
        payload: { producerId: producer.id, userId: ws.userId, kind, appData },
      });
      return;
    }

    case 'consume': {
      const peer = room.peers.get(ws.userId);
      if (!peer || !peer.recvTransport) return;
      const { producerId, rtpCapabilities } = msg.payload;
      const router = await room.router();
      if (!router.canConsume({ producerId, rtpCapabilities })) {
        send(ws, { type: 'error', replyTo: msg.id, payload: { message: 'cannot consume' } });
        return;
      }
      const consumer = await peer.recvTransport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
      });
      peer.consumers.set(consumer.id, consumer);
      // Simulcast/SVC: en yüksek katmanı hedefle — bant yetmezse mediasoup BWE otomatik düşürür
      if (consumer.kind === 'video') {
        consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 }).catch(() => {});
      }
      // Sunucuda sağırlaştırılmışsa ses tüketicilerini duraklat (kimseyi duyamaz)
      if (consumer.kind === 'audio' && getVoiceState(ws.userId).deafen) {
        consumer.pause().catch(() => {});
      }
      send(ws, {
        type: 'consumed',
        replyTo: msg.id,
        payload: {
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        },
      });
      return;
    }

    case 'closeProducer': {
      // Kullanıcı kamera/ekran yayınını kapattı → producer'ı kapat + odadakilere bildir
      const peer = room.peers.get(ws.userId);
      const pid = msg.payload?.producerId;
      if (peer && pid) {
        peer.producers.get(pid)?.close();
        peer.producers.delete(pid);
        broadcast(wss, ws.channelId, ws.userId, {
          type: 'producerClosed',
          payload: { producerId: pid, userId: ws.userId },
        });
      }
      return;
    }

    case 'stageHand': {
      // Dinleyici konuşma istedi (el kaldır/indir) → odaya yay
      const raised = !!msg.payload?.raised;
      if (raised) room.stageHands.add(ws.userId);
      else room.stageHands.delete(ws.userId);
      broadcast(wss, ws.channelId, '', { type: 'stageHand', payload: { userId: ws.userId, raised } });
      return;
    }

    case 'stageSpeaker': {
      // Moderatör birini konuşmacı yaptı/dinleyiciye aldı → odaya yay
      // (yetki kontrolü istemci UI'da; voice server rol bilmez)
      const targetId = String(msg.payload?.userId ?? '');
      const isSpeaker = !!msg.payload?.isSpeaker;
      if (!targetId) return;
      if (isSpeaker) { room.stageSpeakers.add(targetId); room.stageHands.delete(targetId); }
      else room.stageSpeakers.delete(targetId);
      broadcast(wss, ws.channelId, '', { type: 'stageSpeaker', payload: { userId: targetId, isSpeaker } });
      return;
    }

    case 'leave': {
      room.removePeer(ws.userId);
      send(ws, { type: 'left', replyTo: msg.id });
      return;
    }

    default:
      send(ws, { type: 'error', replyTo: msg.id, payload: { message: 'unknown type ' + msg.type } });
  }
}

function send(ws: WebSocket, m: Message) {
  ws.send(JSON.stringify(m));
}

function broadcast(wss: WebSocketServer, channelId: string, exceptUserId: string, m: Message) {
  for (const client of wss.clients) {
    const c = client as AuthedSocket;
    if (c.readyState !== WebSocket.OPEN) continue;
    if (c.channelId !== channelId) continue;
    if (c.userId === exceptUserId) continue;
    send(c, m);
  }
}
