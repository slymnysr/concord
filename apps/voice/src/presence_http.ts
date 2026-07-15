// Voice presence için HTTP endpoint — web istemcisi sesli kanala katılmadan da
// hangi kullanıcının bağlı olduğunu öğrenebilsin diye.
import { createServer } from 'node:http';
import { listPeers, setVoiceState, findUserRoom } from './room.js';
import { broadcastToChannel } from './signaling.js';
import pino from 'pino';

const log = pino({ name: 'voice/http', level: 'info' });

// API ile paylaşılan gizli anahtar — control endpoint'ini korur
const CONTROL_SECRET = process.env.VOICE_CONTROL_SECRET ?? 'dev_voice_control_secret_change_me';

export function startHTTP() {
  const port = parseInt(process.env.VOICE_HTTP_PORT ?? '4444', 10);
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (!req.url) {
      res.statusCode = 404;
      return res.end('{}');
    }

    if (req.url === '/health') {
      return res.end(JSON.stringify({ status: 'ok', service: 'concord-voice' }));
    }

    // POST /control/voice-state — API'den gelen mod susturma/sağırlaştırma komutu (enforced)
    if (req.method === 'POST' && req.url === '/control/voice-state') {
      if (req.headers['x-voice-secret'] !== CONTROL_SECRET) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: 'forbidden' }));
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; if (body.length > 10000) req.destroy(); });
      req.on('end', () => {
        try {
          const { user_id, mute, deafen, channel_id } = JSON.parse(body || '{}');
          if (!user_id) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'user_id gerekli' })); }
          const next = setVoiceState(String(user_id), {
            mute: typeof mute === 'boolean' ? mute : undefined,
            deafen: typeof deafen === 'boolean' ? deafen : undefined,
          });
          // Odadaki herkese yayınla (hedef istemci + UI ikonları güncellensin)
          const room = findUserRoom(String(user_id));
          const cid = room?.channelId ?? (channel_id ? String(channel_id) : null);
          if (cid) {
            broadcastToChannel(cid, {
              type: 'voiceState',
              payload: { userId: String(user_id), serverMute: next.mute, serverDeaf: next.deafen },
            });
          }
          res.end(JSON.stringify({ ok: true, state: next }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    // /presence?channels=id1,id2,id3 → her kanal için peer listesi
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/presence') {
      const channels = (url.searchParams.get('channels') ?? '').split(',').filter(Boolean);
      const out: Record<string, { id: string; name: string }[]> = {};
      for (const c of channels) out[c] = listPeers(c);
      return res.end(JSON.stringify(out));
    }

    res.statusCode = 404;
    res.end('{}');
  });

  server.listen(port, () => {
    log.info({ port }, 'voice HTTP listening');
  });
}
