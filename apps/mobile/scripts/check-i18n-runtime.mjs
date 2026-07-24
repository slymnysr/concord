#!/usr/bin/env node
/**
 * Mobil i18n ÇALIŞMA-ZAMANI denetimi — "cihaz dili → arayüz dili" gerçekten çalışıyor mu?
 *
 * NEDEN AYRI BİR DENETİM: check-i18n.mjs sözlüklerin DOLU olduğunu, tsc de anahtarların
 * TAM olduğunu doğrular. İkisi de locale SEÇİMİNİ test etmez. Bu betik yazılırken i18n.ts'te
 * tam olarak şunlar vardı:
 *
 *     const tag = getLocales()[0]?.languageCode ?? 'en';
 *     return tag === 'tr' ? 'tr' : 'en';        // deviceLocale()
 *     const d = current === 'en' ? en : tr;     // t()
 *     return current === 'en' ? 'en-US' : 'tr-TR';  // localeTag()
 *
 * Yani DE/FR/ES/PT/JA sözlükleri (1350 çeviri) doluydu, tsc yeşildi, parite denetimi
 * yeşildi — ama Almanca telefon İngilizce arayüz görüyordu. Sözlükler ÖLÜ KODDU.
 * Mobilde dil seçici arayüzü yoktur; locale'in TEK kaynağı cihaz dilidir → bu zincir
 * koparsa özelliğin tamamı sessizce yok olur.
 *
 * NASIL: GERÇEK src/i18n.ts paketlenir; yalnızca iki PLATFORM API'si sahtelenir
 * (expo-localization = cihaz dili, AsyncStorage = kayıtlı tercih). Test edilen mantık
 * (normalize/deviceLocale/t/localeTag) gerçek koddur.
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const SRC = new URL('../src/i18n.ts', import.meta.url).pathname;

// Her dilde AYIRT EDİCİ bir metin + beklenen Intl etiketi. Metinler i18n.ts'ten okunmaz —
// elle yazılır; sözlükten okumak "sözlük neyse o" demek olur ve hiçbir şey kanıtlamazdı.
const BEKLENEN = {
  tr: ['Arkadaşlar', 'tr-TR'],
  en: ['Friends', 'en-US'],
  de: ['Freunde', 'de-DE'],
  fr: ['Amis', 'fr-FR'],
  es: ['Amigos', 'es-ES'],
  pt: ['Amigos', 'pt-BR'],
  ja: ['フレンド', 'ja-JP'],
};
const ANAHTAR = 'friends.title';

const dir = mkdtempSync(join(tmpdir(), 'concord-i18n-'));
try {
  writeFileSync(
    join(dir, 'loc.js'),
    'export function getLocales() { return [{ languageCode: process.env.DEV_LANG || null }]; }\n',
  );
  writeFileSync(
    join(dir, 'store.js'),
    'export default { getItem: async () => process.env.SAVED_LANG || null, setItem: async () => {} };\n',
  );

  const require = createRequire(import.meta.url);
  const esbuild = require.resolve('esbuild/bin/esbuild');
  const bundle = join(dir, 'i18n.mjs');
  try {
    execFileSync(
      esbuild,
      [
        SRC,
        '--bundle',
        '--format=esm',
        `--outfile=${bundle}`,
        `--alias:expo-localization=${join(dir, 'loc.js')}`,
        `--alias:@react-native-async-storage/async-storage=${join(dir, 'store.js')}`,
      ],
      // 'pipe': esbuild'in boyut/süre özeti gürültü — başarıda susmalı.
      { stdio: 'pipe' },
    );
  } catch (e) {
    // execFileSync stderr'i err.stderr'e KOYAR ama BASMAZ: yakalamazsak CI'da hata
    // "Command failed: /uzun/yol/esbuild …" olur ve NEDENİ hiç görünmez.
    console.error('❌ i18n.ts paketlenemedi:\n' + (e.stderr?.toString() || e.message));
    process.exit(1);
  }

  writeFileSync(
    join(dir, 'run.mjs'),
    `import { t, getLocale, localeTag, loadLocale } from ${JSON.stringify(bundle)};
await loadLocale();
console.log(JSON.stringify({ loc: getLocale(), metin: t(${JSON.stringify(ANAHTAR)}), tag: localeTag() }));`,
  );

  // Diller Locale tipinden okunur — yeni dil eklenip buraya beklenen değer yazılmazsa
  // denetim SESSİZCE atlamak yerine hata verir.
  const tip = readFileSync(SRC, 'utf8').match(/export type Locale =\s*([^;]+);/);
  const diller = [...tip[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);

  let hata = 0;
  for (const dil of diller) {
    if (!BEKLENEN[dil]) {
      console.error(`❌ '${dil}' Locale'de var ama bu denetimde beklenen değeri yok — ekle`);
      hata++;
      continue;
    }
    const [metin, tag] = BEKLENEN[dil];
    const r = JSON.parse(
      execFileSync(process.execPath, [join(dir, 'run.mjs')], {
        env: { ...process.env, DEV_LANG: dil, SAVED_LANG: '' },
        encoding: 'utf8',
      }),
    );
    if (r.loc !== dil || r.metin !== metin || r.tag !== tag) {
      console.error(
        `❌ cihaz dili '${dil}' → locale='${r.loc}' t()='${r.metin}' tag='${r.tag}' ` +
          `(beklenen locale='${dil}' t()='${metin}' tag='${tag}')`,
      );
      hata++;
    }
  }

  // Desteklenmeyen cihaz dili İngilizceye düşmeli (Türkçe'ye DEĞİL — global kullanıcıya
  // anlamadığı bir arayüz göstermek olurdu)
  const pl = JSON.parse(
    execFileSync(process.execPath, [join(dir, 'run.mjs')], {
      env: { ...process.env, DEV_LANG: 'pl', SAVED_LANG: '' },
      encoding: 'utf8',
    }),
  );
  if (pl.loc !== 'en') {
    console.error(`❌ desteklenmeyen cihaz dili (pl) → '${pl.loc}' (beklenen 'en')`);
    hata++;
  }

  if (hata) {
    console.error(`\n${hata} sorun — cihaz dili arayüze uygulanmıyor.`);
    process.exit(1);
  }
  console.log(`✓ mobil i18n çalışma-zamanı: ${diller.length} dil cihaz dilinden doğru uygulanıyor`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
