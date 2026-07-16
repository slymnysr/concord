import { type Page, type APIRequestContext, expect } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:8080';

export interface TestUser {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

/** Her koşu için benzersiz kullanıcı — testler birbirinin durumunu bozmasın. */
export function makeUser(tag: string): TestUser {
  // API kuralı: kullanıcı adı 3-32 karakter, sadece a-z 0-9 . _ → etiketi burada süz,
  // yoksa geçersiz ad testi 400'le düşürür ve hata asıl senaryoyu gizler.
  const safe = tag.toLowerCase().replace(/[^a-z0-9._]/g, '');
  const n = `${safe}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 32);
  return { email: `${n}@e2e.local`, password: 'e2e-parola-123', username: n, displayName: `E2E ${tag}` };
}

/** API üzerinden kayıt — UI'ı test etmeyen senaryolarda hızlı kurulum için. */
export async function registerViaApi(req: APIRequestContext, u: TestUser): Promise<string> {
  const r = await req.post(`${API}/api/v1/auth/register`, {
    data: { username: u.username, email: u.email, password: u.password, display_name: u.displayName },
  });
  expect(r.ok(), `kayıt başarısız: ${r.status()} ${await r.text()}`).toBeTruthy();
  return (await r.json()).access_token;
}

export async function loginViaApi(req: APIRequestContext, u: TestUser): Promise<string> {
  const r = await req.post(`${API}/api/v1/auth/login`, { data: { email: u.email, password: u.password } });
  expect(r.ok(), `giriş başarısız: ${r.status()}`).toBeTruthy();
  return (await r.json()).access_token;
}

/** Token'ı tarayıcıya enjekte et → UI oturum açmış başlar (login UI'ı ayrı test edilir). */
export async function seedSession(page: Page, req: APIRequestContext, u: TestUser) {
  const r = await req.post(`${API}/api/v1/auth/login`, { data: { email: u.email, password: u.password } });
  expect(r.ok(), `oturum tohumlama girişi başarısız: ${r.status()} ${await r.text()}`).toBeTruthy();
  const d = await r.json();
  await page.goto('/');
  await page.evaluate(
    ([a, rt]) => {
      localStorage.setItem('concord_access', a as string);
      localStorage.setItem('concord_refresh', rt as string);
    },
    [d.access_token, d.refresh_token],
  );
  await page.goto('/');
}

export async function createGuild(req: APIRequestContext, token: string, name: string) {
  const r = await req.post(`${API}/api/v1/guilds`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  });
  expect(r.ok(), `sunucu oluşturulamadı: ${r.status()}`).toBeTruthy();
  return await r.json();
}

export async function guildChannels(req: APIRequestContext, token: string, guildId: string) {
  const r = await req.get(`${API}/api/v1/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(r.ok()).toBeTruthy();
  return await r.json();
}

export async function sendMessage(req: APIRequestContext, token: string, channelId: string, content: string) {
  const r = await req.post(`${API}/api/v1/channels/${channelId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { content },
  });
  expect(r.ok(), `mesaj gönderilemedi: ${r.status()}`).toBeTruthy();
  return await r.json();
}
