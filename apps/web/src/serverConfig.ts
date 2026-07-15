// Sunucu adresi yapılandırması.
// Web'de boş bırakılır → same-origin relative path'ler (dev'de Vite proxy, prod'da nginx).
// Masaüstü (Tauri) paketinde frontend tauri://localhost'tan servis edildiği için relative
// path'ler sunucuya ulaşamaz; bağlanılacak Concord sunucusunun origin'i burada tutulur.
const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('concord_server_base') : null;

export const SERVER_BASE: string =
  ((import.meta as any).env?.VITE_SERVER_BASE as string | undefined) ?? stored ?? '';

// HTTP istekleri için: SERVER_BASE varsa mutlak, yoksa relative (mevcut web davranışı).
export function httpUrl(path: string): string {
  return SERVER_BASE ? SERVER_BASE.replace(/\/$/, '') + path : path;
}

// WebSocket istekleri için: SERVER_BASE varsa onun host'u, yoksa window origin'i.
export function wsUrl(path: string): string {
  if (SERVER_BASE) {
    const u = new URL(SERVER_BASE);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}${path}`;
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}

export function setServerBase(base: string) {
  const v = base.trim().replace(/\/$/, '');
  if (v) localStorage.setItem('concord_server_base', v);
  else localStorage.removeItem('concord_server_base');
}
