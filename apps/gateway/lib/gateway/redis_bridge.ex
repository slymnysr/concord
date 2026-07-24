defmodule Gateway.RedisBridge do
  @moduledoc """
  Redis PubSub köprüsü — `concord:guild:*` pattern'ini dinler, gelen olayları
  Phoenix kanalına yayar (`guild:<id>` topic'i).
  Go API mesaj attığında bu köprü gerçek zamanlı dağıtımı sağlar.

  ## Çok-node: neden `local_broadcast`?

  Redis pubsub mesajı HER aboneye gider → kümedeki N node'un HEPSİ aynı olayı alır.
  Eğer her node `broadcast!` çağırsaydı, Phoenix.PubSub olayı tekrar TÜM node'lara
  dağıtırdı → her istemci mesajı **N kez** görürdü (ve küme içi trafik N²'ye çıkardı).

  Doğru iş bölümü: **node'lar arası dağıtımı Redis yapar**, PubSub'ın işi yalnızca
  o node'a bağlı YEREL soketlere ulaşmak. Bu yüzden `local_broadcast`.

  (Presence bundan etkilenmez: kendi CRDT senkronunu dağıtık PubSub üzerinden yapar.)
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
    password = System.get_env("REDIS_PASSWORD")

    opts = [host: host, port: port, name: :concord_pubsub]
    opts = if password in [nil, ""], do: opts, else: Keyword.put(opts, :password, password)

    case Redix.PubSub.start_link(opts) do
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
        Logger.debug("RedisBridge forwarding #{event_type} → #{topic}")
        # local_broadcast: küme dağıtımını Redis yapıyor (bkz. modül dokümanı) — broadcast!
        # kullanmak her istemciye N kopya gönderirdi.
        GatewayWeb.Endpoint.local_broadcast(topic, event_type, event)
        :ok

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp decode_and_forward(_, _), do: :ok
end
