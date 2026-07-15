defmodule Gateway.Token do
  @moduledoc """
  JWT doğrulama — Go API'nin HS256 ile imzaladığı access token'ları kabul eder.
  Secret CONCORD_JWT_SECRET env değişkeninden okunur.
  """
  use Joken.Config

  @impl true
  def token_config do
    default_claims(skip: [:aud, :iss, :jti, :nbf])
    |> add_claim("iss", nil, &(&1 == "concord-api"))
  end

  def signer do
    secret = System.get_env("CONCORD_JWT_SECRET") || "dev_jwt_secret_change_in_prod_at_least_32_chars"
    Joken.Signer.create("HS256", secret)
  end

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
