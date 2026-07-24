import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, API } from './helpers';

test.describe('Kimlik doğrulama', () => {
  test('kayıt olan kullanıcı UI üzerinden giriş yapabilir', async ({ page, request }) => {
    const u = makeUser('auth');
    await registerViaApi(request, u);

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    await page.getByRole('textbox', { name: /sen@ornek\.com|ornek/i }).fill(u.email);
    await page.locator('input[type="password"]').fill(u.password);
    await page.getByRole('button', { name: /Giriş Yap|Sign In/i }).click();

    // Giriş sonrası uygulama kabuğu gelmeli (login formu kaybolur)
    await expect(page.locator('input[type="password"]')).toBeHidden({ timeout: 15_000 });
  });

  test('yanlış parola reddedilir', async ({ page, request }) => {
    const u = makeUser('authbad');
    await registerViaApi(request, u);

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    await page.getByRole('textbox', { name: /sen@ornek\.com|ornek/i }).fill(u.email);
    await page.locator('input[type="password"]').fill('kesinlikle-yanlis');
    await page.getByRole('button', { name: /Giriş Yap|Sign In/i }).click();

    // Login formunda kalmalı
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
