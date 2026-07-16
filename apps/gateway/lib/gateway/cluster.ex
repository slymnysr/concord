defmodule Gateway.Cluster do
  @moduledoc """
  Erlang dağıtık küme topolojisi (libcluster).

  NEDEN GEREKLİ: Phoenix.Presence ve Phoenix.PubSub yalnızca node'lar dağıtık Erlang ile
  BİRBİRİNE BAĞLIYSA çok-node çalışır. Bağlanmazlarsa her node kendi adasında kalır:
  A node'undaki kullanıcı, B node'undaki kullanıcıyı presence'ta GÖREMEZ.

  ## Strateji seçimi (CLUSTER_STRATEGY)

  - `kubernetes` — headless service'in A kayıtlarını çözer. Prod/k8s varsayılanı.
  - `epmd`       — node listesi ÖNCEDEN BİLİNİR (CLUSTER_HOSTS). docker-compose, sabit
                   sunucu listesi ve YEREL çok-node testi için doğru seçim: deterministik,
                   ağ keşfine (multicast/broadcast) hiç bağımlı değil.
  - `gossip`     — UDP ile otomatik keşif; node listesi bilinmeyen LAN kurulumları için.
                   UYARI: aynı host'taki node'lar aynı UDP portuna bağlandığı için yerel
                   çok-node testinde GÜVENİLMEZ; WSL2/Docker'da broadcast sıklıkla düşer.
                   Yerelde test etmek için `epmd` kullan.
  - `none`       — kümeleme kapalı (tek node).

  Varsayılan: k8s ortamıysa `kubernetes`, CLUSTER_HOSTS verilmişse `epmd`, aksi halde `none`.
  (Sessizce `gossip`e düşmüyoruz: hiçbir şey bulamadığında "kümelendim" sanılıyordu.)

  Node adı ve çerezi ortamdan gelir (release: RELEASE_NODE/RELEASE_COOKIE). Çerez
  paylaşılmazsa node'lar el sıkışamaz — k8s'te secret'tan verilir.
  """

  require Logger

  def topologies do
    strategy = System.get_env("CLUSTER_STRATEGY") || default_strategy()

    case strategy do
      "kubernetes" -> kubernetes_topology()
      "epmd" -> epmd_topology()
      "gossip" -> gossip_topology()
      "none" -> []
      other -> raise "bilinmeyen CLUSTER_STRATEGY: #{other} (kubernetes|epmd|gossip|none)"
    end
  end

  defp default_strategy do
    cond do
      System.get_env("KUBERNETES_SERVICE_HOST") -> "kubernetes"
      System.get_env("CLUSTER_HOSTS") -> "epmd"
      true -> "none"
    end
  end

  defp epmd_topology do
    hosts =
      (System.get_env("CLUSTER_HOSTS") || "")
      |> String.split(",", trim: true)
      |> Enum.map(&(&1 |> String.trim() |> String.to_atom()))

    if hosts == [] do
      raise "CLUSTER_STRATEGY=epmd için CLUSTER_HOSTS gerekli (ör. gw1@127.0.0.1,gw2@127.0.0.1)"
    end

    Logger.info("küme stratejisi: epmd, hosts=#{inspect(hosts)}")
    [concord: [strategy: Cluster.Strategy.Epmd, config: [hosts: hosts]]]
  end

  defp gossip_topology do
    Logger.info("küme stratejisi: gossip (UDP keşif)")

    [
      concord: [
        strategy: Cluster.Strategy.Gossip,
        config: [
          port: String.to_integer(System.get_env("GOSSIP_PORT") || "45892"),
          if_addr: "0.0.0.0",
          multicast_addr: "233.252.1.32",
          broadcast_only: true
        ]
      ]
    ]
  end

  defp kubernetes_topology do
    service = System.get_env("K8S_HEADLESS_SERVICE") || "gateway-headless"
    Logger.info("küme stratejisi: kubernetes, service=#{service}")

    [
      concord: [
        strategy: Cluster.Strategy.Kubernetes.DNS,
        config: [
          # Headless service (clusterIP: None) → pod'ların A kayıtları döner.
          # Normal ClusterIP servis TEK sanal IP döndürür → node keşfi ÇALIŞMAZ.
          service: service,
          application_name: System.get_env("K8S_APP_NAME") || "gateway",
          polling_interval: 5_000
        ]
      ]
    ]
  end
end
