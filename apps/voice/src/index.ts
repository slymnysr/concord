import { initWorker } from './mediasoup.js';
import { startSignaling } from './signaling.js';
import { startHTTP } from './presence_http.js';
import pino from 'pino';

const log = pino({ name: 'voice', level: 'info' });

async function main() {
  await initWorker();
  startSignaling();
  startHTTP();
  log.info('concord-voice ready');
}

main().catch((err) => {
  log.error({ err: String(err) }, 'fatal');
  process.exit(1);
});
