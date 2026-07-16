// Node'lar arası mediasoup RTP köprüsü (cascade'in kalbi).
//
// NEDEN ELLE: `router.pipeToRouter({ router })` yalnızca AYNI PROCESS'teki router'ları
// bağlar — çok-makinede karşı router başka bir makinede olduğu için kullanılamaz.
// mediasoup'un çok-makine yolu: iki tarafta da `createPipeTransport`, sonra birbirinin
// ip/port (+ SRTP) bilgisiyle `connect`, ardından bir tarafta `consume` / diğerinde
// `produce`. Bu modül o el sıkışmayı ve pipe'ların ömrünü yönetir.
//
// TASARIM: pipe'lar (channelId, remoteNodeId) çiftine göre TEK SEFER kurulur ve tekrar
// kullanılır. Her producer için yeni pipe açmak port aralığını hızla tüketirdi.
import type { types as msTypes } from 'mediasoup';
import pino from 'pino';
import { getRouter } from './mediasoup.js';
import { config } from './config.js';
import { cluster, type NodeInfo } from './cluster.js';

const log = pino({ name: 'voice/pipe', level: 'info' });

interface PipeLink {
  transport: msTypes.PipeTransport;
  /** Bu link üzerinden karşıdan alınıp yerelde yayımlanan producer'lar: remoteProducerId → local pipe producer */
  producers: Map<string, msTypes.Producer>;
}

/** key: `${channelId}|${remoteNodeId}` */
const links = new Map<string, PipeLink>();
const linkKey = (channelId: string, remoteNodeId: string) => `${channelId}|${remoteNodeId}`;

/** Yerel pipe transport oluştur (karşı node'un bağlanacağı uç). */
export async function createLocalPipe(channelId: string): Promise<{
  transport: msTypes.PipeTransport;
  ip: string;
  port: number;
  srtpParameters?: msTypes.SrtpParameters;
}> {
  const router = await getRouter(channelId);
  const transport = await router.createPipeTransport({
    listenIp: { ip: '0.0.0.0', announcedIp: config.cluster.pipeIp },
    // SRTP: node'lar arası RTP genelde güvenilmeyen ağdan geçer (farklı makineler,
    // hatta farklı AZ'ler) → şifresiz taşımak sesin ağda açık akması demek olurdu.
    enableSrtp: true,
    enableRtx: true,
  });
  return {
    transport,
    ip: transport.tuple.localIp,
    port: transport.tuple.localPort,
    srtpParameters: transport.srtpParameters,
  };
}

/**
 * Uzak node'a giden link'i getir/kur. İki taraf da PipeTransport açar ve birbirine bağlanır.
 * Kurulum yalnızca BİR kez yapılır (channelId+remoteNodeId başına).
 */
export async function ensureLink(channelId: string, remote: NodeInfo): Promise<PipeLink> {
  const key = linkKey(channelId, remote.id);
  const existing = links.get(key);
  if (existing) return existing;

  // 1) Yerel ucu aç
  const local = await createLocalPipe(channelId);

  // 2) Karşıdan kendi ucunu açmasını iste; bize ip/port/srtp döner
  const remoteSide = await callRemote<{ ip: string; port: number; srtpParameters?: msTypes.SrtpParameters }>(
    remote,
    '/internal/pipe/prepare',
    { channelId, remoteNodeId: cluster.nodeId, localIp: local.ip, localPort: local.port, srtpParameters: local.srtpParameters },
  );

  // 3) Yerel ucu karşıya bağla
  await local.transport.connect({
    ip: remoteSide.ip,
    port: remoteSide.port,
    srtpParameters: remoteSide.srtpParameters,
  });

  const link: PipeLink = { transport: local.transport, producers: new Map() };
  links.set(key, link);
  log.info({ channelId, remoteNodeId: remote.id, ip: remoteSide.ip, port: remoteSide.port }, 'pipe link kuruldu');
  return link;
}

/**
 * Karşı node'un `prepare` isteğini karşılar: yerel uç açar, karşının ucuna bağlanır,
 * kendi ip/port/srtp'sini döner. (İki taraf simetrik: her iki uç da connect eder.)
 */
export async function handlePrepare(params: {
  channelId: string;
  remoteNodeId: string;
  localIp: string;
  localPort: number;
  srtpParameters?: msTypes.SrtpParameters;
}): Promise<{ ip: string; port: number; srtpParameters?: msTypes.SrtpParameters }> {
  const key = linkKey(params.channelId, params.remoteNodeId);
  const existing = links.get(key);
  if (existing) {
    return {
      ip: existing.transport.tuple.localIp,
      port: existing.transport.tuple.localPort,
      srtpParameters: existing.transport.srtpParameters,
    };
  }

  const local = await createLocalPipe(params.channelId);
  await local.transport.connect({
    ip: params.localIp,
    port: params.localPort,
    srtpParameters: params.srtpParameters,
  });
  links.set(key, { transport: local.transport, producers: new Map() });
  log.info({ channelId: params.channelId, remoteNodeId: params.remoteNodeId }, 'pipe link kabul edildi');
  return { ip: local.ip, port: local.port, srtpParameters: local.srtpParameters };
}

/**
 * Uzak node'daki bir producer'ı bu node'a taşı: karşıda pipeConsumer aç, burada aynı
 * id ile pipeProducer yayımla. Böylece yerel peer'lar onu normal bir producer gibi consume eder.
 */
export async function pipeInRemoteProducer(
  channelId: string,
  remote: NodeInfo,
  producerId: string,
  userId?: string,
): Promise<msTypes.Producer | undefined> {
  const link = await ensureLink(channelId, remote);
  if (link.producers.has(producerId)) return link.producers.get(producerId);

  // Karşı node kendi ucunda consume etsin ve RTP parametrelerini versin
  const res = await callRemote<{
    kind: msTypes.MediaKind;
    rtpParameters: msTypes.RtpParameters;
    paused: boolean;
  } | null>(remote, '/internal/pipe/consume', { channelId, remoteNodeId: cluster.nodeId, producerId });

  if (!res) {
    log.warn({ channelId, producerId, remoteNodeId: remote.id }, 'uzak producer bulunamadı (kapanmış olabilir)');
    return undefined;
  }

  const producer = await link.transport.produce({
    id: producerId, // AYNI id: yerel peer'lar uzak producer'ı aynı kimlikle görür
    kind: res.kind,
    rtpParameters: res.rtpParameters,
    paused: res.paused,
    // userId appData'da taşınır: katılan peer'a "bu yayın kimin" diyebilmek için
    // (yerel peers map'inde o kullanıcı YOK — başka node'da)
    appData: { userId, remoteNodeId: remote.id, piped: true },
  });
  link.producers.set(producerId, producer);
  log.info({ channelId, producerId, remoteNodeId: remote.id, kind: res.kind }, 'uzak producer pipe ile alındı');
  return producer;
}

/** Karşı node'un `consume` isteğini karşılar: yerel producer'ı pipe üzerinden ona ver. */
export async function handleConsume(
  params: { channelId: string; remoteNodeId: string; producerId: string },
  findProducer: (id: string) => msTypes.Producer | undefined,
): Promise<{ kind: msTypes.MediaKind; rtpParameters: msTypes.RtpParameters; paused: boolean } | null> {
  const producer = findProducer(params.producerId);
  if (!producer) return null;

  const key = linkKey(params.channelId, params.remoteNodeId);
  const link = links.get(key);
  if (!link) return null;

  const consumer = await link.transport.consume({ producerId: params.producerId });
  return {
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
    paused: consumer.producerPaused,
  };
}

/** Uzak producer kapandı → yerel aynası da kapatılmalı (yoksa hayalet ses/görüntü kalır). */
export function closePipedProducer(channelId: string, remoteNodeId: string, producerId: string): void {
  const link = links.get(linkKey(channelId, remoteNodeId));
  const p = link?.producers.get(producerId);
  if (p) {
    p.close();
    link!.producers.delete(producerId);
    log.info({ channelId, producerId }, 'pipe producer kapatıldı');
  }
}

/** Kanal bu node'da tamamen boşaldı → linkleri kapat (port sızıntısı olmasın). */
export function closeChannelLinks(channelId: string): void {
  for (const [key, link] of links.entries()) {
    if (!key.startsWith(`${channelId}|`)) continue;
    for (const p of link.producers.values()) p.close();
    link.transport.close();
    links.delete(key);
  }
}

/** Yerelde pipe ile alınmış producer'lar (yerel peer'ların consume edebilmesi için). */
export function pipedProducersFor(channelId: string): { producer: msTypes.Producer; userId: string }[] {
  const out: { producer: msTypes.Producer; userId: string }[] = [];
  for (const [key, link] of links.entries()) {
    if (!key.startsWith(`${channelId}|`)) continue;
    for (const p of link.producers.values()) {
      out.push({ producer: p, userId: String((p.appData as { userId?: string }).userId ?? '') });
    }
  }
  return out;
}

async function callRemote<T>(remote: NodeInfo, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${remote.httpUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-voice-cluster-secret': config.cluster.secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${remote.id}${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
