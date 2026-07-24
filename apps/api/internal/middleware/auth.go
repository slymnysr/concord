package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/concord/api/internal/auth"
)

type ctxKey string

const UserIDKey ctxKey = "user_id"

// BotResolver — "Authorization: Bot <token>" başlığındaki bot token'ını kullanıcıya çözer.
type BotResolver func(ctx context.Context, rawToken string) (int64, bool)

func RequireAuth(iss *auth.Issuer, bots BotResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			if strings.HasPrefix(h, "Bot ") {
				if bots == nil {
					http.Error(w, `{"error":"unauthorized","detail":"bot auth kapalı"}`, http.StatusUnauthorized)
					return
				}
				uid, ok := bots(r.Context(), strings.TrimPrefix(h, "Bot "))
				if !ok {
					http.Error(w, `{"error":"unauthorized","detail":"bot token geçersiz"}`, http.StatusUnauthorized)
					return
				}
				ctx := context.WithValue(r.Context(), UserIDKey, uid)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			if !strings.HasPrefix(h, "Bearer ") {
				http.Error(w, `{"error":"unauthorized","detail":"bearer token gerekli"}`, http.StatusUnauthorized)
				return
			}
			token := strings.TrimPrefix(h, "Bearer ")
			claims, err := iss.Verify(token)
			if err != nil {
				http.Error(w, `{"error":"unauthorized","detail":"token geçersiz"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserIDFrom(ctx context.Context) int64 {
	v, _ := ctx.Value(UserIDKey).(int64)
	return v
}
