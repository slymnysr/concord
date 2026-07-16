// Concord masaüstü (Tauri) köprüsü — tarayıcıda tamamen no-op.
// Tauri API'leri dinamik import edilir; web bundle'ında ayrı lazy chunk olarak kalır
// ve yalnızca masaüstü penceresinde yüklenir.
import { setActivity, getMyActivity } from './gateway';
import { voice } from './voice';

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function initDesktopBridge() {
  if (!isDesktop()) return;

  // 1) Harici linkler sistem tarayıcısında açılsın (webview içinde gezinme olmasın)
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.href;
      if (/^https?:\/\//i.test(href) && !href.startsWith(location.origin)) {
        e.preventDefault();
        import('@tauri-apps/plugin-opener').then((m) => m.openUrl(href)).catch(() => {});
      }
    },
    true,
  );

  import('@tauri-apps/api/event')
    .then(({ listen }) => {
      // 2) Oyun algılama → otomatik "Oynuyor" (elle ayarlanmış aktivite her zaman önceliklidir)
      let autoGameActive = false;
      void listen<string>('game-detected', (ev) => {
        const manual = (() => {
          try {
            return localStorage.getItem('concord_activity');
          } catch {
            return null;
          }
        })();
        if (manual && !autoGameActive) return; // kullanıcı elle aktivite ayarlamış — dokunma
        autoGameActive = true;
        setActivity({ type: 'playing', name: ev.payload }, { persist: false });
      });
      void listen('game-stopped', () => {
        if (!autoGameActive) return;
        autoGameActive = false;
        // Elle ayarlanmış aktivite varsa ona geri dön, yoksa temizle
        const stored = (() => {
          try {
            const raw = localStorage.getItem('concord_activity');
            return raw ? (JSON.parse(raw) as { type: any; name: string }) : null;
          } catch {
            return null;
          }
        })();
        if (stored?.name) setActivity({ type: stored.type, name: stored.name });
        else setActivity(null, { persist: false });
      });

      // 3) Global susturma kısayolu (Ctrl+Shift+M — pencere odakta olmasa da çalışır)
      void listen('toggle-mute', () => {
        voice.toggleMicrophone();
      });
    })
    .catch(() => {});

  void getMyActivity; // (gelecek kullanım için içe aktarım korunuyor)
}
