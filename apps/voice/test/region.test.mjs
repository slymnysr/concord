// FAZ L testi — SES BÖLGE YÖNLENDİRME.
//
// İki AYRI bölgede (eu / ap) gerçek voice node process'i başlatır ve SFU seçicinin
// istemciyi KENDİ bölgesine yönlendirdiğini doğrular.
//
// NEDEN ÖNEMLİ: uygulama global. Bölge farkındalığı olmadan Tokyo'daki kullanıcı
// Frankfurt node'una düşebiliyordu (250ms+). Cascade (FAZ C) node'lar arasını zaten
// köprülüyor → istemci kendi bölgesine bağlanmalı.
//
// GEREKSİNİM: Redis (localhost:6379). Çalıştır: node test/region.test.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const kill = [];
function startNode(id, region, wsPort, httpPort, rtcMin, rtcMax) {
  const p = spawn('node', ['dist/index.js'], {
    cwd: '/home/slmnys/concord/apps/voice',
    env: {
      ...process.env,
      VOICE_CLUSTER_ENABLED: 'true',
      VOICE_NODE_ID: id,
      VOICE_REGION: region,
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
  kill.push(p);
  return p;
}

const get = (port, path) => fetch(`http://127.0.0.1:${port}${path}`).then((r) => r.json());
let basarisiz = 0;
function kontrol(ad, kosul, detay) {
  console.log(`  ${kosul ? '✓' : '✘'} ${ad}${kosul ? '' : '  → ' + detay}`);
  if (!kosul) basarisiz++;
}

async function main() {
  startNode('eu-1', 'eu-central', 6443, 6444, 42000, 42100);
  startNode('ap-1', 'ap-northeast', 6543, 6544, 42200, 42300);
  await sleep(8000);

  // 1) Bölgeler listeleniyor mu (istemci ping için kullanır)
  const regions = await get(6444, '/sfu/regions');
  const adlar = regions.map((r) => r.region).sort();
  kontrol(
    'iki bölge de listeleniyor',
    JSON.stringify(adlar) === '["ap-northeast","eu-central"]',
    JSON.stringify(regions),
  );

  // 2) ASIL SINAV: ap istemcisi ap node'una, eu istemcisi eu node'una
  const ap = await get(6444, '/sfu/select?channel=k1&region=ap-northeast');
  kontrol(
    "ap istemcisi ap node'una yönlendirildi",
    ap.nodeId === 'ap-1' && ap.region === 'ap-northeast',
    JSON.stringify(ap),
  );

  const eu = await get(6544, '/sfu/select?channel=k1&region=eu-central');
  kontrol(
    "eu istemcisi eu node'una yönlendirildi",
    eu.nodeId === 'eu-1' && eu.region === 'eu-central',
    JSON.stringify(eu),
  );

  // 3) Bilinmeyen bölge → düşer ama patlamaz
  const yok = await get(6444, '/sfu/select?channel=k1&region=sa-east');
  kontrol(
    'bilinmeyen bölge en-az-yüklüye düşüyor',
    !!yok.nodeId && yok.reason.includes('bolge-yok'),
    JSON.stringify(yok),
  );

  // 4) Bölge verilmezse eski davranış (kanal yerelliği + yük)
  const bolgesiz = await get(6444, '/sfu/select?channel=k1');
  kontrol(
    'bölge verilmezse yük tabanlı seçim',
    !!bolgesiz.nodeId && !bolgesiz.reason.includes('bolge'),
    JSON.stringify(bolgesiz),
  );

  for (const p of kill) p.kill('SIGTERM');
  await sleep(800);
  if (basarisiz) {
    console.error(`\nFAZ L SINAVI BAŞARISIZ (${basarisiz})`);
    process.exit(1);
  }
  console.log('\nFAZ L SINAVI GEÇTİ');
}
main().catch((e) => {
  console.error('HATA:', e.message);
  for (const p of kill) p.kill('SIGKILL');
  process.exit(1);
});
