package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Rate limiting — Redis-backed token-bucket (dağıtık: birden fazla API instance'ı
// AYNI sayacı paylaşır; in-memory map KULLANILMAZ, yoksa 2. instance'ta limit sıfırlanır).
//
// Token-bucket, sabit-pencere INCR'ın "pencere sınırında çift-burst" sorununu yaşamaz:
// kova sürekli `refill` hızında dolar, istek başına 1 token harcanır.

// tokenBucket — atomik doldur+harca. Redis'te tek Lua ile çalışır (race yok).
// KEYS[1]=kova anahtarı
// ARGV[1]=kapasite  ARGV[2]=saniyede dolum  ARGV[3]=şimdi(sn, float)  ARGV[4]=istenen token
// Dönüş: {izin(0/1), retry_after_saniye}
var tokenBucket = redis.NewScript(`
local key = KEYS[1]
local capacity   = tonumber(ARGV[1])
local refill     = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])
local requested  = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts     = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end

local delta = now - ts
if delta < 0 then delta = 0 end
tokens = math.min(capacity, tokens + delta * refill)

local allowed = 0
local retry = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
else
  retry = math.ceil((requested - tokens) / refill)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, math.ceil(capacity / refill) + 2)
return {allowed, retry}
`)

// Limiter — paylaşılan Redis istemcisiyle rate-limit middleware üretir.
type Limiter struct {
	rdb *redis.Client
}

func NewLimiter(rdb *redis.Client) *Limiter { return &Limiter{rdb: rdb} }

// Limit — `window` içinde en fazla `max` istek (per-IP + varsa per-user). `name` limit
// bölgesini ayırır (ör. "auth", "global") ki farklı gruplar birbirini tüketmesin.
func (l *Limiter) Limit(name string, max int, window time.Duration) func(http.Handler) http.Handler {
	capacity := float64(max)
	refill := float64(max) / window.Seconds() // saniyede dolan token
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := "rl:" + name + ":" + rateKey(r)
			now := float64(time.Now().UnixNano()) / 1e9
			res, err := tokenBucket.Run(r.Context(), l.rdb, []string{key},
				capacity, refill, now, 1).Result()
			if err != nil {
				// Redis erişilemezse fail-open (limit uğruna hizmeti kesme).
				next.ServeHTTP(w, r)
				return
			}
			arr, _ := res.([]interface{})
			allowed := len(arr) > 0 && toInt(arr[0]) == 1
			if !allowed {
				retry := 1
				if len(arr) > 1 {
					retry = toInt(arr[1])
				}
				w.Header().Set("Retry-After", strconv.Itoa(retry))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"error":       "rate_limited",
					"message":     "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.",
					"retry_after": retry,
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// rateKey — kimlik varsa user_id (RequireAuth context'e koyar), yoksa IP.
// Böylece giriş yapmış kullanıcı NAT arkasındaki başkalarını etkilemez; anonim ise IP bazlı.
func rateKey(r *http.Request) string {
	if uid := UserIDFrom(r.Context()); uid != 0 {
		return "u:" + strconv.FormatInt(uid, 10)
	}
	return "ip:" + clientIP(r)
}

func clientIP(r *http.Request) string {
	// chi RealIP RemoteAddr'ı X-Forwarded-For'dan doldurur; port olabilir/olmayabilir.
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func toInt(v interface{}) int {
	switch n := v.(type) {
	case int64:
		return int(n)
	case int:
		return n
	default:
		return 0
	}
}
