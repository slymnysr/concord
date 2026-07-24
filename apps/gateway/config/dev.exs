import Config

config :gateway, GatewayWeb.Endpoint,
  # Port env'den: kümelemeyi yerelde denemek için AYNI makinede birden çok node
  # gerekiyor (GATEWAY_PORT=4001 ... 4002 ...). Sabit port bunu imkânsız kılıyordu.
  # Prod ile aynı değişken adı (runtime.exs) — iki yerde iki isim olmasın.
  http: [ip: {0, 0, 0, 0}, port: String.to_integer(System.get_env("GATEWAY_PORT") || "4000")],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: "dev_secret_key_base_change_in_production_at_least_64_chars_long_string_here",
  watchers: []

config :logger, level: :debug

config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime
