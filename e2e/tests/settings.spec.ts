import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, seedSession, createGuild, API } from './helpers';

/**
 * FAZ B kabul kriteri: "bileşen davranışı korunur (E2E ayar akışları)".
 *
 * NEDEN ŞART: tanrı-bileşen refaktörü ServerSettingsModal'ı (2515 satır) ve
 * UserSettingsModal'ı (1905 satır) sekme-başına dosyalara böldü. Bu tür bir bölme davranışı
 * SESSİZCE bozar (state yukarı taşınmamış, kaydet handler'ı kopmuş, sekme hiç mount olmuyor)
 * ve tsc bunların hiçbirini yakalamaz.
 *
 * NOT: sunucu ADI ayarlardan düzenlenemez — bu bir refaktör kaybı DEĞİL, hiç var olmamış
 * (bölme öncesi ServerSettingsModal da `<div>{guild.name}</div>` basıyordu). Test var olan
 * akışları doğrular; olmayan özelliği varsayan test yanlış yere kırmızı yakar.
 */
async function ayarlariAc(page: any, guildAdi: string) {
  await page.getByRole('button', { name: guildAdi, exact: true }).first().click();
  await page
    .getByRole('button', { name: /Sunucu Ayarları/i })
    .first()
    .click({ timeout: 10_000 });
  await expect(page.getByText(/Genel Bilgi/i).first(), 'ayar modalı açılmadı').toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Ayar akışları', () => {
  test('sunucu ayarları: sekme değişimi içeriği DEĞİŞTİRİR (bölünmüş sekmeler mount oluyor)', async ({
    page,
    request,
  }) => {
    const u = makeUser('settab');
    const token = await registerViaApi(request, u);
    const ad = `E2E-Sekme-${Date.now().toString(36)}`;
    await createGuild(request, token, ad);

    await seedSession(page, request, u);
    await ayarlariAc(page, ad);

    // Her sekme AYRI dosya: biri mount olmazsa içerik boş kalır
    await page
      .getByRole('button', { name: /^Roller$/ })
      .first()
      .click();
    await expect(
      page.getByText(/@everyone/i).first(),
      'Roller sekmesi boş — bölünmüş sekme mount olmuyor',
    ).toBeVisible({ timeout: 10_000 });

    await page
      .getByRole('button', { name: /^Üyeler$/ })
      .first()
      .click();
    await expect(
      page.getByPlaceholder(/Üye ara/i).first(),
      'Üyeler sekmesi mount olmuyor',
    ).toBeVisible({ timeout: 10_000 });

    await page
      .getByRole('button', { name: /^Davetler$/ })
      .first()
      .click();
    await expect(page.getByText(/Genel Bilgi/i)).toBeHidden({ timeout: 5_000 });
  });

  test("sunucu ayarları: vanity URL değişikliği KALICI olur (kaydet handler'ı bağlı)", async ({
    page,
    request,
  }) => {
    const u = makeUser('setvan');
    const token = await registerViaApi(request, u);
    const ad = `E2E-Van-${Date.now().toString(36)}`;
    const guild = await createGuild(request, token, ad);

    await seedSession(page, request, u);
    await ayarlariAc(page, ad);

    const vanity = `e2e-${Date.now().toString(36)}`;
    await page.getByPlaceholder('ozel-link').first().fill(vanity);
    await page
      .getByRole('button', { name: /^Kaydet$/ })
      .first()
      .click();

    // KALICI mı — UI'a değil API'ye sor (optimistic gösterim kanıt değil)
    await expect
      .poll(
        async () => {
          const r = await request.get(`${API}/api/v1/guilds/${guild.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return (await r.json()).vanity_url_code;
        },
        { timeout: 10_000, message: "vanity kaydedilmedi — kaydet handler'ı refaktörde koptu" },
      )
      .toBe(vanity);
  });

  test('kullanıcı ayarları: modal açılır ve sekmeler gezilir', async ({ page, request }) => {
    const u = makeUser('setusr');
    await registerViaApi(request, u);
    await seedSession(page, request, u);

    // Dişli ikonu: aria-label = t('settings.user')
    await page
      .getByRole('button', { name: 'Kullanıcı Ayarları' })
      .first()
      .click({ timeout: 10_000 });

    const modal = page.locator('[role="dialog"]');
    await expect(modal, 'kullanıcı ayarları modalı açılmadı').toBeVisible({ timeout: 10_000 });

    // Sekmeler ayrı dosyalarda (user-settings/*.tsx) → biri mount olmazsa içerik boş kalır
    await modal
      .getByRole('button', { name: /^Bildirimler$/ })
      .first()
      .click();
    await expect(
      modal.getByText(/bildirim/i).first(),
      'Bildirimler sekmesi mount olmuyor',
    ).toBeVisible({ timeout: 10_000 });
  });
});
