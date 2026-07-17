defmodule Gateway.ClusterBroadcastTest do
  @moduledoc """
  FAZ D kabul testi: "2 node, çapraz-node presence + YAYIN".

  Presence ayrı test ediliyor; bu dosya YAYIN'ı ölçer — bir node'da yayınlanan olayın
  DİĞER node'daki aboneye ulaştığını. Kümeleme bozuksa (ya da PubSub yerel kalırsa)
  kullanıcı başka pod'daki mesajları hiç almaz (sessiz bölünme).

  Gerçek ikinci bir BEAM node'u başlatır (:peer). ExUnit --include cluster ile koşar:
      mix test --include cluster
  Varsayılanda hariç: node başlatmak CI'da epmd/dağıtık ağ ister.
  """
  use ExUnit.Case, async: false

  @moduletag :cluster
  @moduletag timeout: 60_000

  setup_all do
    # Bu node'un dağıtık olması şart (yoksa :peer başlatılamaz)
    case :net_kernel.start([:"test_primary@127.0.0.1", :longnames]) do
      {:ok, _} -> :ok
      {:error, {:already_started, _}} -> :ok
      other -> raise "dağıtık node başlatılamadı: #{inspect(other)}"
    end

    Node.set_cookie(:concord_test_cookie)

    {:ok, peer, node} =
      :peer.start_link(%{
        name: :gw_peer,
        host: ~c"127.0.0.1",
        longnames: true,
        args: [~c"-setcookie", ~c"concord_test_cookie"]
      })

    # Peer'a kod yollarını ver ve PubSub'ı başlat (uygulamanın tamamı gerekmez:
    # yayın PubSub katmanında olur, HTTP/Redis bağlamak testi kırılganlaştırırdı).
    :ok = :erpc.call(node, :code, :add_paths, [:code.get_path()])
    {:ok, _} = :erpc.call(node, Application, :ensure_all_started, [:phoenix_pubsub])

    # kernel_sup ALTINA: erpc çağrısı geçici bir süreçte koşar, doğrudan start_link
    # edilen PubSub o süreçle birlikte ÖLÜR (ilk denemede tam bu oldu).
    pubsub_child = %{
      id: Gateway.PubSub,
      start: {Phoenix.PubSub.Supervisor, :start_link, [[name: Gateway.PubSub]]},
      type: :supervisor
    }

    baslat = fn
      {:ok, _} -> :ok
      # Yerelde gateway uygulaması zaten çalışıyor → PubSub mevcut; peer'da değil.
      {:error, {:already_started, _}} -> :ok
      other -> raise "PubSub başlatılamadı: #{inspect(other)}"
    end

    baslat.(:erpc.call(node, :supervisor, :start_child, [:kernel_sup, pubsub_child]))
    baslat.(:supervisor.start_child(:kernel_sup, pubsub_child))

    # Peer test sırasında ölmüş olabilir → stop patlarsa setup_all'ı geçersiz kılmasın
    # Peer test sırasında ölmüş olabilir → temizlik hatası setup_all'ı geçersiz kılmasın
    on_exit(fn ->
      try do
        :peer.stop(peer)
      catch
        _, _ -> :ok
      end
    end)
    %{peer_node: node}
  end

  test "node'lar birbirine bağlı", %{peer_node: node} do
    assert node in Node.list(), "peer node kümeye katılmadı — dağıtık Erlang kurulmamış"
  end

  test "UZAK node'da yayınlanan olay YEREL aboneye ulaşır", %{peer_node: node} do
    topic = "guild:yayin-testi"
    :ok = Phoenix.PubSub.subscribe(Gateway.PubSub, topic)

    olay = {:message_create, %{id: "42", content: "çapraz-node"}}
    :ok = :erpc.call(node, Phoenix.PubSub, :broadcast, [Gateway.PubSub, topic, olay])

    assert_receive ^olay, 5_000,
                   "uzak node'un yayını gelmedi → PubSub çapraz-node dağıtmıyor (kullanıcı başka pod'daki mesajları almaz)"
  end

  test "YEREL yayın UZAK aboneye ulaşır (çift yön)", %{peer_node: node} do
    topic = "guild:yayin-testi-2"
    # test/support'taki helper: uzak node onu kod yolundan yükleyebilir
    Node.spawn(node, Gateway.ClusterHelper, :peer_abone, [self(), Gateway.PubSub, topic])

    assert_receive :abone_hazir, 5_000

    olay = {:message_create, %{id: "43"}}
    :ok = Phoenix.PubSub.broadcast(Gateway.PubSub, topic, olay)

    assert_receive {:peer_aldi, ^olay}, 5_000,
                   "yerel yayın uzak node'a ulaşmadı → dağıtım tek yönlü"
  end
end
