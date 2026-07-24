import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, createGuild, guildChannels, sendMessage, API } from './helpers';

/**
 * FAZ M — uyum. Uygulama GLOBAL: bunlar "iyi olur" değil YASAL zorunluluk.
 *  * COPPA (ABD, 13+) ve DSA (AB) → yaş kapısı
 *  * GDPR Md.15 (erişim hakkı) → veri dışa aktarma
 *  * GDPR Md.17 (unutulma) → hesap silme (zaten vardı; burada regresyona karşı kilitleniyor)
 */
test.describe('Uyum', () => {
  test('yaş kapısı: 13 altı kaydı reddedilir ve VERİSİ YAZILMAZ', async ({ request }) => {
    const u = makeUser('kid');
    const bugun = new Date();
    const oniki = new Date(bugun.getFullYear() - 12, bugun.getMonth(), bugun.getDate());

    const r = await request.post(`${API}/api/v1/auth/register`, {
      data: {
        username: u.username,
        email: u.email,
        password: u.password,
        display_name: u.displayName,
        birth_date: oniki.toISOString().slice(0, 10),
      },
      failOnStatusCode: false,
    });
    expect(r.status(), '13 altı kayıt kabul edildi').toBe(403);
    expect((await r.json()).error).toBe('underage');

    // COPPA'nın ASIL gereği: 13 altından VERİ TOPLAMAMAK. Reddedip yazmak yetmez.
    const giris = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: u.email, password: u.password },
      failOnStatusCode: false,
    });
    expect(giris.ok(), "reddedilen kaydın kullanıcısı DB'ye yazılmış").toBeFalsy();
  });

  test('yaş kapısı: doğum tarihi ZORUNLU (sonradan sormak yasal olarak anlamsız)', async ({
    request,
  }) => {
    const u = makeUser('nodob');
    const r = await request.post(`${API}/api/v1/auth/register`, {
      data: {
        username: u.username,
        email: u.email,
        password: u.password,
        display_name: u.displayName,
      },
      failOnStatusCode: false,
    });
    expect(r.status(), 'doğum tarihsiz kayıt kabul edildi').toBe(400);
    expect((await r.json()).error).toBe('invalid_birth_date');
  });

  test('GDPR Md.15: veri dışa aktarma kullanıcının TÜM verisini içerir', async ({ request }) => {
    const u = makeUser('gdpr');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-GDPR ${Date.now()}`);
    const ch = (await guildChannels(request, token, guild.id)).find((c: any) => c.type === 'text');
    const icerik = `benim-mesajim-${Date.now().toString(36)}`;
    await sendMessage(request, token, ch.id, icerik);

    const istek = await request.post(`${API}/api/v1/users/me/data-export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(istek.ok()).toBeTruthy();
    const { id } = await istek.json();

    // Toplama ASENKRON (41 tabloya yayılı veri istek süresinde toplanamaz)
    await expect
      .poll(
        async () => {
          const r = await request.get(`${API}/api/v1/users/me/data-exports`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return (await r.json())[0]?.status;
        },
        { timeout: 20_000, message: 'dışa aktarma hazır olmadı' },
      )
      .toBe('ready');

    const ar = await request.get(`${API}/api/v1/users/me/data-exports/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ar.ok()).toBeTruthy();
    const d = await ar.json();

    expect(d.profile?.[0]?.username, 'profil eksik').toBe(u.username);
    expect(
      d.messages?.some((m: any) => m.content === icerik),
      'kullanıcının mesajı arşivde yok — GDPR Md.15 karşılanmıyor',
    ).toBeTruthy();
    expect(d.guild_memberships?.length, 'sunucu üyelikleri eksik').toBeGreaterThan(0);
  });

  test('veri dışa aktarma BAŞKASINA verilmez (tüm veriyi okumak demek)', async ({ request }) => {
    const sahip = makeUser('owner');
    const yabanci = makeUser('stranger');
    const t1 = await registerViaApi(request, sahip);
    const t2 = await registerViaApi(request, yabanci);

    const istek = await request.post(`${API}/api/v1/users/me/data-export`, {
      headers: { Authorization: `Bearer ${t1}` },
    });
    const { id } = await istek.json();

    const calma = await request.get(`${API}/api/v1/users/me/data-exports/${id}`, {
      headers: { Authorization: `Bearer ${t2}` },
      failOnStatusCode: false,
    });
    expect(calma.status(), 'başkasının arşivi indirilebildi — TÜM verisi sızdı').toBe(404);

    const kimliksiz = await request.get(`${API}/api/v1/users/me/data-exports/${id}`, {
      failOnStatusCode: false,
    });
    expect(kimliksiz.status()).toBe(401);
  });

  test('GDPR Md.17: hesap silme anonimleştirir ve girişi engeller', async ({ request }) => {
    const u = makeUser('erase');
    const token = await registerViaApi(request, u);

    const sil = await request.delete(`${API}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { password: u.password },
    });
    expect(sil.status(), `silme başarısız: ${await sil.text()}`).toBe(204);

    const giris = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: u.email, password: u.password },
      failOnStatusCode: false,
    });
    expect(giris.ok(), 'silinen hesapla giriş yapılabildi').toBeFalsy();
  });

  /**
   * WEB kayıt formu yaş kapısına uymalı. API doğum tarihini ZORUNLU tuttuğu an, alanı
   * olmayan form kaydı tamamen kırar (400) — bu test o kopukluğu yakalar.
   */
  test('web kayıt formu: doğum tarihi alanı var ve kayıt çalışıyor', async ({ page }) => {
    const n = `web${Date.now().toString(36)}`;
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    await page
      .getByRole('button', { name: /Kayıt ol|Sign up/i })
      .first()
      .click();

    await page.getByPlaceholder('ornek_kullanici').fill(n);
    await page.getByPlaceholder('sen@ornek.com').fill(`${n}@e2e.local`);
    await page.locator('input[type="password"]').first().fill('e2e-parola-123');

    const dogum = page.locator('input[type="date"]').first();
    await expect(
      dogum,
      'kayıt formunda doğum tarihi alanı YOK — API zorunlu tutuyor, kayıt kırık',
    ).toBeVisible();
    await dogum.fill('1995-01-01');

    await page
      .getByRole('button', { name: /Hesap Oluştur|Create Account/i })
      .first()
      .click();

    // Giriş başarılı → uygulama kabuğu gelir (parola alanı kaybolur)
    await expect(page.locator('input[type="password"]'), 'kayıt tamamlanmadı').toBeHidden({
      timeout: 15_000,
    });
  });
});
