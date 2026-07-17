import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, API } from './helpers';

/**
 * Giriş/kayıt sağlamlaştırma regresyonları. Hepsi ÖLÇÜLMÜŞ gerçek zayıflıklardı.
 */
test.describe('Auth sağlamlaştırma', () => {
  /**
   * Tek kural "en az 8 karakter" idi → "password", "12345678", "qwertyui", "aaaaaaaa"
   * HEPSİ kabul ediliyordu (ölçüldü). Bunlar dünyanın en yaygın parolaları; hesap kilidi
   * bile korumaz çünkü saldırgan İLK denemede tutturur.
   */
  test('zayıf parolalar reddedilir', async ({ request }) => {
    const zayif = ['12345678', 'password', 'aaaaaaaa', 'qwertyui', 'password2024', '1234567890'];
    for (const pw of zayif) {
      const u = makeUser('weak');
      const r = await request.post(`${API}/api/v1/auth/register`, {
        data: {
          username: u.username,
          email: u.email,
          password: pw,
          display_name: u.displayName,
          birth_date: '1995-01-01',
        },
        failOnStatusCode: false,
      });
      expect(r.status(), `"${pw}" KABUL EDİLDİ — zayıf parola politikası kırık`).toBe(400);
      expect(['too_short', 'too_common', 'too_repetitive']).toContain((await r.json()).error);
    }
  });

  /**
   * NIST SP 800-63B karmaşıklık kuralını (büyük/küçük/rakam/sembol) ARTIK ÖNERMİYOR —
   * kullanıcıyı "Password1!" kalıbına iter. Uzun passphrase GEÇMELİ; geçmezse kullanıcı
   * daha kötü parolalara yönelir.
   */
  test('uzun passphrase kabul edilir (sembol/rakam zorunlu değil)', async ({ request }) => {
    const u = makeUser('phrase');
    const r = await request.post(`${API}/api/v1/auth/register`, {
      data: {
        username: u.username,
        email: u.email,
        password: 'mor kedi ucan hali',
        display_name: u.displayName,
        birth_date: '1995-01-01',
      },
      failOnStatusCode: false,
    });
    expect(r.ok(), `passphrase reddedildi: ${await r.text()}`).toBeTruthy();
  });

  test('parola kullanıcı adını/e-postasını içeremez', async ({ request }) => {
    const u = makeUser('ident');
    const r = await request.post(`${API}/api/v1/auth/register`, {
      data: {
        username: u.username,
        email: u.email,
        password: `${u.username}12345`,
        display_name: u.displayName,
        birth_date: '1995-01-01',
      },
      failOnStatusCode: false,
    });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toBe('contains_identity');
  });

  /**
   * GERÇEK AÇIKTI: parolası çalınan kullanıcı parolasını değiştirse bile SALDIRGANIN
   * OTURUMU CANLI KALIYORDU. ResetPassword bunu doğru yapıyordu; ChangePassword'de
   * DELETE FROM refresh_tokens satırı yoktu.
   */
  test('parola değişimi DİĞER oturumları öldürür', async ({ request }) => {
    const u = makeUser('sess');
    u.password = 'eski parola cok guclu';
    await registerViaApi(request, u);

    // "Saldırgan" aynı parolayla ayrı bir oturum açar
    const giris = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: u.email, password: u.password },
    });
    const { refresh_token: saldirgan, access_token: kurban } = await giris.json();

    // Saldırganın oturumu ÖNCE çalışıyor
    expect(
      (
        await request.post(`${API}/api/v1/auth/refresh`, {
          data: { refresh_token: saldirgan },
          failOnStatusCode: false,
        })
      ).ok(),
    ).toBeTruthy();

    // Kurban parolasını değiştirir
    const degis = await request.patch(`${API}/api/v1/users/me/password`, {
      headers: { Authorization: `Bearer ${kurban}` },
      data: { current_password: u.password, new_password: 'yeni parola daha guclu' },
    });
    expect(degis.status(), `parola değişimi başarısız: ${await degis.text()}`).toBe(204);

    // Saldırganın oturumu ÖLMELİ
    const sonra = await request.post(`${API}/api/v1/auth/refresh`, {
      data: { refresh_token: saldirgan },
      failOnStatusCode: false,
    });
    expect(sonra.ok(), 'parola değişiminden SONRA saldırganın oturumu hâlâ canlı').toBeFalsy();
  });

  test('parola değişimi zayıf yeni parolayı reddeder', async ({ request }) => {
    const u = makeUser('chweak');
    const token = await registerViaApi(request, u);
    const r = await request.patch(`${API}/api/v1/users/me/password`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { current_password: u.password, new_password: 'password' },
      failOnStatusCode: false,
    });
    expect(r.status(), 'zayıf parolaya DEĞİŞTİRİLEBİLDİ').toBe(400);
  });

  /**
   * Yanlış mevcut parolayla gelen saldırgan, politika hatasından kuralları ÖĞRENMEMELİ.
   * (Doğrulama ÖNCE, politika SONRA.)
   */
  test('yanlış mevcut parola politika bilgisi sızdırmaz', async ({ request }) => {
    const u = makeUser('leak');
    const token = await registerViaApi(request, u);
    const r = await request.patch(`${API}/api/v1/users/me/password`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { current_password: 'yanlis-parola-bu', new_password: 'password' },
      failOnStatusCode: false,
    });
    expect((await r.json()).error, 'politika hatası döndü → kurallar sızdı').toBe('wrong_password');
  });
});
