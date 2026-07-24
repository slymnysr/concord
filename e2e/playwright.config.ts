import { defineConfig, devices } from '@playwright/test';

/**
 * Concord E2E — kara kutu testleri.
 *
 * TASARIM: testler UI/API SÖZLEŞMESİNE dayanır, iç koda değil → bileşen refaktörleri
 * (ör. FAZ B tanrı-bileşen bölmesi) testleri kırmaz. Bu yüzden seçiciler rol/metin
 * tabanlıdır, CSS sınıfı değil.
 *
 * Ortam: çalışan bir yığın gerekir (docker + api + web). CI'da workflow ayağa kaldırır.
 *   E2E_BASE_URL   — web adresi (varsayılan http://localhost:3000)
 *   E2E_API_URL    — API adresi (varsayılan http://localhost:8080)
 */
export default defineConfig({
  testDir: './tests',
  // Testler ortak backend durumunu (kullanıcı/sunucu) paylaştığı için sıralı çalışır.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
