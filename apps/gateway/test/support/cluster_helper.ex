defmodule Gateway.ClusterHelper do
  @moduledoc """
  Küme testleri için UZAK NODE'DA çalışan yardımcılar.

  Neden `lib/` değil de `test/support/`: yalnızca testte gerekli. Neden test dosyasının
  İÇİNDE değil: ExUnit test modülleri diske .beam olarak yazılmaz → uzak node onları
  yükleyemez ("function ... is undefined"). `test/support` ise `_build/.../ebin`'e derlenir
  ve peer'a kopyaladığımız kod yolunda bulunur.
  """

  @doc """
  Verilen topic'e abone olur, hazır olduğunu `parent`'a bildirir ve ilk mesajı ona iletir.
  Uzak node'da `Node.spawn/4` ile çalıştırılır.
  """
  def peer_abone(parent, pubsub, topic, timeout \\ 5_000) do
    Phoenix.PubSub.subscribe(pubsub, topic)
    send(parent, :abone_hazir)

    receive do
      msg -> send(parent, {:peer_aldi, msg})
    after
      timeout -> send(parent, :peer_zaman_asimi)
    end
  end
end
