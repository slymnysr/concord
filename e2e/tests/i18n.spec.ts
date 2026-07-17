import { test, expect, type Page } from '@playwright/test';
import { makeUser, registerViaApi, seedSession } from './helpers';

/**
 * Diller GERÇEKTEN ERİŞİLEBİLİR Mİ?
 *
 * NEDEN ŞART: sözlüğün dolu olması, o dilin kullanıcıya GÖSTERİLDİĞİ anlamına gelmez.
 * Bu test yazılırken i18n.ts'te tam olarak bu vardı:
 *
 *     return v === 'en' ? 'en' : 'tr';        // getLocale()
 *
 * Ayarlar 7 dili de listeliyor, setLocale('de') localStorage'a 'de' yazıyordu — ama okuma
 * onu 'tr'ye düşürüyordu. Yani Almanca/Fransızca/İspanyolca/Portekizce/Japonca sözlükler
 * (4825 çeviri) ÖLÜ KODDU: seçilebiliyor ama asla görünmüyordu. tsc bunu yakalamaz
 * (tipler doğru), sözlük sayımı yakalamaz (965/965 dolu). Yalnızca tarayıcı yakalar.
 */

const DILLER = [
  { kod: 'de', ad: 'Deutsch', tagline: 'Die Chat-Plattform für deine Community' },
  { kod: 'fr', ad: 'Français', tagline: 'La plateforme de discussion pour ta communauté' },
  { kod: 'es', ad: 'Español', tagline: 'La plataforma de chat para tu comunidad' },
  { kod: 'pt', ad: 'Português', tagline: 'A plataforma de conversa para a sua comunidade' },
  { kod: 'ja', ad: '日本語', tagline: 'あなたのコミュニティのためのチャットプラットフォーム' },
] as const;

async function dilAyarla(page: Page, kod: string) {
  await page.goto('/');
  await page.evaluate((k) => {
    localStorage.clear();
    localStorage.setItem('concord_locale', k);
  }, kod);
  await page.goto('/');
}

test.describe('Çok dillilik', () => {
  for (const d of DILLER) {
    test(`${d.ad} (${d.kod}) seçilince arayüz o dile geçer`, async ({ page }) => {
      await dilAyarla(page, d.kod);

      // getLocale() bu dili tanımıyorsa 'tr'ye düşer → tagline Türkçe kalır ve bu görünmez.
      await expect(
        page.getByText(d.tagline).first(),
        `${d.kod} seçili ama arayüz o dilde değil — getLocale() bu dili tanımıyor olabilir`,
      ).toBeVisible({ timeout: 15_000 });

      // Türkçe'ye düşmediğini AYRICA doğrula: tagline eşleşmesi tek başına, sayfanın
      // geri kalanı TR kalmışken de geçebilirdi.
      await expect(
        page.getByText("Türkiye'nin yerli sohbet platformu"),
        `${d.kod} seçiliyken Türkçe metin hâlâ ekranda — dil kısmen uygulanıyor`,
      ).toHaveCount(0);
    });
  }

  test('ayarlardan dil seçmek KALICI olur (setLocale → getLocale gidiş-dönüşü)', async ({
    page,
    request,
  }) => {
    const u = makeUser('i18nsw');
    await registerViaApi(request, u);
    await seedSession(page, request, u);

    await page
      .getByRole('button', { name: 'Kullanıcı Ayarları' })
      .first()
      .click({ timeout: 10_000 });

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal
      .getByRole('button', { name: /^Görünüm$/ })
      .first()
      .click();

    // Butona TIKLA — localStorage'ı elle yazmak setLocale/getLocale zincirini atlardı.
    await modal
      .getByRole('button', { name: /Deutsch/ })
      .first()
      .click();

    // setLocale() location.reload() yapar → modal KAPANIR. Bu yüzden modal içindeki bir
    // metne değil, uygulama kabuğundaki dişli düğmesinin aria-label'ına bakıyoruz
    // (t('settings.user') → de: "Benutzereinstellungen").
    const dişli = page.getByRole('button', { name: 'Benutzereinstellungen' });
    await expect(
      dişli.first(),
      'Almanca seçildi ama arayüz Almanca değil — setLocale→getLocale gidiş-dönüşü kopuk',
    ).toBeVisible({ timeout: 15_000 });

    // Ve KALICI: elle reload sonrası hâlâ Almanca (localStorage gerçekten okunuyor).
    await page.reload();
    await expect(dişli.first(), 'reload sonrası dil kayboldu — localStorage okunmuyor').toBeVisible(
      { timeout: 15_000 },
    );

    // Türkçe'ye düşmediğini de doğrula
    await expect(page.getByRole('button', { name: 'Kullanıcı Ayarları' })).toHaveCount(0);
  });
});
