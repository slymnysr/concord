// Voice küme kaydı — çok-makine cascade'in koordinasyon veriyolu (Redis).
//
// NEDEN: mediasoup `router.pipeToRouter()` yalnızca AYNI PROCESS içindeki router'ları
// bağlar. Çok-makinede her node ayrı process/makine olduğu için node'lar arası RTP
// köprüsü `PipeTransport` ile elle kurulur (bkz. pipe.ts). Bu modül "kim nerede" sorusunu
// yanıtlar: hangi node ayakta, hangi kanalda hangi node'ların peer'ı var, kim ne üretiyor.
//
// Redis seçildi çünkü yığında ZATEN var (API/Gateway kullanıyor) ve pubsub + TTL'li
// kayıt tam olarak gereken şey. Ayrı bir servis (etcd/consul) eklemek gereksiz yük olurdu.
import Redis from 'ioredis';
import pino from 'pino';
import { config } from './config.js';

const log = pino({ name: 'voice/cluster', level: 'info' });

export interface NodeInfo {
  id: string;
  /** Diğer node'ların pipe transport'u bağlarken kullanacağı IP (makineler arası erişilebilir) */
  pipeIp: string;
  /** Node'un iç HTTP adresi — pipe pazarlığı bu adres üzerinden yapılır */
  httpUrl: string;
  /** İstemcinin bu node'a bağlanacağı WS adresi. Node KENDİ adresini duyurur; başka
   *  node'un adresini yerel porttan türetmek yanlış porta yönlendirir (portlar aynı
   *  olmak zorunda değil — testte/karma kurulumda farklıdır). */
  wsUrl: string;
  /** Yük göstergesi: bu node'daki toplam peer sayısı (SFU seçici bunu kullanır) */
  load: number;
  ts: number;
}

const NODES_KEY = 'voice:nodes';
const nodeKey = (channelId: string) => `voice:channel:${channelId}:nodes`;
const eventsChannel = (channelId: string) => `voice:channel:${channelId}:events`;

/** Node kaydı TTL'i — bu süre boyunca heartbeat gelmezse node ölü sayılır. */
const NODE_TTL_MS = 15_000;
const HEARTBEAT_MS = 5_000;

export type ClusterEvent =
  | { type: 'producer:created'; channelId: string; nodeId: string; producerId: string; userId: string; kind: 'audio' | 'video' }
  | { type: 'producer:closed'; channelId: string; nodeId: string; producerId: string }
  | { type: 'peer:left'; channelId: string; nodeId: string; userId: string };

export class VoiceCluster {
  readonly nodeId = config.cluster.nodeId;
  private pub?: Redis;
  private sub?: Redis;
  private heartbeat?: NodeJS.Timeout;
  private handlers = new Set<(e: ClusterEvent) => void>();
  private subscribed = new Set<string>();

  get enabled(): boolean {
    return config.cluster.enabled;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      log.info('küme KAPALI (tek node) — VOICE_CLUSTER_ENABLED=true ile açılır');
      return;
    }
    this.pub = new Redis(config.cluster.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    this.sub = new Redis(config.cluster.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    await this.pub.connect();
    await this.sub.connect();

    this.sub.on('message', (_ch, raw) => {
      let ev: ClusterEvent;
      try {
        ev = JSON.parse(raw);
      } catch {
        return;
      }
      // Kendi olayımızı geri işlemeyelim (yoksa kendi producer'ımızı kendimize pipe'larız)
      if (ev.nodeId === this.nodeId) return;
      for (const h of this.handlers) h(ev);
    });

    await this.announce();
    this.heartbeat = setInterval(() => {
      this.announce().catch((e) => log.warn({ err: String(e) }, 'heartbeat başarısız'));
    }, HEARTBEAT_MS);

    log.info({ nodeId: this.nodeId, pipeIp: config.cluster.pipeIp }, 'voice kümesine katıldı');
  }

  async stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pub) {
      await this.pub.hdel(NODES_KEY, this.nodeId).catch(() => {});
      this.pub.disconnect();
    }
    this.sub?.disconnect();
  }

  /** Kendini kayda yaz (TTL yerine ts + tembel temizlik: hash alanları ayrı TTL alamaz). */
  private async announce(load = 0): Promise<void> {
    if (!this.pub) return;
    const info: NodeInfo = {
      id: this.nodeId,
      pipeIp: config.cluster.pipeIp,
      httpUrl: config.cluster.httpUrl,
      wsUrl: config.cluster.wsUrl,
      load,
      ts: Date.now(),
    };
    await this.pub.hset(NODES_KEY, this.nodeId, JSON.stringify(info));
  }

  setLoad(load: number): void {
    void this.announce(load);
  }

  /** Ayakta olan node'lar (ölüler tembelce temizlenir). */
  async liveNodes(): Promise<NodeInfo[]> {
    if (!this.pub) return [];
    const all = await this.pub.hgetall(NODES_KEY);
    const now = Date.now();
    const live: NodeInfo[] = [];
    const dead: string[] = [];
    for (const [id, raw] of Object.entries(all)) {
      try {
        const info: NodeInfo = JSON.parse(raw);
        if (now - info.ts > NODE_TTL_MS) dead.push(id);
        else live.push(info);
      } catch {
        dead.push(id);
      }
    }
    if (dead.length) await this.pub.hdel(NODES_KEY, ...dead);
    return live;
  }

  async nodeById(id: string): Promise<NodeInfo | undefined> {
    return (await this.liveNodes()).find((n) => n.id === id);
  }

  /** Bu node'un artık o kanalda peer'ı olduğunu duyur + kanal olaylarını dinlemeye başla. */
  async joinChannel(channelId: string): Promise<void> {
    if (!this.pub || !this.sub) return;
    await this.pub.sadd(nodeKey(channelId), this.nodeId);
    if (!this.subscribed.has(channelId)) {
      await this.sub.subscribe(eventsChannel(channelId));
      this.subscribed.add(channelId);
    }
  }

  /** Bu node'un o kanalda peer'ı kalmadı. */
  async leaveChannel(channelId: string): Promise<void> {
    if (!this.pub || !this.sub) return;
    await this.pub.srem(nodeKey(channelId), this.nodeId);
    if (this.subscribed.has(channelId)) {
      await this.sub.unsubscribe(eventsChannel(channelId));
      this.subscribed.delete(channelId);
    }
  }

  /** Kanalda peer'ı olan DİĞER node'lar. */
  async remoteNodesFor(channelId: string): Promise<NodeInfo[]> {
    if (!this.pub) return [];
    const ids = await this.pub.smembers(nodeKey(channelId));
    const live = await this.liveNodes();
    return live.filter((n) => n.id !== this.nodeId && ids.includes(n.id));
  }

  async publish(ev: ClusterEvent): Promise<void> {
    if (!this.pub) return;
    await this.pub.publish(eventsChannel(ev.channelId), JSON.stringify(ev));
  }

  onEvent(h: (e: ClusterEvent) => void): void {
    this.handlers.add(h);
  }
}

export const cluster = new VoiceCluster();
