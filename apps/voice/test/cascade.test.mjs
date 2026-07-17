// FAZ C entegrasyon testi — ÇOK-MAKİNE CASCADE.
//
// İki AYRI voice node PROCESS'i başlatır (gerçek küme: ayrı mediasoup worker'ları, ayrı
// RTP port aralıkları, Redis üzerinden koordinasyon) ve A'daki producer'ın B'ye pipe ile
// geçtiğini doğrular. Tarayıcı gerekmez — cascade'in sinyalleşme ve pipe yolu birebir aynı.
//
// GEREKSİNİM: Redis (localhost:6379). Çalıştır: node test/cascade.test.mjs
//
// NOT: bunlar Playwright süitinde değil çünkü voice'un KENDİ küme davranışını sınıyor
// (uygulama uçtan uca değil) ve 2 process + Redis gerektiriyor.
// Iki node'a birer WS peer baglanir. A'daki peer produce eder; B'deki peer'in
// "newProducer" bildirimi alip alamadigina ve B'nin router'inda pipe producer olusup
// olusmadigina bakariz.
// NOT: 'ws' ve 'jsonwebtoken' PAKET ADIYLA import edilir — mutlak yerel yol (/home/...)
// gömmek testi yalnızca benim makinemde çalışır kılıyordu; CI'da ERR_MODULE_NOT_FOUND.
// İkisi de apps/voice'un kendi bağımlılığı, çözümleme buradan yapılır.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Paket kökü test dosyasından TÜRETİLİR. Sabit yol (/home/...) gömmek testi yalnızca
// tek bir makinede çalışır kılar — CI'da bu dizin yok.
const VOICE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

const SECRET_JWT = 'dev_jwt_secret_change_in_prod_at_least_32_chars';
const kill = [];

function startNode(id, wsPort, httpPort, rtcMin, rtcMax) {
  const p = spawn('node', ['dist/index.js'], {
    cwd: VOICE_DIR,
    env: {
      ...process.env,
      VOICE_CLUSTER_ENABLED: 'true',
      VOICE_NODE_ID: id,
      VOICE_PORT: String(wsPort),
      VOICE_HTTP_PORT: String(httpPort),
      VOICE_HTTP_URL: `http://127.0.0.1:${httpPort}`,
      VOICE_WS_URL: `ws://127.0.0.1:${wsPort}`,
      VOICE_PIPE_IP: '127.0.0.1',
      MS_RTC_MIN_PORT: String(rtcMin),
      MS_RTC_MAX_PORT: String(rtcMax),
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  p.stdout.on('data', (d) => logs.push(d.toString()));
  p.stderr.on('data', (d) => logs.push(d.toString()));
  kill.push(p);
  return { logs };
}

const token = (uid, name) =>
  jwt.sign({ sub: String(uid), name, iss: 'concord-api' }, SECRET_JWT, { expiresIn: '15m' });

function connect(port, uid, name, channel) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token(uid, name)}&channel=${channel}`);
  const events = [];
  const replies = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    events.push(m);
    if (m.replyTo && replies.has(m.replyTo)) {
      replies.get(m.replyTo)(m);
      replies.delete(m.replyTo);
    }
  });
  const rpc = (type, payload) =>
    new Promise((res, rej) => {
      const id = Math.random().toString(36).slice(2);
      replies.set(id, res);
      ws.send(JSON.stringify({ id, type, payload }));
      setTimeout(() => rej(new Error(`${type} zaman asimi`)), 8000);
    });
  const open = new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
  return { ws, events, rpc, open };
}

async function main() {
  const A = startNode('nodeA', 5443, 5444, 41000, 41100);
  const B = startNode('nodeB', 5543, 5544, 41200, 41300);
  await sleep(8000);
  const CH = 'kanal-cascade';

  const a = connect(5443, 111, 'Ayse', CH);
  const b = connect(5543, 222, 'Bora', CH);
  await Promise.all([a.open, b.open]);
  await a.rpc('join', {});
  await b.rpc('join', {});
  await sleep(1500);

  // A'daki peer bir AUDIO producer olustursun (PlainTransport degil: gercek akis icin
  // WebRtcTransport gerekir ama produce cagrisi RTP akmadan da producer yaratir)
  const caps = await a.rpc('getRouterRtpCapabilities', {});
  const tr = await a.rpc('createWebRtcTransport', { direction: 'send' });
  const opus = caps.payload.codecs.find((c) => c.mimeType.toLowerCase() === 'audio/opus');
  const produced = await a.rpc('produce', {
    kind: 'audio',
    rtpParameters: {
      mid: '0',
      codecs: [
        {
          mimeType: 'audio/opus',
          payloadType: opus.preferredPayloadType,
          clockRate: 48000,
          channels: 2,
          parameters: {},
          rtcpFeedback: [],
        },
      ],
      headerExtensions: [],
      encodings: [{ ssrc: 11111111 }],
      rtcp: { cname: 'test' },
    },
    appData: { source: 'mic' },
  });
  const pid = produced.payload?.id;
  console.log('A produce etti, producerId =', pid);

  await sleep(4000);

  // B'deki peer "newProducer" bildirimi aldi mi?
  const bGot = b.events.filter((e) => e.type === 'newProducer').map((e) => e.payload.producerId);
  console.log('B nin aldigi newProducer bildirimleri:', JSON.stringify(bGot));

  const pipedOnB = A.logs.join('') + B.logs.join('');
  const pipeKuruldu =
    pipedOnB.includes('pipe link kuruldu') || pipedOnB.includes('pipe link kabul edildi');
  const pipeAlindi = pipedOnB.includes('uzak producer pipe ile alındı');

  // B'deki peer, pipe ile gelen UZAK producer'i GERCEKTEN consume edebiliyor mu?
  // "Producer B'nin router'inda var" yetmez: ses akisinin B'deki kullaniciya ulasmasi
  // icin B'nin o producer'dan CONSUMER uretebilmesi gerekir. Bu, cascade'in ses tasima
  // yolunu PROTOKOL uzerinden dogrular (metadata degil, gercek consumer + rtpParameters).
  let consumeSonuc = null;
  try {
    const bCaps = await b.rpc('getRouterRtpCapabilities', {});
    await b.rpc('createWebRtcTransport', { direction: 'recv' });
    const consumed = await b.rpc('consume', { producerId: pid, rtpCapabilities: bCaps.payload });
    consumeSonuc = consumed;
  } catch (e) {
    consumeSonuc = { error: e.message };
  }
  const consumeOk =
    consumeSonuc &&
    consumeSonuc.type === 'consumed' &&
    consumeSonuc.payload?.producerId === pid &&
    consumeSonuc.payload?.kind === 'audio' &&
    Array.isArray(consumeSonuc.payload?.rtpParameters?.codecs) &&
    consumeSonuc.payload.rtpParameters.codecs.length > 0;

  console.log('\n=== SONUC ===');
  console.log('pipe link kuruldu :', pipeKuruldu);
  console.log('uzak producer pipe ile alindi :', pipeAlindi);
  console.log('B producer i gordu :', bGot.includes(pid));
  console.log(
    'B UZAK producer i CONSUME edebildi :',
    consumeOk,
    consumeOk
      ? '(codec: ' + consumeSonuc.payload.rtpParameters.codecs[0].mimeType + ')'
      : JSON.stringify(consumeSonuc)?.slice(0, 120),
  );

  // SOZLESME: /presence {id,name}[] — cok-node'da HER IKI node'un peer'lari gorunmeli
  const presA = await fetch(`http://127.0.0.1:5444/presence?channels=${CH}`).then((r) => r.json());
  const presB = await fetch(`http://127.0.0.1:5544/presence?channels=${CH}`).then((r) => r.json());
  const idsA = (presA[CH] ?? []).map((p) => p.id).sort();
  const idsB = (presB[CH] ?? []).map((p) => p.id).sort();
  console.log('A nodundan /presence :', JSON.stringify(presA[CH]));
  console.log('B nodundan /presence :', JSON.stringify(presB[CH]));
  const bekleniyor = ['111', '222'];
  console.log(
    'presence her iki node u da gosteriyor :',
    JSON.stringify(idsA) === JSON.stringify(bekleniyor) &&
      JSON.stringify(idsB) === JSON.stringify(bekleniyor),
  );
  if (!pipeAlindi) {
    console.log('\n--- pipe/cascade loglari ---');
    console.log(
      pipedOnB
        .split('\n')
        .filter((l) => /pipe|cascade|cluster/.test(l))
        .slice(-8)
        .join('\n'),
    );
  }

  const basarili =
    pipeKuruldu &&
    pipeAlindi &&
    bGot.includes(pid) &&
    consumeOk &&
    JSON.stringify(idsA) === JSON.stringify(bekleniyor) &&
    JSON.stringify(idsB) === JSON.stringify(bekleniyor);

  a.ws.close();
  b.ws.close();
  for (const p of kill) p.kill('SIGTERM');
  await sleep(800);
  if (!basarili) {
    console.error('\nFAZ C SINAVI BASARISIZ');
    process.exit(1);
  }
  console.log('\nFAZ C SINAVI GECTI');
}
main().catch(async (e) => {
  console.error('HATA:', e.message);
  for (const p of kill) p.kill('SIGKILL');
  process.exit(1);
});
