# Concord Gateway (Phoenix) — prod imajı
# Derleme bağlamı: apps/gateway (Elixir kendi kendine yeter, pnpm workspace gerekmez)
#   docker build -t concord-gateway apps/gateway

FROM hexpm/elixir:1.16.3-erlang-26.2.5-alpine-3.19.1 AS builder

RUN apk add --no-cache build-base git
WORKDIR /app

ENV MIX_ENV=prod
RUN mix local.hex --force && mix local.rebar --force

# Bağımlılıklar önce → kod değişince katman yeniden kullanılır
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod && mix deps.compile

COPY config ./config
COPY lib ./lib
# NOT: bu gateway'de priv/ YOK (statik varlık/migration yok — saf WS + presence).
# İleride priv/ eklenirse buraya `COPY priv ./priv` satırı eklenmeli.

RUN mix compile && mix release

# --- runtime ---
FROM alpine:3.19
RUN apk add --no-cache libstdc++ ncurses-libs openssl ca-certificates \
    && adduser -D -u 10001 concord
WORKDIR /app
COPY --from=builder --chown=concord:concord /app/_build/prod/rel/gateway ./
USER concord

ENV PHX_SERVER=true
EXPOSE 4000
ENTRYPOINT ["/app/bin/gateway"]
CMD ["start"]
