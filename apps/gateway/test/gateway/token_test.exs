defmodule Gateway.TokenTest do
  use ExUnit.Case, async: false

  alias Gateway.Token

  setup do
    on_exit(fn -> System.delete_env("JWT_SECRET") end)
  end

  @doc false
  defp sign(claims, secret) do
    Joken.Signer.create("HS256", secret)
    |> then(&Joken.generate_and_sign!(%{}, claims, &1))
  end

  defp valid_claims(uid) do
    now = System.system_time(:second)
    %{"sub" => to_string(uid), "iss" => "concord-api", "exp" => now + 900, "iat" => now}
  end

  test "JWT_SECRET env'inden okunur (CONCORD_JWT_SECRET DEĞİL)" do
    # Regresyon: gateway CONCORD_JWT_SECRET okuyordu, hiçbir yer set etmiyordu → üretimde
    # sessizce dev secret'a düşüyor, API'nin token'larını doğrulayamıyordu (WS 403) ve
    # repo'daki açık dev secret'la üretilmiş SAHTE token'ları kabul ediyordu.
    System.put_env("JWT_SECRET", "gercek-uretim-secreti-32-karakterden-uzun")
    assert Token.secret() == "gercek-uretim-secreti-32-karakterden-uzun"
  end

  test "env yoksa dev secret'a düşer" do
    assert Token.secret() == Token.dev_secret()
  end

  test "API'nin imzaladığı token doğrulanır (sub string → integer)" do
    secret = "test-secret-32-karakterden-daha-uzun-olsun"
    System.put_env("JWT_SECRET", secret)
    # Snowflake ID'ler 64-bit: JS Number 53-bit tutmadığı için API sub'ı STRING yazar
    uid = 35_681_684_445_726_720
    token = sign(valid_claims(uid), secret)
    assert {:ok, ^uid} = Token.verify_access(token)
  end

  test "BAŞKA secret'la imzalanmış token reddedilir" do
    System.put_env("JWT_SECRET", "dogru-secret-32-karakterden-daha-uzun-xx")
    token = sign(valid_claims(123), "saldirgan-secreti-32-karakterden-uzun-yy")
    assert {:error, _} = Token.verify_access(token)
  end

  test "yanlış issuer reddedilir" do
    secret = "test-secret-32-karakterden-daha-uzun-olsun"
    System.put_env("JWT_SECRET", secret)
    claims = valid_claims(1) |> Map.put("iss", "sahte-yayinci")
    assert {:error, _} = Token.verify_access(sign(claims, secret))
  end

  test "süresi dolmuş token reddedilir" do
    secret = "test-secret-32-karakterden-daha-uzun-olsun"
    System.put_env("JWT_SECRET", secret)
    now = System.system_time(:second)
    claims = %{"sub" => "1", "iss" => "concord-api", "exp" => now - 10, "iat" => now - 900}
    assert {:error, _} = Token.verify_access(sign(claims, secret))
  end
end
