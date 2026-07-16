import Config

if config_env() == :prod do
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise "environment variable SECRET_KEY_BASE is missing."

  # Üretimde dev-default JWT secret'ıyla açılmayı REDDET (apps/api MustSecure'un karşılığı).
  # Bu koruma olmasaydı, env adı yanlış olduğunda gateway sessizce repo'daki açık dev
  # secret'ına düşüyor ve sahte token kabul ediyordu — tam olarak yaşanan hata buydu.
  jwt = System.get_env("JWT_SECRET")

  if jwt in [nil, "", Gateway.Token.dev_secret()] do
    raise """
    JWT_SECRET üretimde ZORUNLU ve dev-default olamaz.
    Boş/dev-default ise: API'nin imzaladığı token'lar doğrulanamaz (WS 403) VE repo'da
    açık olan dev secret'la üretilmiş SAHTE token'lar kabul edilir.
    """
  end

  # Küme çerezi: node'lar aynı çerez olmadan el sıkışamaz → çok-replica'da presence bölünür
  if System.get_env("CLUSTER_STRATEGY") not in [nil, "none"] and
       System.get_env("RELEASE_COOKIE") in [nil, ""] do
    raise "kümeleme açıkken RELEASE_COOKIE ZORUNLU (node'lar çerezsiz birbirine bağlanamaz)"
  end

  port = String.to_integer(System.get_env("GATEWAY_PORT") || "4000")

  config :gateway, GatewayWeb.Endpoint,
    http: [ip: {0, 0, 0, 0}, port: port],
    secret_key_base: secret_key_base,
    server: true
end
