import { useEffect, useState } from 'react';
import { t, getLocale, setLocale, LOCALES } from '../../i18n';

export function AppearanceTab() {
  const [density, setDensity] = useState(localStorage.getItem('concord_density') ?? 'cozy');
  const [theme, setTheme] = useState(localStorage.getItem('concord_theme') ?? 'dark');
  const [zoom, setZoom] = useState(() =>
    parseInt(localStorage.getItem('concord_zoom') ?? '100', 10),
  );

  function applyDensity(v: string) {
    setDensity(v);
    localStorage.setItem('concord_density', v);
    document.documentElement.dataset.density = v;
  }
  function applyTheme(v: string) {
    setTheme(v);
    localStorage.setItem('concord_theme', v);
    document.documentElement.dataset.theme = v;
  }
  function applyZoom(v: number) {
    setZoom(v);
    localStorage.setItem('concord_zoom', String(v));
    (document.documentElement.style as any).zoom = String(v / 100);
  }
  useEffect(() => {
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.theme = theme;
  }, [density, theme]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-ink-primary mb-5">{t('appearance.title')}</h2>

      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('appearance.language')}</h3>
        <p className="text-xs text-ink-secondary mb-3">{t('appearance.language.sub')}</p>
        <div className="grid grid-cols-2 gap-3">
          {LOCALES.map((l) => (
            <button
              key={l.value}
              onClick={() => {
                if (l.value !== getLocale()) setLocale(l.value);
              }}
              className={
                'p-3 rounded-xl border-2 text-left transition-all flex items-center gap-2 ' +
                (getLocale() === l.value
                  ? 'border-brand-500 bg-brand-500/5'
                  : 'border-line bg-surface-1 hover:border-brand-500/40')
              }
            >
              <span className="text-xl">{l.flag}</span>
              <span className="font-semibold text-ink-primary">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('appearance.density')}</h3>
        <p className="text-xs text-ink-secondary mb-3">
          Mesajlar arası boşluğu ve avatar boyutunu değiştirir.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => applyDensity('cozy')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (density === 'cozy'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">Rahat (Cozy)</div>
            <div className="text-xs text-ink-tertiary">Geniş aralık, büyük avatarlar</div>
          </button>
          <button
            onClick={() => applyDensity('compact')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (density === 'compact'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">Yoğun (Compact)</div>
            <div className="text-xs text-ink-tertiary">Dar satırlar, IRC tarzı</div>
          </button>
        </div>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('appearance.theme')}</h3>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => applyTheme('dark')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (theme === 'dark'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">
              🌙 {t('appearance.theme.dark')}
            </div>
            <div className="text-xs text-ink-tertiary">{t('appearance.theme.darkSub')}</div>
          </button>
          <button
            onClick={() => applyTheme('light')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (theme === 'light'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">
              ☀️ {t('appearance.theme.light')}
            </div>
            <div className="text-xs text-ink-tertiary">{t('appearance.theme.lightSub')}</div>
          </button>
          <button
            onClick={() => applyTheme('amoled')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (theme === 'amoled'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">
              ⚫ {t('appearance.theme.amoled')}
            </div>
            <div className="text-xs text-ink-tertiary">{t('appearance.theme.amoledSub')}</div>
          </button>
        </div>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-ink-primary">Yakınlaştırma Düzeyi</h3>
          <span className="text-sm font-mono text-ink-secondary">{zoom}%</span>
        </div>
        <p className="text-xs text-ink-secondary mb-3">Tüm arayüzü büyütür veya küçültür.</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => applyZoom(Math.max(50, zoom - 10))}
            className="w-8 h-8 rounded-lg bg-surface-1 border border-line text-ink-primary font-bold hover:border-brand-500/40"
          >
            −
          </button>
          <input
            type="range"
            min={50}
            max={150}
            step={10}
            value={zoom}
            onChange={(e) => applyZoom(parseInt(e.target.value, 10))}
            className="flex-1 accent-brand-500"
          />
          <button
            onClick={() => applyZoom(Math.min(150, zoom + 10))}
            className="w-8 h-8 rounded-lg bg-surface-1 border border-line text-ink-primary font-bold hover:border-brand-500/40"
          >
            +
          </button>
          <button
            onClick={() => applyZoom(100)}
            className="text-xs text-ink-tertiary hover:text-ink-primary px-2"
          >
            Sıfırla
          </button>
        </div>
      </div>
    </div>
  );
}
