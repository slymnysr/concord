import { useEffect, useState } from 'react';
import { api } from '../../api';
import { playMentionSound, playMessageSound } from '../../notifSound';
import { AudioToggle } from './shared';
import { t, errText } from '../../i18n';

export function NotificationsTab() {
  const [enabled, setEnabled] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const [subscribed, setSubscribed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {}
    })();
  }, []);

  async function enable() {
    if (typeof Notification === 'undefined') return;
    const r = await Notification.requestPermission();
    setEnabled(r);
    if (r !== 'granted') return;
    // Service worker + push subscribe
    setErr(null);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      // Concord public VAPID key (dev için sabit). Production'da backend'den getirilir.
      // Bu placeholder — gerçek push gönderim için backend webpush kütüphanesi ile imzalanır.
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true });
      const json = sub.toJSON() as any;
      await api.push.subscribe({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      });
      setSubscribed(true);
    } catch (e: any) {
      setErr(errText(e, t('notif.pushFailed')));
    }
  }

  async function disable() {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      await api.push.unsubscribeAll();
      setSubscribed(false);
    } catch {}
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-5">{t('settings.notifications')}</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('notif.desktop')}</h3>
        <p className="text-sm text-ink-secondary mb-3">
          Concord sekmesi açık değilken bile DM ve mention bildirimleri göstersin.
        </p>
        {err && <p className="text-accent-500 text-sm mb-2">{err}</p>}
        {enabled === 'granted' && subscribed ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-status-online flex-1">✓ Bildirimler aktif</p>
            <button
              onClick={disable}
              className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary text-sm font-semibold"
            >
              Aboneliği iptal et
            </button>
          </div>
        ) : enabled === 'denied' ? (
          <p className="text-sm text-accent-500">
            Bildirim izni reddedilmiş. Tarayıcı ayarlarından açabilirsin.
          </p>
        ) : (
          <button
            onClick={enable}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white font-semibold"
          >
            {t('ui.bildirimleriAc')}
          </button>
        )}
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 mt-4 space-y-1">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('notif.prefs')}</h3>
        <AudioToggle
          storageKey="concord_desktop_notif"
          label={t('notif.showDesktop')}
          desc="Sekme arka plandayken DM/mention için sistem bildirimi"
        />
        <AudioToggle
          storageKey="concord_sound_mention"
          label={t('notif.mentionSound')}
          desc="Biri seni etiketlediğinde veya DM attığında ses çal"
        />
        <AudioToggle
          storageKey="concord_sound_message"
          label={t('notif.messageSound')}
          desc="Açık olmayan kanallara mesaj geldiğinde ses çal"
        />
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => playMentionSound()}
            className="text-xs px-2.5 py-1 rounded-lg bg-surface-3 hover:bg-surface-1 text-ink-secondary"
          >
            ▶ Mention sesi
          </button>
          <button
            onClick={() => playMessageSound()}
            className="text-xs px-2.5 py-1 rounded-lg bg-surface-3 hover:bg-surface-1 text-ink-secondary"
          >
            ▶ Mesaj sesi
          </button>
        </div>
      </div>

      <KeywordManager />
    </div>
  );
}

function KeywordManager() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.keywords
      .list()
      .then((k) => {
        setKeywords(k);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function persist(next: string[]) {
    setKeywords(next);
    await api.keywords.set(next).catch(() => {});
  }
  function add() {
    const k = input.trim().toLowerCase();
    if (!k || keywords.includes(k) || keywords.length >= 50) {
      setInput('');
      return;
    }
    persist([...keywords, k]);
    setInput('');
  }

  return (
    <div className="bg-surface-2 rounded-xl border border-line p-4 mt-4">
      <h3 className="text-sm font-bold text-ink-primary mb-2">{t('notif.keywords')}</h3>
      <p className="text-xs text-ink-secondary mb-3">
        Bu kelimeler herhangi bir sunucudaki bir mesajda geçtiğinde sana bildirim gönderilir
        (mention gibi).
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {loading ? (
          <span className="text-xs text-ink-tertiary">{t('common.loading')}</span>
        ) : keywords.length === 0 ? (
          <span className="text-xs text-ink-tertiary">{t('notif.noKeywords')}</span>
        ) : (
          keywords.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-surface-3 text-ink-secondary"
            >
              {k}
              <button
                onClick={() => persist(keywords.filter((x) => x !== k))}
                className="text-ink-tertiary hover:text-accent-500"
                title={t('common.remove')}
                aria-label={t('common.remove')}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          maxLength={50}
          placeholder={t('notif.keywordPlaceholder')}
          className="flex-1 bg-surface-1 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-1.5 text-sm text-ink-primary"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm font-semibold"
        >
          Ekle
        </button>
      </div>
    </div>
  );
}
