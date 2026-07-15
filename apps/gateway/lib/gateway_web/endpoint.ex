defmodule GatewayWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :gateway

  @session_options [
    store: :cookie,
    key: "_concord_gateway_key",
    signing_salt: "concord_salt_change_me"
  ]

  socket "/socket", GatewayWeb.UserSocket,
    websocket: [
      timeout: 45_000,
      compress: true,
      check_origin: false
    ],
    longpoll: false

  plug Corsica,
    origins: ["http://localhost:3000", ~r{^https?://.*\.concord\.com$}],
    allow_credentials: true,
    allow_headers: :all

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug GatewayWeb.Router
end
