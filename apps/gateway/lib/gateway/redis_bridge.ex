defmodule Gateway.RedisBridge do
  @moduledoc """
  Redis PubSub köprüsü — `concord:guild:*` pattern'ini dinler, gelen olayları
  Phoenix kanalına yayar (`guild:<id>` topic'i).
  Go API mesaj attığında bu köprü gerçek zamanlı dağıtımı sağlar.
  """
  use GenServer
  require Logger

  @pattern "concord:guild:*"

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    host = System.get_env("REDIS_HOST") || "localhost"
    port = String.to_integer(System.get_env("REDIS_PORT") || "6379")

    case Redix.PubSub.start_link(host: host, port: port, name: :concord_pubsub) do
      {:ok, pid} ->
        {:ok, ref} = Redix.PubSub.psubscribe(:concord_pubsub, @pattern, self())
        Logger.info("RedisBridge subscribed to #{@pattern}")
        {:ok, %{conn: pid, ref: ref}}

      {:error, reason} ->
        Logger.error("RedisBridge başlatılamadı: #{inspect(reason)}")
        {:stop, reason}
    end
  end

  @impl true
  def handle_info({:redix_pubsub, _conn, _ref, :pmessage, %{channel: channel, payload: payload}}, state) do
    case decode_and_forward(channel, payload) do
      :ok -> :ok
      {:error, reason} -> Logger.warning("Redis mesaj iletilemedi: #{inspect(reason)}")
    end
    {:noreply, state}
  end

  def handle_info({:redix_pubsub, _conn, _ref, :psubscribed, _meta}, state), do: {:noreply, state}
  def handle_info({:redix_pubsub, _conn, _ref, :disconnected, %{error: err}}, state) do
    Logger.warning("Redis bağlantı koptu: #{inspect(err)}")
    {:noreply, state}
  end
  def handle_info({:redix_pubsub, _conn, _ref, :reconnected, _}, state) do
    Logger.info("Redis tekrar bağlandı")
    {:noreply, state}
  end

  def handle_info(msg, state) do
    Logger.debug("RedisBridge unhandled: #{inspect(msg)}")
    {:noreply, state}
  end

  defp decode_and_forward("concord:guild:" <> guild_id, payload) do
    case Jason.decode(payload) do
      {:ok, %{"type" => event_type} = event} ->
        topic = "guild:#{guild_id}"
        Logger.info("RedisBridge forwarding #{event_type} → #{topic}")
        GatewayWeb.Endpoint.broadcast!(topic, event_type, event)
        :ok

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp decode_and_forward(_, _), do: :ok
end
