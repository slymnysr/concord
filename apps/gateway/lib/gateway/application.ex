defmodule Gateway.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      # Küme ÖNCE kurulmalı: PubSub/Presence node'lar bağlıysa dağıtık çalışır
      {Cluster.Supervisor, [Gateway.Cluster.topologies(), [name: Gateway.ClusterSupervisor]]},
      {Phoenix.PubSub, name: Gateway.PubSub},
      GatewayWeb.Endpoint,
      {Gateway.Presence, [pool_size: 1]},
      Gateway.RedisBridge
    ]

    opts = [strategy: :one_for_one, name: Gateway.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    GatewayWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
