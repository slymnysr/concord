# Küme testleri dağıtık Erlang ister (epmd + node başlatma). Her ortamda mevcut değil →
# varsayılanda HARİÇ; `mix test --include cluster` ile koşar. CI bunu açıkça yapıyor
# (önce `epmd -daemon`) — yani FAZ D'nin "çapraz-node yayın" kriteri CI'da da doğrulanıyor.
ExUnit.start(exclude: [:cluster])
