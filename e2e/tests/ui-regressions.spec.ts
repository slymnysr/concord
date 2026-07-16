import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, seedSession, createGuild, guildChannels, sendMessage } from './helpers';

/**
 * Elle test turunda bulunan gerçek bug'ların regresyon testleri.
 * Bunlar bir kez kırıldı — bir daha sessizce kırılmasınlar.
 */
test.describe('UI regresyonları (elle bulunan bug\'lar)', () => {
  test('mesaj listesi KAYIYOR — metin ve ses kanalında (flexbox min-h-0 regresyonu)', async ({ page, request }) => {
    const u = makeUser('scroll');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-S ${Date.now()}`);
    const channels = await guildChannels(request, token, guild.id);
    const text = channels.find((c: any) => c.type === 'text');
    const voice = channels.find((c: any) => c.type === 'voice');

    /**
     * Bir mesajın KAYAN atasını bulup ölçer. "sayfadaki en uzun overflow'lu kutu" gibi
     * sezgiler yanıltıcı: bug tam da yükseklik kısıtının kaybolup listenin kaymaması,
     * o durumda sezgi yanlış kutuyu seçer. Bilinen bir mesajdan yukarı yürümek kesin.
     */
    const check = async (label: string, needle: string) => {
      const r = await page.evaluate((txt) => {
        const node = [...document.querySelectorAll('*')].reverse()
          .find((e) => (e as HTMLElement).innerText?.includes(txt) && e.children.length === 0);
        if (!node) return { found: false } as const;
        let el = node.parentElement;
        while (el) {
          const s = getComputedStyle(el);
          if (s.overflowY === 'auto' || s.overflowY === 'scroll') {
            return {
              found: true,
              overflows: el.scrollHeight > el.clientHeight + 5,
              pageOverflows: document.documentElement.scrollHeight > window.innerHeight + 5,
            } as const;
          }
          el = el.parentElement;
        }
        return { found: true, overflows: false, pageOverflows: true } as const;
      }, needle);

      expect(r.found, `${label}: mesaj ekranda yok — test kurulumu bozuk`).toBeTruthy();
      expect(r.overflows, `${label}: liste kaymıyor — kayan ata yok, min-h-0 kısıtı kayıp`).toBeTruthy();
      expect(r.pageOverflows, `${label}: SAYFA taşıyor — yükseklik kısıtı kayıp`).toBeFalsy();
    };

    // Metin kanalı — taşıracak kadar mesaj
    for (let i = 0; i < 30; i++) {
      await sendMessage(request, token, text.id, `Metin ${i} — container'ı doldurmak için yeterince uzun bir satır.`);
    }
    await seedSession(page, request, u);
    await page.getByRole('button', { name: text.name, exact: true }).first().click();
    await expect(page.getByText('Metin 29')).toBeVisible({ timeout: 10_000 });
    await check('metin kanalı', 'Metin 29');

    // Ses kanalı KENDİ sohbetine sahip (Discord'daki gibi) → onu da ayrıca doldur.
    // Metin kanalını doldurup ses kanalına bakmak boş liste ölçer, bug'ı kaçırır.
    expect(voice, 'ses kanalı bulunamadı').toBeTruthy();
    for (let i = 0; i < 30; i++) {
      await sendMessage(request, token, voice.id, `Ses ${i} — ses kanalı sohbetini doldurmak için yeterince uzun bir satır.`);
    }
    await page.getByRole('button', { name: voice.name, exact: true }).first().click();
    await expect(page.getByText('Ses 29')).toBeVisible({ timeout: 10_000 });
    await check('ses kanalı', 'Ses 29');
  });

  test('i18n: locale=en arayüzü İngilizceye çevirir', async ({ page, request }) => {
    const u = makeUser('i18n');
    await registerViaApi(request, u);
    await seedSession(page, request, u);

    await page.evaluate(() => localStorage.setItem('concord_locale', 'en'));
    await page.goto('/');

    // Sunucusu olmayan yeni kullanıcı → sol rayda "No servers yet"
    await expect(page.getByText('No servers yet')).toBeVisible({ timeout: 10_000 });
    // Türkçe kalıntı olmamalı
    await expect(page.getByText('Henüz sunucun yok')).toBeHidden();
  });

  test('güvenlik başlıkları API yanıtında var', async ({ request }) => {
    const r = await request.get(`${process.env.E2E_API_URL ?? 'http://localhost:8080'}/health`);
    const h = r.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('/metrics Prometheus formatında RED metrikleri yayar', async ({ request }) => {
    const r = await request.get(`${process.env.E2E_API_URL ?? 'http://localhost:8080'}/metrics`);
    expect(r.ok()).toBeTruthy();
    const body = await r.text();
    expect(body).toContain('concord_http_requests_total');
    expect(body).toContain('concord_http_request_duration_seconds');
  });
});
