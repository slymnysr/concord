import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, seedSession, createGuild, guildChannels, API } from './helpers';

test.describe('Kanal CRUD', () => {
  test('kanal oluşturulur, listelenir, yeniden adlandırılır, silinir (API sözleşmesi)', async ({ request }) => {
    const u = makeUser('chan');
    const token = await registerViaApi(request, u);
    const auth = { Authorization: `Bearer ${token}` };
    const guild = await createGuild(request, token, `E2E-C ${Date.now()}`);

    // CREATE
    const created = await request.post(`${API}/api/v1/channels`, {
      headers: auth,
      data: { guild_id: guild.id, name: 'e2e-kanal', type: 'text' },
    });
    expect(created.ok(), `kanal oluşturulamadı: ${created.status()} ${await created.text()}`).toBeTruthy();
    const ch = await created.json();
    expect(typeof ch.id, 'kanal ID string olmalı (Snowflake hassasiyeti)').toBe('string');

    // READ
    let list = await guildChannels(request, token, guild.id);
    expect(list.some((c: any) => c.id === ch.id), 'yeni kanal listede yok').toBeTruthy();

    // UPDATE
    const renamed = await request.patch(`${API}/api/v1/channels/${ch.id}`, {
      headers: auth,
      data: { name: 'e2e-yeni-ad' },
    });
    expect(renamed.ok(), `yeniden adlandırma başarısız: ${renamed.status()}`).toBeTruthy();
    list = await guildChannels(request, token, guild.id);
    expect(list.find((c: any) => c.id === ch.id)?.name).toBe('e2e-yeni-ad');

    // DELETE
    const del = await request.delete(`${API}/api/v1/channels/${ch.id}`, { headers: auth });
    expect(del.ok(), `silme başarısız: ${del.status()}`).toBeTruthy();
    list = await guildChannels(request, token, guild.id);
    expect(list.some((c: any) => c.id === ch.id), 'silinen kanal hâlâ listede').toBeFalsy();
  });

  test('üye olmayan kullanıcı sunucuya kanal açamaz (yetki)', async ({ request }) => {
    const sahip = makeUser('sahip');
    const yabanci = makeUser('yabanci');
    const sahipToken = await registerViaApi(request, sahip);
    const yabanciToken = await registerViaApi(request, yabanci);
    const guild = await createGuild(request, sahipToken, `E2E-Y ${Date.now()}`);

    const r = await request.post(`${API}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${yabanciToken}` },
      data: { guild_id: guild.id, name: 'izinsiz', type: 'text' },
      failOnStatusCode: false,
    });
    expect(r.ok(), 'üye olmayan kullanıcı kanal açabildi — yetki kontrolü yok').toBeFalsy();
    expect([401, 403, 404], `beklenmedik durum: ${r.status()}`).toContain(r.status());
  });

  test('UI: yeni kanal kanal listesinde görünür', async ({ page, request }) => {
    const u = makeUser('chanui');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-CU ${Date.now()}`);
    const ad = `ui-kanal-${Date.now().toString(36)}`;
    await request.post(`${API}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { guild_id: guild.id, name: ad, type: 'text' },
    });

    await seedSession(page, request, u);
    await expect(page.getByRole('button', { name: ad, exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });
});
