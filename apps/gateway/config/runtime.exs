import Config

# Depo kökündeki .env'i yükle — TEK dosya tüm yığını beslesin diye (apps/api'deki
# config.loadDotEnv'in Elixir karşılığı).
#
# NEDEN GEREKLİ: gateway `mix phx.server` ile apps/gateway'den çalışır ve Elixir env
# dosyası okumaz. Bu olmadan .env'de JWT_SECRET değiştirmek API'yi günceller ama gateway'i
# GÜNCELLEMEZ → gateway aşağıdaki dev-default'a düşer, API'nin imzaladığı token'ları
# doğrulayamaz ve HER WS bağlantısı 403 alır. Belirti sinsi: HTTP çalışır, sadece realtime
# ölür ("yeniden bağlanılıyor" banner'ı). Bu ölçüldü, varsayılmadı.
#
# ZATEN SET EDİLMİŞ değişkenler EZİLMEZ: k8s/CI env'i .env'den önce gelir (orada .env
# zaten yoktur ama kural açık olsun).
defmodule ConcordDotenv do
  def load(dir, 0), do: dir

  def load(dir, depth) do
    path = Path.join(dir, ".env")

    if File.exists?(path) do
      path
      |> File.read!()
      |> String.split("\n")
      |> Enum.each(&put_var/1)
    else
      parent = Path.dirname(dir)
      if parent != dir, do: load(parent, depth - 1)
    end
  end

  defp put_var(line) do
    line = String.trim(line)

    unless line == "" or String.starts_with?(line, "#") do
      case String.split(line, "=", parts: 2) do
        [k, v] ->
          k = String.trim(k)
          # Tırnaklı değerleri soy: SMTP_PASS="a b c" → a b c
          v = v |> String.trim() |> String.trim(~s(")) |> String.trim("'")
          if System.get_env(k) in [nil, ""], do: System.put_env(k, v)

        _ ->
          :ok
      end
    end
  end
end

ConcordDotenv.load(File.cwd!(), 5)

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
