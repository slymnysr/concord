defmodule Gateway.Token do
  @moduledoc """
  JWT doğrulama — Go API'nin HS256 ile imzaladığı access token'ları kabul eder.

  Secret `JWT_SECRET` env değişkeninden okunur — API ve voice ile AYNI değişken adı.
  Eskiden `CONCORD_JWT_SECRET` okunuyordu ama projede HİÇBİR YER onu set etmiyordu
  (k8s/compose/CI hepsi JWT_SECRET veriyor) → gateway üretimde sessizce aşağıdaki DEV
  secret'ına düşüyordu. Sonucu: (1) API gerçek secret'la imzalar, gateway dev secret'la
  doğrular → tüm WebSocket'ler 403, realtime ölü; (2) dev secret repo'da açık olduğu için
  saldırgan sahte token üretip herhangi bir kullanıcı gibi bağlanabilirdi.
  Yerelde fark edilmiyordu: API de dev default'a düştüğü için kazara uyuşuyorlardı.
  """
  use Joken.Config

  @impl true
  def token_config do
    default_claims(skip: [:aud, :iss, :jti, :nbf])
    |> add_claim("iss", nil, &(&1 == "concord-api"))
  end

  # API'nin dev default'u ile AYNI olmalı (apps/api/internal/config: devJWTSecret)
  @dev_secret "dev_jwt_secret_change_in_prod_at_least_32_chars"

  def dev_secret, do: @dev_secret

  def secret, do: System.get_env("JWT_SECRET") || @dev_secret

  def signer, do: Joken.Signer.create("HS256", secret())

  @spec verify_access(String.t()) :: {:ok, integer()} | {:error, term()}
  def verify_access(token) do
    case verify_and_validate(token, signer()) do
      {:ok, %{"uid" => uid}} when is_integer(uid) -> {:ok, uid}
      {:ok, %{"sub" => sub}} when is_binary(sub) -> {:ok, String.to_integer(sub)}
      {:ok, _other} -> {:error, :missing_user_id}
      {:error, reason} -> {:error, reason}
    end
  end
end
