import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api';
import { useAppSelector } from '../store';
import { loadEmojiGroups, type EmojiGroup } from '../emojiData';

// Unicode emoji isim/anahtar kelime araması için (Türkçe + İngilizce)
const EMOJI_KEYWORDS: Record<string, string[]> = {
  '👍': ['begendim', 'like', 'thumbs', 'basparmak', 'onay', 'tamam'],
  '👎': ['begenmedim', 'dislike', 'red', 'hayir'],
  '❤️': ['kalp', 'heart', 'love', 'ask', 'kirmizi'],
  '🧡': ['kalp', 'heart', 'turuncu', 'orange'],
  '💛': ['kalp', 'heart', 'sari', 'yellow'],
  '💚': ['kalp', 'heart', 'yesil', 'green'],
  '💙': ['kalp', 'heart', 'mavi', 'blue'],
  '💜': ['kalp', 'heart', 'mor', 'purple'],
  '🖤': ['kalp', 'heart', 'siyah', 'black'],
  '💔': ['kalp', 'heart', 'kirik', 'broken', 'uzgun'],
  '😂': ['gulme', 'kahkaha', 'lol', 'laugh', 'komik', 'joy'],
  '🤣': ['gulme', 'kahkaha', 'rofl', 'laugh', 'komik'],
  '😀': ['gulumseme', 'mutlu', 'smile', 'happy'],
  '😃': ['gulumseme', 'mutlu', 'smile', 'happy'],
  '😄': ['gulumseme', 'mutlu', 'smile', 'happy'],
  '😊': ['gulumseme', 'mutlu', 'smile', 'happy', 'utangac'],
  '😍': ['ask', 'kalp', 'love', 'heart', 'eyes', 'hayran'],
  '🥰': ['ask', 'love', 'sevgi', 'kalpler'],
  '😘': ['opucuk', 'kiss', 'opme'],
  '😎': ['havali', 'cool', 'gozluk', 'sunglasses'],
  '🤔': ['dusunme', 'think', 'merak', 'hmm'],
  '😢': ['aglama', 'cry', 'uzgun', 'sad', 'gozyasi'],
  '😭': ['aglama', 'cry', 'uzgun', 'sad', 'huzun'],
  '😡': ['kizgin', 'angry', 'ofke', 'sinir'],
  '😠': ['kizgin', 'angry', 'ofke', 'sinir'],
  '🥳': ['parti', 'party', 'kutlama', 'celebrate', 'dogumgunu'],
  '😱': ['korku', 'sok', 'scream', 'shock', 'sasirma'],
  '😴': ['uyku', 'sleep', 'yorgun', 'tired'],
  '🤮': ['kusma', 'vomit', 'igrenc', 'sick'],
  '🥵': ['sicak', 'hot', 'terleme'],
  '🥶': ['soguk', 'cold', 'donma'],
  '🔥': ['ates', 'fire', 'yangin', 'sicak', 'efsane'],
  '✨': ['parlak', 'sparkle', 'yildiz', 'isilti'],
  '🎉': ['parti', 'party', 'kutlama', 'celebrate', 'tebrik'],
  '🎂': ['pasta', 'cake', 'dogumgunu', 'birthday'],
  '🙏': ['dua', 'pray', 'rica', 'tesekkur', 'lutfen'],
  '👏': ['alkis', 'clap', 'tebrik', 'bravo'],
  '💯': ['yuz', '100', 'mukemmel', 'tam'],
  '👀': ['gozler', 'eyes', 'bakma', 'izleme'],
  '🤝': ['anlasma', 'handshake', 'el sikisma', 'deal'],
  '💪': ['kas', 'guc', 'strong', 'muscle', 'kuvvet'],
  '🚀': ['roket', 'rocket', 'firlama', 'hizli', 'uzay'],
  '⭐': ['yildiz', 'star', 'favori'],
  '✅': ['onay', 'check', 'tik', 'tamam', 'dogru'],
  '❌': ['carpi', 'cross', 'hayir', 'yanlis', 'iptal'],
  '🐶': ['kopek', 'dog', 'hayvan', 'kucuk'],
  '🐱': ['kedi', 'cat', 'hayvan'],
  '🍕': ['pizza', 'yemek', 'food'],
  '🍔': ['hamburger', 'burger', 'yemek', 'food'],
  '☕': ['kahve', 'coffee', 'icecek', 'cay'],
  '🍺': ['bira', 'beer', 'icki', 'icecek'],
  '⚽': ['futbol', 'football', 'soccer', 'top', 'spor'],
  '🎮': ['oyun', 'game', 'gaming', 'konsol'],
  '🎵': ['muzik', 'music', 'nota', 'sarki'],
  '💰': ['para', 'money', 'zengin', 'kazanc'],
  '🎁': ['hediye', 'gift', 'kutu', 'surpriz'],
};

// Ten rengi değiştiriciler (U+1F3FB..U+1F3FF) + ten rengi destekleyen emoji'ler
const SKIN_TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
const TONE_SWATCH = ['✋', '🏻', '🏼', '🏽', '🏾', '🏿'];

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onPick, onClose }: Props) {
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const [q, setQ] = useState('');
  const [customEmojis, setCustomEmojis] = useState<
    Awaited<ReturnType<typeof api.emojis.list>>
  >([]);
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('concord_recent_emojis') || '[]');
    } catch {
      return [];
    }
  });
  const [favs, setFavs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('concord_fav_emojis') || '[]');
    } catch {
      return [];
    }
  });

  const [tone, setTone] = useState<number>(() => parseInt(localStorage.getItem('concord_skin_tone') || '0', 10));

  // Tam Unicode seti (1900+) — lazy: picker ilk açıldığında yüklenir, sonra cache'ten gelir
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadEmojiGroups()
      .then((g) => !cancelled && setGroups(g))
      .catch(() => !cancelled && setGroups([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // Ten rengi destekleyen emojiler — elle liste yerine veri setinden
  const skinSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups ?? []) for (const x of g.emojis) if (x.s) s.add(x.e);
    return s;
  }, [groups]);

  function applyTone(emoji: string): string {
    if (tone > 0 && skinSet.has(emoji)) {
      // Mevcut variation selector'ı (️) kaldırıp ten rengini ekle
      return emoji.replace('️', '') + SKIN_TONES[tone];
    }
    return emoji;
  }

  function toggleFav(emoji: string) {
    setFavs((prev) => {
      const next = prev.includes(emoji) ? prev.filter((x) => x !== emoji) : [emoji, ...prev].slice(0, 24);
      try { localStorage.setItem('concord_fav_emojis', JSON.stringify(next)); } catch { /* yoksay */ }
      return next;
    });
  }

  function pick(emoji: string) {
    const final = emoji.startsWith(':') ? emoji : applyTone(emoji);
    if (!final.startsWith(':')) {
      const next = [final, ...recent.filter((x) => x !== final)].slice(0, 16);
      setRecent(next);
      try {
        localStorage.setItem('concord_recent_emojis', JSON.stringify(next));
      } catch {
        /* yoksay */
      }
    }
    onPick(final);
  }

  useEffect(() => {
    if (!guildId) return;
    api.emojis.list(guildId).then(setCustomEmojis).catch(() => {});
  }, [guildId]);

  // ESC ile kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Arama: Türkçe anahtar kelimeler (popülerler) + İngilizce resmi ad (tüm 1900+ set)
  const visibleCategories: EmojiGroup[] = useMemo(() => {
    const all = groups ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    const matches: EmojiGroup['emojis'] = [];
    const seen = new Set<string>();
    outer: for (const g of all) {
      for (const x of g.emojis) {
        if (seen.has(x.e)) continue;
        const kws = EMOJI_KEYWORDS[x.e];
        if ((kws && kws.some((k) => k.includes(needle))) || x.n.includes(needle)) {
          seen.add(x.e);
          matches.push(x);
          if (matches.length >= 240) break outer;
        }
      }
    }
    return matches.length > 0 ? [{ name: 'Arama Sonuçları', emojis: matches }] : [];
  }, [groups, q]);

  const filteredCustom = q.trim()
    ? customEmojis.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    : customEmojis;

  return (
    <div className="anim-pop-in w-80 max-h-[400px] flex flex-col bg-surface-1 border border-line rounded-xl shadow-2xl overflow-hidden">
      <div className="p-2 border-b border-line">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Emoji ara..."
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-md pl-8 pr-20 py-1.5 text-sm text-ink-primary placeholder:text-ink-tertiary"
          />
          {/* Ten rengi seçici */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {TONE_SWATCH.map((sw, i) => (
              <button
                key={i}
                onClick={() => { setTone(i); try { localStorage.setItem('concord_skin_tone', String(i)); } catch { /* yoksay */ } }}
                title={i === 0 ? 'Varsayılan ten' : 'Ten rengi ' + i}
                className={'w-4 h-4 text-xs leading-none rounded-sm ' + (tone === i ? 'ring-1 ring-brand-500' : 'opacity-60 hover:opacity-100')}
              >
                {sw}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-y-auto flex-1 p-2">
        {!q.trim() && favs.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider px-1 mb-1 sticky top-0 bg-surface-1 py-0.5 z-10">
              ⭐ Favoriler
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {favs.map((e, i) => (
                <button
                  key={e + i}
                  onClick={() => pick(e)}
                  onContextMenu={(ev) => { ev.preventDefault(); toggleFav(e); }}
                  title="Sağ tık: favorilerden çıkar" aria-label="Sağ tık: favorilerden çıkar"
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-2 text-lg"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {!q.trim() && recent.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider px-1 mb-1 sticky top-0 bg-surface-1 py-0.5 z-10">
              Son Kullanılanlar
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {recent.map((e, i) => (
                <button
                  key={e + i}
                  onClick={() => pick(e)}
                  onContextMenu={(ev) => { ev.preventDefault(); toggleFav(e); }}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-2 text-lg"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {q.trim() && filteredCustom.length === 0 && visibleCategories.length === 0 && (
          <p className="text-sm text-ink-tertiary text-center py-6">"{q}" için emoji bulunamadı.</p>
        )}
        {filteredCustom.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider px-1 mb-1 sticky top-0 bg-surface-1 py-0.5 z-10">
              Bu Sunucu
            </div>
            <div className="grid grid-cols-8 gap-1">
              {filteredCustom.map((e) => (
                <button
                  key={e.id}
                  onClick={() => pick(`:${e.name}:`)}
                  title={`:${e.name}:`}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-2"
                >
                  <img src={e.url} alt={e.name} className="w-6 h-6 object-contain" />
                </button>
              ))}
            </div>
          </div>
        )}
        {groups === null && (
          <div className="py-8 flex justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" aria-label="Emojiler yükleniyor" />
          </div>
        )}
        {visibleCategories.map((cat) => (
          <div key={cat.name} className="mb-2">
            <div className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider px-1 mb-1 sticky top-0 bg-surface-1 py-0.5 z-10">
              {cat.name}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {cat.emojis.map((x) => (
                <button
                  key={x.e}
                  onClick={() => pick(x.e)}
                  onContextMenu={(ev) => { ev.preventDefault(); toggleFav(x.e); }}
                  title={x.n + (favs.includes(x.e) ? ' — sağ tık: favoriden çıkar' : ' — sağ tık: favorile')}
                  className={'w-8 h-8 flex items-center justify-center rounded hover:bg-surface-2 text-lg ' + (favs.includes(x.e) ? 'ring-1 ring-brand-500/40' : '')}
                >
                  {x.e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button onClick={onClose} className="hidden" />
    </div>
  );
}
