import Config

# NOT: cache_static_manifest KALDIRILDI — bu gateway saf WebSocket/presence servisidir,
# statik varlık (priv/static) sunmaz. Ayar duruyorken her prod açılışında
# "Could not warm up static assets: could not find static manifest" hatası basıyordu.
config :gateway, GatewayWeb.Endpoint, []

config :logger, level: :info
