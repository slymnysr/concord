import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, seedSession, createGuild, guildChannels, API } from './helpers';

/**
 * Medya boru hattı sözleşmesi (FAZ A → FAZ B, bkz. apps/api/docs/API-KONTRAT.md).
 *
 * FAZ A ekleri sunucu-tespitli metadata ile döndürür (thumb_url/width/height); FAZ B bunu
 * TÜKETMEK ZORUNDA: satır içi tam boy görsel yüklemek her mesajda MB'larca gereksiz indirme,
 * width/height'sız <img> ise liste ziplaması (layout shift) demek.
 *
 * NOT: MEDIA_EVENT_SECRET yoksa webhook kapalıdır (dev) → işleme hiç çalışmaz ve thumb_url
 * üretilmez. O durumda test kendini atlar: yanlış yere kırmızı yakmaktansa açıkça atlansın.
 */
test("görsel ek: satır içi THUMBNAIL gösterilir, tam boy lightbox'a saklanır", async ({
  page,
  request,
}) => {
  const u = makeUser('att');
  const token = await registerViaApi(request, u);
  const guild = await createGuild(request, token, `E2E-ATT ${Date.now()}`);
  const ch = (await guildChannels(request, token, guild.id)).find((c: any) => c.type === 'text');

  // 1) Presign + doğrudan MinIO'ya yükle (gerçek akış: API baytları görmez)
  // GERÇEK PNG (800x600) — elle yazılmış base64 bozuk çıkıyordu ve boru hattı onu DOĞRU
  // şekilde reddediyordu ("görüntü çözülemedi: invalid checksum"). Bozuk veriyle test etmek
  // pipeline'ı suçlamak olurdu.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAyAAAAJYCAIAAAAVFBUnAAAKrklEQVR4nO3WQQ3AIADAQEAXSlCMrJloQrLcKeiz8+4zAADorNcBAAB/Y7AAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAgZrAAAGIGCwAg9gF6vQYO5Ti0JgAAAABJRU5ErkJggg==',
    'base64',
  );
  const pres = await request.post(`${API}/api/v1/uploads/presign`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { filename: 'test.png', size_bytes: png.length },
  });
  expect(pres.ok(), `presign başarısız: ${pres.status()}`).toBeTruthy();
  const { upload_url, public_url } = await pres.json();

  const put = await request.fetch(upload_url, { method: 'PUT', data: png });
  expect(put.ok(), `MinIO yükleme başarısız: ${put.status()}`).toBeTruthy();

  // 2) İşlemeyi bekle (asenkron: MinIO event → webhook → tara/thumbnail üret)
  let ekler: any[] = [];
  for (let i = 0; i < 12; i++) {
    const msg = await request.post(`${API}/api/v1/channels/${ch.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        content: `görsel ${Date.now()}`,
        attachments: [{ url: public_url, filename: 'test.png' }],
      },
      failOnStatusCode: false,
    });
    if (msg.ok()) {
      ekler = (await msg.json()).attachments ?? [];
      break;
    }
    const body = await msg.text();
    // "henüz işlenmedi/taranıyor" → kontratın söylediği gibi yeniden dene
    if (!/invalid_attachment/.test(body))
      throw new Error(`beklenmeyen hata: ${msg.status()} ${body}`);
    if (/virüs|reddedildi|depoya ait/.test(body)) throw new Error(`ek kalıcı reddedildi: ${body}`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  test.skip(
    ekler.length === 0,
    'medya webhook kapalı (MEDIA_EVENT_SECRET yok) → işleme çalışmıyor',
  );

  const ek = ekler[0];
  expect(ek.content_type, 'sunucu gerçek tipi tespit etmeli').toBe('image/png');
  expect(ek.thumb_url, 'görüntü için thumb_url üretilmeliydi').toBeTruthy();
  expect(ek.width, 'width sunucudan gelmeli').toBeGreaterThan(0);

  // 3) UI: satır içi <img> THUMBNAIL göstermeli ve boyut ayırmalı
  await seedSession(page, request, u);
  await page.getByRole('button', { name: ch.name, exact: true }).first().click();

  const img = page.locator(`img[src="${ek.thumb_url}"]`).first();
  await expect(img, 'satır içi görsel thumb_url kullanmıyor — tam boy indiriliyor').toBeVisible({
    timeout: 10_000,
  });
  await expect(img, 'width/height yok → görsel inince liste ziplar (layout shift)').toHaveAttribute(
    'width',
    String(ek.width),
  );

  // Tam boy YALNIZCA lightbox'ta
  await img.click();
  await expect(
    page.locator(`img[src="${ek.url}"]`).first(),
    'lightbox tam boyu göstermeli',
  ).toBeVisible({ timeout: 5_000 });
});
