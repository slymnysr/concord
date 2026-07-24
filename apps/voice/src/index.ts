import { initWorker } from './mediasoup.js';
import { startSignaling } from './signaling.js';
import { startHTTP } from './presence_http.js';
import { cluster } from './cluster.js';
import { initCascade } from './cascade.js';
import { config } from './config.js';
import pino from 'pino';

const log = pino({ name: 'voice', level: 'info' });

async function main() {
  await initWorker();
  // Küme ÖNCE: sinyalleşme açılmadan kayıt/abonelik hazır olmalı, yoksa açılış anında
  // katılan ilk peer'ın uzak producer senkronu boş küme görür.
  await cluster.start();
  initCascade();
  startSignaling();
  startHTTP();
  log.info({ nodeId: cluster.nodeId, cluster: config.cluster.enabled }, 'concord-voice ready');
}

// Kapanışta küme kaydından çık: yapmazsak diğer node'lar bu node'u TTL dolana kadar
// ayakta sanıp ona pipe kurmaya çalışır.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    cluster.stop().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  log.error({ err: String(err) }, 'fatal');
  process.exit(1);
});
