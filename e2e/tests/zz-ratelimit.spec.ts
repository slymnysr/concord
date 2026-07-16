import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, API, type TestUser } from './helpers';

/**
 * EN SONA ALINDI (zz- öneki, config workers:1 + fullyParallel:false ile sıralı koşar):
 * bu dosya kasten başarısız giriş üretir. Daha önce koşarsa sonraki testlerin girişlerini
 * kilitler ve süit kendi kendini DoS'lar.
 *
 * Buradaki testler brute-force savunmasının SÖZLEŞMESİNİ sabitler:
 * IP başına gevşek, hesap başına sıkı. (handlers/auth.go: maxFailPerEmailIP/Email/IP)
 */
const badLogin = (request: any, email: string) =>
  request.post(`${API}/api/v1/auth/login`, {
    data: { email, password: 'kesinlikle-yanlis' },
    failOnStatusCode: false,
  });

const goodLogin = (request: any, u: TestUser) =>
  request.post(`${API}/api/v1/auth/login`, {
    data: { email: u.email, password: u.password },
    failOnStatusCode: false,
  });

test('hesap kilidi: aynı hesaba art arda yanlış parola 429 ile kesilir', async ({ request }) => {
  const u = makeUser('lock');
  await registerViaApi(request, u);

  const codes: number[] = [];
  for (let i = 0; i < 8; i++) codes.push((await badLogin(request, u.email)).status());

  expect(codes, `429 bekleniyordu, gelen: ${codes.join(',')}`).toContain(429);
  // Kilit devredeyken DOĞRU parola da reddedilir (brute-force savunmasının anlamı bu)
  expect((await goodLogin(request, u)).status()).toBe(429);
});

test('kilit 429\'u Retry-After başlığı taşır', async ({ request }) => {
  const u = makeUser('retry');
  await registerViaApi(request, u);

  let retryAfter: string | undefined;
  for (let i = 0; i < 8; i++) {
    const r = await badLogin(request, u.email);
    if (r.status() === 429) { retryAfter = r.headers()['retry-after']; break; }
  }
  expect(retryAfter, '429 istemciye ne zaman döneceğini söylemeli').toBeTruthy();
  expect(Number(retryAfter)).toBeGreaterThan(0);
});

/**
 * REGRESYON — gerçek bir güvenlik açığıydı: sayaç `(email = $1 OR ip = $2)` ile tek eşiğe
 * vuruyordu, yani BİR hesaba yapılan 5 yanlış deneme AYNI IP'deki HERKESİ 15 dk kilitliyordu.
 * Operatör CGNAT'ı arkasında (Türkiye'de yaygın) bu, üretimde toplu giriş çökmesi demekti.
 * Ayrıca saldırgan kurbanın e-postasını bilerek hesabını kilitleyebiliyordu.
 */
test('kilitlenen hesap AYNI IP\'deki başka kullanıcıyı etkilemez (CGNAT tahribatı yok)', async ({ request }) => {
  const kurban = makeUser('kurban');
  const masum = makeUser('masum');
  await registerViaApi(request, kurban);
  await registerViaApi(request, masum);

  // Kurbanın hesabını kilitle
  for (let i = 0; i < 8; i++) await badLogin(request, kurban.email);
  expect((await goodLogin(request, kurban)).status(), 'kurban kilitlenmeliydi').toBe(429);

  // Aynı IP'den masum kullanıcı SORUNSUZ girebilmeli
  const r = await goodLogin(request, masum);
  expect(r.status(), `aynı IP'deki masum kullanıcı kilitlendi — çapraz hesap kilidi geri geldi`).toBe(200);
});

test('başarılı giriş hata sayacını sıfırlar (parolayı hatırlayan kilitli kalmaz)', async ({ request }) => {
  const u = makeUser('reset');
  await registerViaApi(request, u);

  // Kilit eşiğinin ALTINDA kal, sonra doğru parolayla gir
  for (let i = 0; i < 3; i++) await badLogin(request, u.email);
  expect((await goodLogin(request, u)).status(), 'eşik altındayken giriş çalışmalı').toBe(200);

  // Sayaç sıfırlandıysa 3 hata daha kilitlememeli (3+3=6 > 5 eşiği; sıfırlama yoksa kilitlenir)
  for (let i = 0; i < 3; i++) await badLogin(request, u.email);
  expect((await goodLogin(request, u)).status(), 'başarılı giriş sayacı sıfırlamadı').toBe(200);
});
