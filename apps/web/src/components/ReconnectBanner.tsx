import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

// Hem tarayıcı ağ durumunu (navigator.onLine) hem de gateway WebSocket
// bağlantısını izler. Gateway koparsa ağ açık olsa bile uyarı gösterir.
export function ReconnectBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [gwDown, setGwDown] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    let okTimer: ReturnType<typeof setTimeout> | undefined;
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    const onGw = (e: Event) => {
      const detail = (e as CustomEvent).detail as 'connected' | 'disconnected';
      if (detail === 'disconnected') {
        setGwDown(true);
      } else {
        setGwDown((prev) => {
          if (prev) {
            setJustReconnected(true);
            clearTimeout(okTimer);
            okTimer = setTimeout(() => setJustReconnected(false), 2500);
          }
          return false;
        });
      }
    };
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    window.addEventListener('concord:gw', onGw as EventListener);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
      window.removeEventListener('concord:gw', onGw as EventListener);
      clearTimeout(okTimer);
    };
  }, []);

  const down = !online || gwDown;

  if (!down && !justReconnected) return null;

  if (!down && justReconnected) {
    return (
      <div className="fixed top-0 inset-x-0 z-[200] bg-emerald-500 text-white px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg">
        <Wifi size={14} />
        Yeniden bağlanıldı
      </div>
    );
  }

  return (
    <div className="fixed top-0 inset-x-0 z-[200] bg-accent-500 text-white px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg">
      <WifiOff size={14} className="animate-pulse" />
      {!online ? 'İnternet bağlantısı kesildi — bekleniyor…' : 'Sunucu bağlantısı koptu — yeniden bağlanılıyor…'}
    </div>
  );
}
