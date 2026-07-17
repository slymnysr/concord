#!/usr/bin/env node
/**
 * FAZ K kabul denetimi — mobil i18n regresyon koruması.
 *
 * NEDEN STATİK: mobilde asıl kusur "cihaz dili İngilizce ama arayüz Türkçe" idi; kökü
 * kaynakta GÖMÜLÜ Türkçe stringlerdi (238 tane, i18n hiç yoktu). Gerçek cihazda çalıştırmak
 * emülatör/EAS ister (bloke); ama regresyonu üreten şey — kaynağa yeni Türkçe string
 * eklemek — burada kesin olarak yakalanır.
 *
 * İki şey doğrular:
 *  1. Kaynakta (console/yorum dışında) gömülü Türkçe metin YOK
 *  2. tr ve en sözlükleri AYNI anahtarlara sahip (eksik anahtar = o dilde metin kaybolur)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname;
const TR = /[çğıöşüÇĞİÖŞÜ]/;

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p);
  }
  return out;
}

const jsx = /<[^>]*>(\s*)([^<>{}\n]*[çğıöşüÇĞİÖŞÜ][^<>{}\n]*?)(\s*)</g;
const jsxText = />(\s*)([^<>{}\n]*[çğıöşüÇĞİÖŞÜ][^<>{}\n]*?)(\s*)</g;
const str = /['"]([^'"\\\n]*[çğıöşüÇĞİÖŞÜ][^'"\\\n]*)['"]/g;

let hata = 0;

// 1) Gömülü Türkçe
for (const f of walk(SRC)) {
  if (basename(f) === 'i18n.ts') continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    // Yorumlar ve konsol/log satırları hariç (kullanıcıya gitmezler)
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || line.includes('console.'))
      return;
    for (const m of [...line.matchAll(jsxText)]) {
      const txt = m[2].trim();
      if (txt && !txt.startsWith('{')) {
        console.error(`❌ ${f}:${i + 1} gömülü Türkçe JSX metni: "${txt.slice(0, 50)}"`);
        hata++;
      }
    }
    for (const m of [...line.matchAll(str)]) {
      if (m[1].trim().length > 1) {
        console.error(`❌ ${f}:${i + 1} gömülü Türkçe string: "${m[1].slice(0, 50)}"`);
        hata++;
      }
    }
  });
}

// 2) Sözlük paritesi
const i18n = readFileSync(join(SRC, 'i18n.ts'), 'utf8');
function keys(name) {
  const m = i18n.match(new RegExp(`const ${name}: Dict = \\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`${name} sözlüğü bulunamadı`);
  return new Set([...m[1].matchAll(/^\s*['"]([^'"]+)['"]:/gm)].map((x) => x[1]));
}
const tr = keys('tr');
const en = keys('en');
for (const k of tr)
  if (!en.has(k)) {
    console.error(`❌ '${k}' tr'de var, en'de YOK → İngilizce arayüzde metin kaybolur`);
    hata++;
  }
for (const k of en)
  if (!tr.has(k)) {
    console.error(`❌ '${k}' en'de var, tr'de YOK`);
    hata++;
  }

if (hata) {
  console.error(`\n${hata} sorun — mobil i18n kırık.`);
  process.exit(1);
}
console.log(`✓ mobil i18n temiz (gömülü Türkçe yok; tr/en paritesi ${tr.size}/${en.size})`);
