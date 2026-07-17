import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, createGuild, guildChannels, sendMessage, API } from './helpers';

/**
 * Arama sözleşmesi (FAZ A). Bu testler ÜÇ gerçek kusuru kilitliyor:
 *  1. 'simple' config kök bulmuyordu → "mesajlar" araması "mesaj"ı bulmuyordu.
 *  2. ASCII yazım hiç eşleşmiyordu → "toplanti" araması "toplantı"yı bulmuyordu.
 *     Türkiye'de kullanıcıların çoğu Türkçe karakter yazmaz → arama pratikte çalışmıyordu.
 *  3. Sıralama m.id DESC idi → alaka sıralaması yoktu; en alakalı sonuç sayfalarca aşağıda.
 */
async function ara(request: any, token: string, q: string, extra = '') {
  const r = await request.get(`${API}/api/v1/search/messages?q=${encodeURIComponent(q)}${extra}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(r.ok(), `arama başarısız: ${r.status()}`).toBeTruthy();
  return (await r.json()) as { message: { content: string } }[];
}

test.describe('Arama', () => {
  test('Türkçe kök bulma + ASCII yazım + alaka sıralaması', async ({ request }) => {
    const u = makeUser('ara');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-A ${Date.now()}`);
    const ch = (await guildChannels(request, token, guild.id)).find((c: any) => c.type === 'text');

    const damga = Date.now().toString(36);
    // ALAKA testinin ayırt edici olması için: en alakalı mesaj EN ESKİ olmalı.
    // (En alakalı aynı zamanda en yeniyse, kronolojik sıralama da aynı sonucu verir →
    //  test alaka sıralamasını doğrulamış olmaz, yanıltıcı yeşil yanar.)
    const enAlakali = `alakali-${damga} toplantı toplantı toplantı`;
    await sendMessage(request, token, ch.id, enAlakali);
    await sendMessage(request, token, ch.id, `dolgu-${damga} alakasız içerik`);
    const enYeni = `yeni-${damga} yarınki toplantılar uzun sürecek`;
    await sendMessage(request, token, ch.id, enYeni);

    // 1) KÖK BULMA: "toplantı" → çekimli "toplantılar"ı da bulmalı
    const kok = await ara(request, token, `toplantı ${damga}`);
    expect(
      kok.some((x) => x.message.content === enYeni),
      'kök bulma yok: "toplantı" araması "toplantılar" içeren mesajı bulamadı',
    ).toBeTruthy();

    // 2) ASCII YAZIM: "toplanti" (Türkçe karaktersiz) → "toplantı"yı bulmalı
    const ascii = await ara(request, token, `toplanti ${damga}`);
    expect(
      ascii.some((x) => x.message.content === enAlakali),
      'ASCII yazım eşleşmiyor: "toplanti" araması "toplantı" içeren mesajı bulamadı',
    ).toBeTruthy();

    // 3) ALAKA SIRALAMASI (varsayılan): 3 kez geçen EN ESKİ mesaj, en yeniden ÖNDE olmalı
    const alaka = await ara(request, token, `toplantı ${damga}`);
    expect(
      alaka[0].message.content,
      'alaka sıralaması yok: en alakalı mesaj başta değil (kronolojik sıralanıyor)',
    ).toBe(enAlakali);

    // 4) sort=recent: kronolojik → EN YENİ başta
    const yeni = await ara(request, token, `toplantı ${damga}`, '&sort=recent');
    expect(yeni[0].message.content, 'sort=recent kronolojik sıralamalı').toBe(enYeni);
  });
});
