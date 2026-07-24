defmodule Gateway.ClusterTest do
  use ExUnit.Case, async: false

  alias Gateway.Cluster

  setup do
    # Testler env'e dokunuyor → her testten sonra temizle
    on_exit(fn ->
      ~w(CLUSTER_STRATEGY CLUSTER_HOSTS KUBERNETES_SERVICE_HOST K8S_HEADLESS_SERVICE)
      |> Enum.each(&System.delete_env/1)
    end)
  end

  describe "varsayılan strateji" do
    test "hiçbir ipucu yoksa kümeleme KAPALI" do
      # Sessizce gossip'e düşmemeli: hiçbir node bulamadığı halde "kümelendim" sanılıyordu
      assert Cluster.topologies() == []
    end

    test "k8s ortamında kubernetes seçilir" do
      System.put_env("KUBERNETES_SERVICE_HOST", "10.0.0.1")
      assert [concord: opts] = Cluster.topologies()
      assert opts[:strategy] == Elixir.Cluster.Strategy.Kubernetes.DNS
    end

    test "CLUSTER_HOSTS verilmişse epmd seçilir" do
      System.put_env("CLUSTER_HOSTS", "gw1@127.0.0.1,gw2@127.0.0.1")
      assert [concord: opts] = Cluster.topologies()
      assert opts[:strategy] == Elixir.Cluster.Strategy.Epmd
    end
  end

  describe "epmd" do
    test "host listesi atom'a çevrilir ve boşluklar kırpılır" do
      System.put_env("CLUSTER_STRATEGY", "epmd")
      System.put_env("CLUSTER_HOSTS", " gw1@127.0.0.1 , gw2@127.0.0.1 ")
      assert [concord: opts] = Cluster.topologies()
      assert opts[:config][:hosts] == [:"gw1@127.0.0.1", :"gw2@127.0.0.1"]
    end

    test "CLUSTER_HOSTS olmadan açıkça istenirse hata verir" do
      System.put_env("CLUSTER_STRATEGY", "epmd")
      # Sessizce boş listeyle başlamak = tek node'da kalıp kümelendiğini sanmak
      assert_raise RuntimeError, ~r/CLUSTER_HOSTS gerekli/, &Cluster.topologies/0
    end
  end

  describe "kubernetes" do
    test "headless service adı env'den gelir" do
      System.put_env("CLUSTER_STRATEGY", "kubernetes")
      System.put_env("K8S_HEADLESS_SERVICE", "gw-headless")
      assert [concord: opts] = Cluster.topologies()
      assert opts[:config][:service] == "gw-headless"
    end
  end

  test "bilinmeyen strateji sessizce yutulmaz" do
    System.put_env("CLUSTER_STRATEGY", "sacmalik")
    assert_raise RuntimeError, ~r/bilinmeyen CLUSTER_STRATEGY/, &Cluster.topologies/0
  end

  test "none kümelemeyi kapatır" do
    System.put_env("CLUSTER_STRATEGY", "none")
    assert Cluster.topologies() == []
  end
end
