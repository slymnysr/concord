# Concord Voice SFU (mediasoup) — prod imajı
# Derleme bağlamı: REPO KÖKÜ (pnpm workspace gerekir)
#   docker build -f apps/voice/Dockerfile -t concord-voice .
#
# NOT: mediasoup worker'ı native derlenir → Python3 + g++ + make şarttır.
# NOT: Ağ modu — mediasoup RTC portları host'a doğrudan açılmalıdır (--network=host
# veya RTC port aralığını publish et; NAT arkasında ANNOUNCED_IP ayarla).

FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /repo
# Workspace iskeleti — bağımlılık katmanı kod değişince yeniden kullanılsın
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/voice/package.json ./apps/voice/

RUN pnpm install --filter @concord/voice... --frozen-lockfile

COPY apps/voice ./apps/voice
RUN pnpm --filter @concord/voice build

# Prod bağımlılıkları (mediasoup worker binary'si dahil) ayrı ağaca
RUN pnpm --filter @concord/voice deploy --prod /out

# --- runtime ---
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -u 10001 -m concord

WORKDIR /app
COPY --from=builder --chown=concord:concord /out ./
USER concord

# 4443 = signaling WS, 4444 = kontrol/presence HTTP, 40000-40100 = RTC (UDP/TCP)
EXPOSE 4443 4444
ENTRYPOINT ["node", "dist/index.js"]
