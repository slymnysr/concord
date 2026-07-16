import { test, expect } from '@playwright/test';
import {
  makeUser,
  registerViaApi,
  seedSession,
  createGuild,
  guildChannels,
  sendMessage,
  API,
} from './helpers';

test.describe('Mesajlaşma + realtime', () => {
  test('mesaj gönderilir, realtime düşer, düzenleme/silme canlı yansır', async ({
    page,
    request,
  }) => {
    const alice = makeUser('alice');
    const bob = makeUser('bob');
    const aliceToken = await registerViaApi(request, alice);
    const bobToken = await registerViaApi(request, bob);

    // Alice sunucu açar, Bob davetle katılır
    const guild = await createGuild(request, aliceToken, `E2E ${Date.now()}`);
    const inv = await request.post(`${API}/api/v1/guilds/${guild.id}/invites`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
      data: {},
    });
    const { code } = await inv.json();
    const join = await request.post(`${API}/api/v1/invites/${code}/accept`, {
      headers: { Authorization: `Bearer ${bobToken}` },
    });
    expect(join.ok()).toBeTruthy();

    const channels = await guildChannels(request, aliceToken, guild.id);
    const text = channels.find((c: any) => c.type === 'text');
    expect(text, 'metin kanalı bulunamadı').toBeTruthy();

    // Alice UI'da kanalı açar
    await seedSession(page, request, alice);
    await page.getByRole('button', { name: text.name, exact: true }).first().click();

    // 1) UI'dan mesaj gönderme
    const own = `E2E-KENDI-${Date.now()}`;
    await page.getByRole('textbox', { name: /kanalına yaz|Message #/i }).fill(own);
    await page.keyboard.press('Enter');
    await expect(page.getByText(own)).toBeVisible({ timeout: 10_000 });

    // 2) REALTIME: Bob API'den yazar → Alice'in ekranına YENİLEMEDEN düşmeli
    const rt = `E2E-REALTIME-${Date.now()}`;
    const msg = await sendMessage(request, bobToken, text.id, rt);
    await expect(page.getByText(rt)).toBeVisible({ timeout: 10_000 });

    // 3) MESSAGE_UPDATE canlı
    const edited = `${rt}-DUZENLENDI`;
    const up = await request.patch(`${API}/api/v1/messages/${msg.id}`, {
      headers: { Authorization: `Bearer ${bobToken}` },
      data: { content: edited },
    });
    expect(up.ok()).toBeTruthy();
    await expect(page.getByText(edited)).toBeVisible({ timeout: 10_000 });

    // 4) MESSAGE_DELETE canlı
    const del = await request.delete(`${API}/api/v1/messages/${msg.id}`, {
      headers: { Authorization: `Bearer ${bobToken}` },
    });
    expect(del.ok()).toBeTruthy();
    await expect(page.getByText(edited)).toBeHidden({ timeout: 10_000 });
  });

  test('reactions mesaj listesinde GÖMÜLÜ gelir (N+1 yok)', async ({ request }) => {
    // FAZ A sözleşmesi (API-KONTRAT.md): mesaj listesi reactions'ı gömülü döndürür.
    const u = makeUser('react');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-R ${Date.now()}`);
    const channels = await guildChannels(request, token, guild.id);
    const text = channels.find((c: any) => c.type === 'text');

    const msg = await sendMessage(request, token, text.id, 'tepki testi');
    const add = await request.put(
      `${API}/api/v1/messages/${msg.id}/reactions/${encodeURIComponent('🔥')}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(add.ok()).toBeTruthy();

    const list = await request.get(`${API}/api/v1/channels/${text.id}/messages?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msgs = await list.json();
    const found = msgs.find((m: any) => m.id === msg.id);
    expect(found, 'mesaj listede yok').toBeTruthy();
    expect(found.reactions, 'reactions GÖMÜLÜ gelmeliydi (N+1 fix)').toBeTruthy();
    expect(found.reactions[0].emoji).toBe('🔥');
    expect(found.reactions[0].count).toBe(1);
    expect(found.reactions[0].me).toBe(true);
  });

  /**
   * REGRESYON — elle testte bulundu: mesajlar TEK YÖNLÜ düşüyordu. Linux web'den atılan
   * Chrome'a anında geliyordu, ama Chrome'dan atılan Linux'a gelmiyordu (sayfa yenilemek
   * gerekiyordu). Tek tarayıcı + API'den enjekte eden test bunu KAÇIRIR; iki gerçek istemci şart.
   */
  test('realtime ÇİFT YÖNLÜ: iki tarayıcı birbirinin mesajını yenilemeden görür', async ({
    browser,
    request,
  }) => {
    const alice = makeUser('rta');
    const bob = makeUser('rtb');
    const aliceToken = await registerViaApi(request, alice);
    const bobToken = await registerViaApi(request, bob);

    const guild = await createGuild(request, aliceToken, `E2E-RT ${Date.now()}`);
    const inv = await request.post(`${API}/api/v1/guilds/${guild.id}/invites`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
      data: {},
    });
    const { code } = await inv.json();
    expect(
      (
        await request.post(`${API}/api/v1/invites/${code}/accept`, {
          headers: { Authorization: `Bearer ${bobToken}` },
        })
      ).ok(),
    ).toBeTruthy();

    const channels = await guildChannels(request, aliceToken, guild.id);
    const text = channels.find((c: any) => c.type === 'text');

    // İki AYRI tarayıcı bağlamı = iki gerçek istemci, iki ayrı WS
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();
      await seedSession(pageA, request, alice);
      await seedSession(pageB, request, bob);
      for (const p of [pageA, pageB]) {
        await p.getByRole('button', { name: text.name, exact: true }).first().click();
      }

      const box = /kanalına yaz|Message #/i;

      // A → B
      const fromA = `A-DAN-${Date.now()}`;
      await pageA.getByRole('textbox', { name: box }).fill(fromA);
      await pageA.keyboard.press('Enter');
      await expect(pageB.getByText(fromA), 'A→B yönü düşmedi').toBeVisible({ timeout: 10_000 });

      // B → A  (elle testte KIRIK olan yön)
      const fromB = `B-DEN-${Date.now()}`;
      await pageB.getByRole('textbox', { name: box }).fill(fromB);
      await pageB.keyboard.press('Enter');
      await expect(
        pageA.getByText(fromB),
        'B→A yönü düşmedi — tek yönlü realtime geri geldi',
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
