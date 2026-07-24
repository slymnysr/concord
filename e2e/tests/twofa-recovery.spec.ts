import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, totp, API } from './helpers';

/**
 * 2FA KURTARMA KODLARI — authenticator'ını kaybeden kullanıcının hesabına girebilmesi.
 * Bu akış olmadan 2FA açıp telefonunu kaybeden kullanıcı hesabına BİR DAHA giremezdi
 * (kalıcı kilitlenme). Test, kurtarma kodunun TOTP yerine geçtiğini, TEK KULLANIMLIK
 * olduğunu ve TOTP'yi bozmadığını uçtan uca (migration + repo + handler + login) doğrular.
 */
test.describe('2FA kurtarma kodları', () => {
  test('kurtarma kodu TOTP yerine giriş yapar ve tek kullanımlıktır', async ({ request }) => {
    const u = makeUser('2farec');
    const token = await registerViaApi(request, u);
    const auth = { Authorization: `Bearer ${token}` };

    // 2FA kurulumunu başlat → secret
    const en = await request.post(`${API}/api/v1/users/me/2fa/enable`, { headers: auth });
    expect(en.ok(), `enable başarısız: ${en.status()}`).toBeTruthy();
    const { secret } = await en.json();

    // TOTP ile doğrula → 10 kurtarma kodu döner (SADECE burada, bir kez)
    const ver = await request.post(`${API}/api/v1/users/me/2fa/verify`, {
      headers: auth,
      data: { code: totp(secret) },
    });
    expect(ver.ok(), `verify başarısız: ${ver.status()} ${await ver.text()}`).toBeTruthy();
    const { recovery_codes } = await ver.json();
    expect(recovery_codes, 'kurtarma kodları dönmedi').toHaveLength(10);

    // Login artık 2FA istiyor
    const noCode = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: u.email, password: u.password },
    });
    expect(noCode.status()).toBe(401);
    expect((await noCode.json()).error).toBe('2fa_required');

    // KURTARMA KODUYLA giriş başarılı (TOTP yerine — telefonu kaybeden kullanıcının yolu)
    const rec1 = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: u.email, password: u.password, totp_code: recovery_codes[0] },
    });
    expect(
      rec1.ok(),
      `kurtarma kodu girişi başarısız: ${rec1.status()} ${await rec1.text()}`,
    ).toBeTruthy();

    // AYNI kod TEKRAR reddedilir (tek kullanımlık — çalınan kod ikinci kez işe yaramaz)
    const rec1again = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: u.email, password: u.password, totp_code: recovery_codes[0] },
    });
    expect(
      rec1again.status(),
      'aynı kurtarma kodu ikinci kez kabul edildi — tek kullanımlık DEĞİL',
    ).toBe(401);

    // BAŞKA kurtarma kodu hâlâ çalışır (biri tükenince diğerleri geçerli kalır)
    const rec2 = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: u.email, password: u.password, totp_code: recovery_codes[1] },
    });
    expect(rec2.ok(), 'ikinci kurtarma kodu çalışmadı').toBeTruthy();

    // TOTP hâlâ çalışır (kurtarma kodu kullanmak asıl 2FA'yı bozmadı)
    const totpLogin = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: u.email, password: u.password, totp_code: totp(secret) },
    });
    expect(totpLogin.ok(), 'kurtarma kodundan sonra TOTP girişi bozuldu').toBeTruthy();
  });
});
