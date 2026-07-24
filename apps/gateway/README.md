# Concord Gateway

Phoenix tabanlı WebSocket gateway. Tüm gerçek zamanlı bağlantıların giriş noktası.

## Kurulum

Elixir 1.16+ ve Erlang/OTP 26+ gerekir.

```bash
# Elixir kurulumu (Ubuntu/WSL)
sudo apt-get install elixir erlang-dev erlang-xmerl

# Bağımlılıklar
mix deps.get

# Geliştirme sunucusu
mix phx.server
```

## Endpoint'ler

- `GET /health` — sağlık kontrolü
- `WS /socket/websocket` — WebSocket giriş noktası

## Bağlantı testi

```javascript
import { Socket } from 'phoenix';

const socket = new Socket('ws://localhost:4000/socket', {
  params: { token: 'dev_user123' }, // Faz 1'de gerçek JWT
});
socket.connect();

const channel = socket.channel('guild:test', {});
channel.join().receive('ok', () => console.log('Joined'));
channel.push('ping').receive('ok', (r) => console.log(r));
```
