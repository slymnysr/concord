defmodule GatewayWeb.UserSocket do
  @moduledoc """
  Concord WebSocket giriş noktası.
  İstemci `?token=<access_jwt>` parametresi ile bağlanır.
  """
  use Phoenix.Socket
  require Logger

  channel "guild:*", GatewayWeb.GuildChannel
  channel "dm:*", GatewayWeb.DmChannel
  channel "user:*", GatewayWeb.UserChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    case Gateway.Token.verify_access(token) do
      {:ok, user_id} ->
        {:ok, assign(socket, :user_id, user_id)}

      {:error, reason} ->
        Logger.warning("WebSocket auth fail: #{inspect(reason)}")
        :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.user_id}"
end
