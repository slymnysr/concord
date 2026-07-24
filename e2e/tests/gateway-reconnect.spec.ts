import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, seedSession, loginViaApi } from './helpers';

/**
 * REGRESYON — sessiz realtime ölümü.
 *
 * Phoenix Socket'e `params: { token }` (SABİT nesne) veriliyordu → soket kurulum anındaki
 * token'a kilitleniyordu. Access token TTL'i 15 dk; ağ kopması / uyku / uygulama arka planda
 * bundan uzun kalınca Phoenix otomatik yeniden bağlanır ve SÜRESİ DOLMUŞ token'ı gönderir →
 * gateway 403 → Phoenix aynı ölü token'la sonsuza dek dener → realtime, sayfa yenilenene
 * kadar sessizce ölür. Kullanıcı bunu "mesajlar gelmiyor" diye yaşar.
 *
 * Çözüm: `params` FONKSİYON — Phoenix onu closure()'la sarar, HER bağlanışta yeniden okur.
 *
 * NOT: kopma `window.WebSocket` sarmalanıp soket ELLE kapatılarak üretiliyor.
 * context.setOffline() AÇIK bir WS'i kapatmıyor → Phoenix kopmayı fark etmiyor, test yanıltıcı.
 */
test("soket yeniden bağlanırken TAZE token gönderir (eski token'a kilitlenmez)", async ({
  page,
  request,
}) => {
  const u = makeUser('reconn');
  await registerViaApi(request, u);

  // Uygulama kodundan ÖNCE: her WebSocket örneğini yakala
  await page.addInitScript(() => {
    const Orig = window.WebSocket;
    (window as any).__sockets = [];
    const Patched = function (this: any, ...args: any[]) {
      const ws = new (Orig as any)(...args);
      (window as any).__sockets.push(ws);
      return ws;
    } as any;
    Patched.prototype = Orig.prototype;
    Object.assign(Patched, Orig);
    (window as any).WebSocket = Patched;
  });

  await seedSession(page, request, u);

  const soketSayisi = () => page.evaluate(() => (window as any).__sockets.length as number);
  const sonUrl = () => page.evaluate(() => (window as any).__sockets.at(-1).url as string);

  await expect.poll(soketSayisi, { timeout: 15_000 }).toBeGreaterThan(0);
  const ilkToken = new URL(await sonUrl()).searchParams.get('token');
  expect(ilkToken, 'ilk soket token taşımalı').toBeTruthy();

  // Token yenilendi (uygulamanın refresh akışının yaptığı şey).
  // 1.1sn bekleme ŞART: JWT'nin iat/exp claim'leri SANİYE hassasiyetinde → aynı saniyede
  // üretilen iki token birebir AYNI string olur (aynı claim'ler = aynı imza) ve test
  // "token değişti mi" adımında zamanlamaya bağlı olarak rastgele düşer.
  await page.waitForTimeout(1100);
  const tazeToken = await loginViaApi(request, u);
  expect(tazeToken, 'taze token öncekiyle aynı — test anlamsız olurdu').not.toBe(ilkToken);
  await page.evaluate((t) => localStorage.setItem('concord_access', t as string), tazeToken);

  // Bağlantıyı KOPAR → Phoenix otomatik yeniden bağlanır
  const oncekiSayi = await soketSayisi();
  await page.evaluate(() => (window as any).__sockets.at(-1).close());

  await expect.poll(soketSayisi, { timeout: 20_000 }).toBeGreaterThan(oncekiSayi);

  const yeniToken = new URL(await sonUrl()).searchParams.get('token');
  expect(yeniToken, "yeniden bağlanma ESKİ token'ı gönderdi — params sabit nesneye kilitli").toBe(
    tazeToken,
  );
});
