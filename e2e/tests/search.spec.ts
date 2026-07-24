import { test, expect } from '@playwright/test';
import { makeUser, registerViaApi, createGuild, guildChannels, sendMessage, API } from './helpers';

/**
 * Arama sözleşmesi (FAZ A + FAZ H). Bu testler gerçek kusurları kilitliyor:
 *  1. 'simple' config kök bulmuyordu → "mesajlar" araması "mesaj"ı bulmuyordu.
 *  2. ASCII yazım hiç eşleşmiyordu → "toplanti" araması "toplantı"yı bulmuyordu.
 *     Türkiye'de kullanıcıların çoğu Türkçe karakter yazmaz → arama pratikte çalışmıyordu.
 *  3. Sıralama m.id DESC idi → alaka sıralaması yoktu; en alakalı sonuç sayfalarca aşağıda.
 */
/**
 * İzolasyon KANAL FİLTRESİYLE yapılır, sorguya damga ekleyerek DEĞİL.
 * Sebep: Meilisearch önek eşleşmesini yalnızca SON kelimeye uygular. Sorguya damga
 * eklenirse ("toplantı dbg123") aranan kelime son olmaktan çıkar ve "toplantılar"
 * gibi çekimli biçimler eşleşmez — yani test motoru değil, kendi kurgusunu ölçer.
 * Gerçek kullanıcı da "toplantı" arar, "toplantı dbg123" değil.
 */
async function ara(request: any, token: string, q: string, chId?: string, extra = '') {
  const ch = chId ? `&channel_id=${chId}` : '';
  const r = await request.get(
    `${API}/api/v1/search/messages?q=${encodeURIComponent(q)}${ch}${extra}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  expect(r.ok(), `arama başarısız: ${r.status()}`).toBeTruthy();
  return (await r.json()) as { message: { content: string } }[];
}

test.describe('Arama', () => {
  test('Türkçe kök bulma + ASCII yazım + alaka sıralaması', async ({ request }) => {
    const u = makeUser('ara');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-A ${Date.now()}`);
    const ch = (await guildChannels(request, token, guild.id)).find((c: any) => c.type === 'text');

    // ALAKA testinin ayırt edici olması için: en alakalı mesaj EN ESKİ olmalı.
    // (En alakalı aynı zamanda en yeniyse, kronolojik sıralama da aynı sonucu verir →
    //  test alaka sıralamasını doğrulamış olmaz, yanıltıcı yeşil yanar.)
    const enAlakali = 'toplantı toplantı toplantı';
    await sendMessage(request, token, ch.id, enAlakali);
    await sendMessage(request, token, ch.id, 'alakasız içerik');
    const enYeni = 'yarınki toplantılar uzun sürecek';
    await sendMessage(request, token, ch.id, enYeni);
    // İndeksleme asenkron
    await new Promise((r) => setTimeout(r, 3000));

    // 1) KÖK BULMA: "toplantı" → çekimli "toplantılar"ı da bulmalı
    const kok = await ara(request, token, 'toplantı', ch.id);
    expect(
      kok.some((x) => x.message.content === enYeni),
      'kök bulma yok: "toplantı" araması "toplantılar" içeren mesajı bulamadı',
    ).toBeTruthy();

    // 2) ASCII YAZIM: "toplanti" (Türkçe karaktersiz) → "toplantı"yı bulmalı
    const ascii = await ara(request, token, 'toplanti', ch.id);
    expect(
      ascii.some((x) => x.message.content === enAlakali),
      'ASCII yazım eşleşmiyor: "toplanti" araması "toplantı" içeren mesajı bulamadı',
    ).toBeTruthy();

    // 3) ALAKA SIRALAMASI (varsayılan): 3 kez geçen EN ESKİ mesaj, en yeniden ÖNDE olmalı
    const alaka = await ara(request, token, 'toplantı', ch.id);
    expect(
      alaka[0].message.content,
      'alaka sıralaması yok: en alakalı mesaj başta değil (kronolojik sıralanıyor)',
    ).toBe(enAlakali);

    // 4) sort=recent: kronolojik → EN YENİ başta
    const yeni = await ara(request, token, 'toplantı', ch.id, '&sort=recent');
    expect(yeni[0].message.content, 'sort=recent kronolojik sıralamalı').toBe(enYeni);
  });

  /**
   * FAZ H — GLOBAL diller. Uygulama global; Postgres FTS bu vakaların BEŞİNDE ÇÖKÜYORDU
   * (ölçüldü, docs/DENETIM-GLOBAL.md): CJK'yı kelimelere ayıramıyor (Japonca/Çince cümle
   * TEK TOKEN olarak indeksleniyor → arama hiç çalışmıyor), Rusça kök bulmuyor, turkish
   * config Almanca'yı bozuyor. Meilisearch hepsini geçiyor.
   *
   * Bu test motorun VARLIK SEBEBİ. Düşerse Meilisearch'e geçmenin anlamı kalmamıştır.
   */
  test('global diller: JA/ZH/KO/RU/DE aranabiliyor', async ({ request }) => {
    const u = makeUser('glob');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-G ${Date.now()}`);
    const ch = (await guildChannels(request, token, guild.id)).find((c: any) => c.type === 'text');

    const mesajlar: Record<string, string> = {
      メッセージ: 'メッセージがあります',
      消息: '这是一条消息',
      메시지: '메시지가 있습니다',
      сообщение: 'сообщения здесь',
      Nachricht: 'die Nachrichten sind da',
    };
    for (const icerik of Object.values(mesajlar)) {
      await sendMessage(request, token, ch.id, icerik);
    }
    // İndeksleme ASENKRON (arka planda) → hemen sorgulamak boş sonuç verir
    await new Promise((r) => setTimeout(r, 3000));

    for (const [sorgu, beklenen] of Object.entries(mesajlar)) {
      const sonuc = await ara(request, token, sorgu, ch.id);
      expect(
        sonuc.some((x) => x.message.content === beklenen),
        `"${sorgu}" araması "${beklenen}" mesajını bulamadı — global arama kırık ` +
          `(Postgres FTS yedeğine mi düşüldü? MEILI_ADDR kontrol et)`,
      ).toBeTruthy();
    }
  });

  /** Silinen mesaj aramada KALMAMALI — indeks senkronu bağlı mı. */
  test('index senkronu: düzenlenen eski metniyle bulunmaz, silinen hiç bulunmaz', async ({
    request,
  }) => {
    const u = makeUser('sync');
    const token = await registerViaApi(request, u);
    const guild = await createGuild(request, token, `E2E-S ${Date.now()}`);
    const ch = (await guildChannels(request, token, guild.id)).find((c: any) => c.type === 'text');

    const damga = Date.now().toString(36);
    const msg = await sendMessage(request, token, ch.id, `eskikelime-${damga} burada`);
    await new Promise((r) => setTimeout(r, 2500));
    expect(
      (await ara(request, token, `eskikelime-${damga}`, ch.id)).length,
      'yeni mesaj indekslenmedi',
    ).toBe(1);

    await request.patch(`${API}/api/v1/messages/${msg.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { content: `yenikelime-${damga} burada` },
    });
    await new Promise((r) => setTimeout(r, 2500));
    expect(
      (await ara(request, token, `eskikelime-${damga}`, ch.id)).length,
      'düzenlenen mesaj ESKİ metniyle bulunuyor — indeks bayat',
    ).toBe(0);
    expect(
      (await ara(request, token, `yenikelime-${damga}`, ch.id)).length,
      'yeni metin bulunmuyor',
    ).toBe(1);

    await request.delete(`${API}/api/v1/messages/${msg.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await new Promise((r) => setTimeout(r, 2500));
    expect(
      (await ara(request, token, `yenikelime-${damga}`, ch.id)).length,
      'SİLİNEN mesaj hâlâ aramada — unindex bağlı değil',
    ).toBe(0);
  });
});
