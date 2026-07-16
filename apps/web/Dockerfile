# Concord Web (React/Vite) — prod imajı: statik build + nginx
# Derleme bağlamı: REPO KÖKÜ (pnpm workspace gerekir)
#   docker build -f apps/web/Dockerfile -t concord-web .

FROM node:20-bookworm-slim AS builder
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/

RUN pnpm install --filter @concord/web... --frozen-lockfile

COPY apps/web ./apps/web
# tsc -b tip hatalarında build'i kesmesin diye vite build tek başına (tipler CI'da denetlenir)
RUN pnpm --filter @concord/web exec vite build

# --- runtime ---
FROM nginx:1.27-alpine
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/security-headers.inc /etc/nginx/security-headers.inc
# resolver'ı ortamdan üreten betik (nginx başlamadan önce çalışır)
COPY apps/web/docker-entrypoint.d/19-resolver.sh /docker-entrypoint.d/19-resolver.sh
RUN chmod +x /docker-entrypoint.d/19-resolver.sh
EXPOSE 80
