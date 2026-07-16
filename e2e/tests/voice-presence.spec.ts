import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, createGuild, guildChannels } from './helpers';
import WebSocket from 'ws';

const VOICE_WS = process.env.E2E_VOICE_WS ?? 'ws://localhost:4443';
const VOICE_HTTP = process.env.E2E_VOICE_HTTP ?? 'http://localhost:4444';

/** Voice sinyalleşmesine bağlanıp kanala katılır; bağlantıyı açık tutar (presence peer'ı). */
async function joinVoice(token: string, channelId: string): Promise<WebSocket> {
  // NOT: sorgu parametresi `channel` (signaling.ts); `channelId` sessizce 4001 ile kapatılır
  const ws = new WebSocket(`${VOICE_WS}/?token=${encodeURIComponent(token)}&channel=${channelId}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
    // Sunucu upgrade'i kabul edip HEMEN kapatabilir (auth/param hatası) → open yanıltıcı
    ws.once('close', (code: number, reason: Buffer) =>
      reject(new Error(`voice WS kapandı: ${code} ${reason.toString()}`)));
    setTimeout(() => reject(new Error('voice WS bağlantısı zaman aşımı')), 10_000);
  });
  ws.removeAllListeners('close');
  ws.send(JSON.stringify({ id: 'j1', type: 'join' }));
  await new Promise((r) => setTimeout(r, 1000));
  return ws;
}

test.describe('Ses presence sözleşmesi', () => {
  /**
   * REGRESYON — elle testte bulundu: kanala katılan kullanıcının adı kanalın altında
   * "yükleniyor..." olarak asılı kalıyordu. İki ayrı sebebi vardı:
   *   1. Voice sunucusu adı hiç bilmiyordu (JWT'de name yoktu, addPeer ad almıyordu).
   *   2. Snowflake ID'ler JWT'de sayı olarak taşınıyordu → JS Number 53-bit'te yuvarlıyor,
   *      ID eşleşmediği için istemci adı çözemiyordu.
   * Bu test ikisini birden sabitler.
   */
  test('/presence peer\'ı ID + AD ile döner (ad "yükleniyor" değil, ID string)', async ({ request }) => {
    const u = makeUser('vp');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-V ${Date.now()}`);
    const channels = await guildChannels(request, token, guild.id);
    const voice = channels.find((c: any) => c.type === 'voice');
    expect(voice, 'ses kanalı bulunamadı').toBeTruthy();

    const ws = await joinVoice(token, voice.id);
    try {
      const r = await request.get(`${VOICE_HTTP}/presence?channels=${voice.id}`);
      expect(r.ok()).toBeTruthy();
      const body = await r.json();
      const peers = body[voice.id];

      expect(peers, 'kanalda peer listesi yok').toBeTruthy();
      expect(peers.length, 'katılan kullanıcı presence\'ta görünmüyor').toBe(1);
      expect(peers[0].name, 'peer ADI eksik → UI "yükleniyor..." gösterir').toBe(u.displayName);
      // Snowflake ID'ler 64-bit; JS Number 53-bit tutar → JSON'da STRING olmalı
      expect(typeof peers[0].id, 'peer ID string olmalı (Snowflake hassasiyeti)').toBe('string');
      expect(peers[0].id, 'ID yuvarlanmış (…00 ile bitiyor) — precision kaybı').not.toMatch(/00$/);
    } finally {
      ws.close();
    }
  });

  test('ayrılan kullanıcı presence\'tan düşer', async ({ request }) => {
    const u = makeUser('vl');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-VL ${Date.now()}`);
    const channels = await guildChannels(request, token, guild.id);
    const voice = channels.find((c: any) => c.type === 'voice');

    const ws = await joinVoice(token, voice.id);
    let r = await request.get(`${VOICE_HTTP}/presence?channels=${voice.id}`);
    expect((await r.json())[voice.id].length).toBe(1);

    ws.close();
    await new Promise((res) => setTimeout(res, 1500));

    r = await request.get(`${VOICE_HTTP}/presence?channels=${voice.id}`);
    expect((await r.json())[voice.id].length, 'bağlantı kapandı ama peer presence\'ta kaldı (hayalet)').toBe(0);
  });
});
