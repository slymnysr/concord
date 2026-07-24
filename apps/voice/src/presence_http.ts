// Voice presence için HTTP endpoint — web istemcisi sesli kanala katılmadan da
// hangi kullanıcının bağlı olduğunu öğrenebilsin diye.
import { config } from './config.js';
import { createServer } from 'node:http';
import { rooms, listPeers, setVoiceState, findUserRoom } from './room.js';
import { cluster } from './cluster.js';
import { handlePrepare, handleConsume } from './pipe.js';
import { broadcastToChannel } from './signaling.js';
import pino from 'pino';

const log = pino({ name: 'voice/http', level: 'info' });

// API ile paylaşılan gizli anahtar — control endpoint'ini korur
const CONTROL_SECRET = process.env.VOICE_CONTROL_SECRET ?? 'dev_voice_control_secret_change_me';

export function startHTTP() {
  const port = config.httpPort;
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
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 10000) req.destroy();
      });
      req.on('end', () => {
        try {
          const { user_id, mute, deafen, channel_id } = JSON.parse(body || '{}');
          if (!user_id) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'user_id gerekli' }));
          }
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

    const url = new URL(req.url, `http://localhost:${port}`);

    // --- Küme içi (node'lar arası) — dışarı açık DEĞİL, paylaşılan secret ister ---
    if (url.pathname.startsWith('/internal/')) {
      if (req.headers['x-voice-cluster-secret'] !== config.cluster.secret) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'unauthorized' }));
      }

      // Bu node'daki YEREL peer'lar (presence toplaması için)
      if (url.pathname === '/internal/peers') {
        const channels = (url.searchParams.get('channels') ?? '').split(',').filter(Boolean);
        const out: Record<string, { id: string; name: string }[]> = {};
        for (const c of channels) out[c] = listPeers(c);
        return res.end(JSON.stringify(out));
      }

      // Bu node'daki YEREL producer'lar (yeni katılan uzak node bunları pipe'lar)
      if (url.pathname === '/internal/producers') {
        const channelId = url.searchParams.get('channel') ?? '';
        return res.end(JSON.stringify(localProducers(channelId)));
      }

      if (req.method === 'POST') {
        return readBody(req, res, async (body) => {
          if (url.pathname === '/internal/pipe/prepare') return await handlePrepare(body);
          if (url.pathname === '/internal/pipe/consume') {
            return await handleConsume(body, (id) => findLocalProducer(body.channelId, id));
          }
          return null;
        });
      }

      res.statusCode = 404;
      return res.end('{}');
    }

    /**
     * Bölge listesi — istemci GERÇEK gecikmeyi ölçüp bölgesini seçsin.
     *
     * NEDEN IP'den tahmin etmiyoruz: geo-IP veritabanları VPN/mobil operatör/CGNAT
     * altında sıkça yanılır ve kullanıcıyı yanlış kıtaya yollar. İstemcinin kendi ping'i
     * gerçeği ölçer. `/sfu/select?region=` ile seçimini bildirir.
     */
    if (url.pathname === '/sfu/regions') {
      return listRegions()
        .then((r) => res.end(JSON.stringify(r)))
        .catch((e) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        });
    }

    // --- SFU seçici: istemci hangi node'a bağlanmalı? ---
    // Politika: ÖNCE o kanalı zaten barındıran node (gereksiz cascade açma), yoksa EN AZ
    // yüklü node. Sadece yüke bakmak aynı kanalı node'lara dağıtır → her yayın için pipe
    // kurulur, bant genişliği boşuna N katına çıkar.
    if (url.pathname === '/sfu/select') {
      const channelId = url.searchParams.get('channel') ?? '';
      const region = url.searchParams.get('region') ?? undefined;
      return selectNode(channelId, region)
        .then((n) => res.end(JSON.stringify(n)))
        .catch((e) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        });
    }

    // /presence?channels=id1,id2,id3 → her kanal için peer listesi
    // SÖZLEŞME SABİT: `{id,name}[]` (FAZ C). Çok-node'da yalnızca YEREL peer'ları dönmek
    // sözleşmeyi sessizce bozardı: istemci A node'una sorar, B'dekileri hiç göremez.
    if (url.pathname === '/presence') {
      const channels = (url.searchParams.get('channels') ?? '').split(',').filter(Boolean);
      return aggregatePresence(channels)
        .then((out) => res.end(JSON.stringify(out)))
        .catch((e) => {
          log.error({ err: String(e) }, 'presence toplanamadı');
          // Küme sorgusu patlarsa en azından yereli dön — boş dönmek "kimse yok" demek olurdu
          const out: Record<string, { id: string; name: string }[]> = {};
          for (const c of channels) out[c] = listPeers(c);
          res.end(JSON.stringify(out));
        });
    }

    res.statusCode = 404;
    res.end('{}');
  });

  server.listen(port, () => {
    log.info({ port }, 'voice HTTP listening');
  });
}

function readBody(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  fn: (body: any) => Promise<unknown>,
) {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    try {
      const out = await fn(raw ? JSON.parse(raw) : {});
      if (out === null) {
        res.statusCode = 404;
        return res.end('null');
      }
      res.end(JSON.stringify(out));
    } catch (e) {
      log.error({ err: String(e) }, 'küme içi istek başarısız');
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
}

function localProducers(channelId: string) {
  const room = rooms.get(channelId);
  if (!room) return [];
  const out: { producerId: string; userId: string; kind: string }[] = [];
  for (const peer of room.peers.values()) {
    for (const p of peer.producers.values()) {
      out.push({ producerId: p.id, userId: peer.id, kind: p.kind });
    }
  }
  return out;
}

function findLocalProducer(channelId: string, producerId: string) {
  const room = rooms.get(channelId);
  if (!room) return undefined;
  for (const peer of room.peers.values()) {
    const p = peer.producers.get(producerId);
    if (p) return p;
  }
  return undefined;
}

/** Kümedeki TÜM node'lardan peer listelerini topla (sözleşme: {id,name}[]). */
async function aggregatePresence(
  channels: string[],
): Promise<Record<string, { id: string; name: string }[]>> {
  const out: Record<string, { id: string; name: string }[]> = {};
  for (const c of channels) out[c] = listPeers(c);
  if (!cluster.enabled || channels.length === 0) return out;

  const nodes = (await cluster.liveNodes()).filter((n) => n.id !== cluster.nodeId);
  const results = await Promise.allSettled(
    nodes.map(async (n) => {
      const r = await fetch(
        `${n.httpUrl}/internal/peers?channels=${encodeURIComponent(channels.join(','))}`,
        {
          headers: { 'x-voice-cluster-secret': config.cluster.secret },
          signal: AbortSignal.timeout(3_000),
        },
      );
      if (!r.ok) throw new Error(`${n.id} → ${r.status}`);
      return (await r.json()) as Record<string, { id: string; name: string }[]>;
    }),
  );

  for (const res of results) {
    if (res.status !== 'fulfilled') {
      log.warn({ reason: String(res.reason) }, 'node presence vermedi — listesi eksik olabilir');
      continue;
    }
    for (const [c, peers] of Object.entries(res.value)) {
      const seen = new Set((out[c] ?? []).map((p) => p.id));
      out[c] = [...(out[c] ?? []), ...peers.filter((p) => !seen.has(p.id))];
    }
  }
  return out;
}

/** SFU seçici — kanalı zaten barındıran node önceliklidir, yoksa en az yüklü. */
/** Ayakta olan node'ların bölgeleri + her bölge için bir ping hedefi. */
async function listRegions(): Promise<{ region: string; nodes: number; probeUrl: string }[]> {
  if (!cluster.enabled) {
    return [
      { region: config.cluster.region, nodes: 1, probeUrl: config.cluster.httpUrl + '/health' },
    ];
  }
  const nodes = await cluster.liveNodes();
  const byRegion = new Map<string, { nodes: number; probeUrl: string }>();
  for (const n of nodes) {
    const cur = byRegion.get(n.region);
    if (cur) cur.nodes++;
    else byRegion.set(n.region, { nodes: 1, probeUrl: n.httpUrl + '/health' });
  }
  return [...byRegion.entries()].map(([region, v]) => ({ region, ...v }));
}

/**
 * SFU seçici — istemci hangi node'a bağlanmalı?
 *
 * POLİTİKA (sıra önemli):
 *  1. **BÖLGE** — istemcinin bölgesindeki node'lar. Uygulama global: Tokyo'daki kullanıcıyı
 *     Frankfurt'a bağlamak 250ms+ gecikme demek. Kanal başka bölgede olsa bile istemci KENDİ
 *     bölgesine bağlanır; cascade (FAZ C) node'lar arasını köprüler — zaten bunun için var.
 *  2. **Kanal yerelliği (bölge içinde)** — o bölgede kanalı zaten barındıran node varsa o.
 *     Aynı bölgede aynı kanal için ikinci node açmak gereksiz pipe + bant genişliği demek.
 *  3. **Yük** — kalanlar arasında en az yüklü.
 *
 * İstemci bölgesini bilmiyorsa `/sfu/regions`'tan listeyi alıp ping'leyebilir (gerçek
 * gecikme, tahmin değil). Bölge verilmezse yalnızca (2)+(3) uygulanır.
 */
async function selectNode(
  channelId: string,
  region?: string,
): Promise<{ nodeId: string; wsUrl: string; region: string; reason: string }> {
  const self = {
    nodeId: cluster.nodeId,
    wsUrl: config.cluster.wsUrl,
    region: config.cluster.region,
    reason: 'tek-node',
  };
  if (!cluster.enabled) return self;

  const hepsi = await cluster.liveNodes();
  if (hepsi.length === 0) return self;

  // 1) BÖLGE süzgeci — istemcinin bölgesinde node varsa YALNIZCA onlar değerlendirilir
  const bolgede = region ? hepsi.filter((n) => n.region === region) : [];
  const aday = bolgede.length > 0 ? bolgede : hepsi;
  const bolgeBulundu = bolgede.length > 0;

  if (channelId) {
    // 2) Kanal yerelliği — ama SADECE aday bölge içinde
    const barindiran = await cluster.remoteNodesFor(channelId);
    const yerel = rooms.get(channelId);
    if (yerel && yerel.peers.size > 0 && aday.some((n) => n.id === cluster.nodeId)) {
      return { ...self, reason: bolgeBulundu ? 'bolge+kanal-burada' : 'kanal-burada' };
    }
    const bolgedeBarindiran = barindiran.filter((n) => aday.some((a) => a.id === n.id));
    if (bolgedeBarindiran.length > 0) {
      const best = bolgedeBarindiran.reduce((a, b) => (a.load <= b.load ? a : b));
      return {
        nodeId: best.id,
        wsUrl: best.wsUrl,
        region: best.region,
        reason: bolgeBulundu ? 'bolge+kanal-orada' : 'kanal-orada',
      };
    }
  }

  // 3) En az yüklü (aday küme içinde)
  const least = aday.reduce((a, b) => (a.load <= b.load ? a : b));
  // Node'un KENDİ duyurduğu wsUrl kullanılır. Uzak adresi yerel porttan türetmek
  // (ws://<uzak-host>:<YEREL port>) portlar farklıysa istemciyi yanlış adrese yollar.
  return {
    nodeId: least.id,
    wsUrl: least.wsUrl,
    region: least.region,
    reason: bolgeBulundu ? 'bolge+en-az-yuklu' : region ? 'bolge-yok→en-az-yuklu' : 'en-az-yuklu',
  };
}
