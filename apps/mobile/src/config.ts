// Sunucu adresi — telefon, bilgisayardaki Concord servislerinin LAN IP'sine bağlanır.
// Tek "host" girilir (örn. http://192.168.1.34); API 8080, gateway 4000 portundan türetilir.
// Prod'da tek origin (nginx) girildiğinde portsuz da çalışır.
import AsyncStorage from '@react-native-async-storage/async-storage';

const HOST_KEY = 'concord_host';

let cachedHost = '';

export async function loadHost(): Promise<string> {
  try {
    cachedHost = (await AsyncStorage.getItem(HOST_KEY)) ?? '';
  } catch {
    cachedHost = '';
  }
  return cachedHost;
}

export async function setHost(host: string): Promise<void> {
  cachedHost = host.trim().replace(/\/$/, '');
  try {
    await AsyncStorage.setItem(HOST_KEY, cachedHost);
  } catch {}
}

export function getHost(): string {
  return cachedHost;
}

function hostParts(): { proto: string; hostname: string; hasPort: boolean } {
  const h = cachedHost || 'http://localhost';
  const m = h.match(/^(https?):\/\/([^/:]+)(:\d+)?/i);
  if (!m) return { proto: 'http', hostname: h.replace(/^.*:\/\//, ''), hasPort: false };
  return { proto: m[1].toLowerCase(), hostname: m[2], hasPort: !!m[3] };
}

// API kökü: portlu host girildiyse aynen, çıplak host ise :8080 (dev düzeni)
export function apiBase(): string {
  const { proto, hostname, hasPort } = hostParts();
  if (hasPort) return cachedHost + '/api/v1';
  const port = proto === 'https' ? '' : ':8080';
  return `${proto}://${hostname}${port}/api/v1`;
}

// Gateway WS: çıplak host ise :4000 (dev), portlu/https ise aynı origin
export function gatewayUrl(): string {
  const { proto, hostname, hasPort } = hostParts();
  const ws = proto === 'https' ? 'wss' : 'ws';
  if (hasPort || proto === 'https') {
    const m = cachedHost.match(/^https?:\/\/(.+)$/i);
    return `${ws}://${m ? m[1] : hostname}/socket`;
  }
  return `${ws}://${hostname}:4000/socket`;
}

// Voice signaling WS: çıplak host ise :4443 (dev), portlu/https ise nginx /voice-ws/
export function voiceWsUrl(channelId: string, token: string): string {
  const { proto, hostname, hasPort } = hostParts();
  const q = `?token=${encodeURIComponent(token)}&channel=${encodeURIComponent(channelId)}`;
  if (hasPort || proto === 'https') {
    const ws = proto === 'https' ? 'wss' : 'ws';
    const m = cachedHost.match(/^https?:\/\/(.+)$/i);
    return `${ws}://${m ? m[1] : hostname}/voice-ws/${q}`;
  }
  return `ws://${hostname}:4443/${q}`;
}
