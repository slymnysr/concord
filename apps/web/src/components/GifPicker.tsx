import { useEffect, useState, useRef } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api';
import { useAppDispatch } from '../store';
import { t, errText } from '../i18n';

// Giphy public API. Kendi anahtarınızı localStorage 'concord_giphy_key' ile override edebilirsiniz.
const GIPHY_KEY =
  (typeof localStorage !== 'undefined' && localStorage.getItem('concord_giphy_key')) ||
  'dc6zaTOxFJmzC';

interface Gif {
  id: string;
  url: string; // oynatılabilir gif url
  preview: string;
  width: number;
  height: number;
}

interface Props {
  channelId: string;
  onClose: () => void;
}

export function GifPicker({ channelId, onClose }: Props) {
  const dispatch = useAppDispatch();
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function parse(data: any): Gif[] {
    return (data?.data ?? [])
      .map((g: any) => ({
        id: g.id,
        url:
          g.images?.downsized_medium?.url || g.images?.fixed_height?.url || g.images?.original?.url,
        preview: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url,
        width: parseInt(g.images?.fixed_height?.width ?? '0', 10),
        height: parseInt(g.images?.fixed_height?.height ?? '0', 10),
      }))
      .filter((g: Gif) => g.url);
  }

  async function load(query: string) {
    setLoading(true);
    setErr(null);
    try {
      const base = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
      const res = await fetch(base);
      if (!res.ok) throw new Error(t('gif.serviceError', { status: res.status }));
      setGifs(parse(await res.json()));
    } catch (e: any) {
      setErr(errText(e, t('gif.loadFailed')));
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load('');
  }, []);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q), 400);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function pick(g: Gif) {
    onClose();
    try {
      const msg = await api.channels.sendMessage(channelId, ' ', [
        { url: g.url, filename: 'gif.gif', content_type: 'image/gif', size_bytes: 0 },
      ]);
      dispatch({
        type: 'messages/send/fulfilled',
        payload: msg,
        meta: { arg: { channelId, content: ' ' } },
      });
    } catch {
      /* yoksay */
    }
  }

  return (
    <div className="w-80 max-h-[420px] flex flex-col bg-surface-1 border border-line rounded-xl shadow-2xl overflow-hidden">
      <div className="p-2 border-b border-line">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary"
          />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('gif.searchPlaceholder')}
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-md pl-8 pr-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-tertiary"
          />
        </div>
      </div>
      <div className="overflow-y-auto flex-1 p-2">
        {loading ? (
          <p className="text-sm text-ink-tertiary text-center py-8">{t('common.loading')}</p>
        ) : err ? (
          <p className="text-sm text-accent-500 text-center py-8 px-3">
            {err}
            <br />
            <span className="text-xs text-ink-tertiary">
              {t('gif.keyHint')} <code>concord_giphy_key</code>
            </span>
          </p>
        ) : gifs.length === 0 ? (
          <p className="text-sm text-ink-tertiary text-center py-8">{t('common.noResults')}</p>
        ) : (
          <div className="columns-2 gap-1.5">
            {gifs.map((g) => (
              <button
                key={g.id}
                onClick={() => pick(g)}
                className="mb-1.5 w-full block rounded-lg overflow-hidden hover:ring-2 hover:ring-brand-500 transition"
              >
                <img src={g.preview} alt="gif" loading="lazy" className="w-full" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="px-2 py-1 border-t border-line text-[10px] text-ink-tertiary text-right">
        {t('gif.poweredBy')}
      </div>
    </div>
  );
}
