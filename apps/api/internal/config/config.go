package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Dev-default secret'lar — prod'da bunlarla başlatmak yasaktır (MustSecure).
const (
	devJWTSecret   = "dev_jwt_secret_change_in_prod_at_least_32_chars"
	devVoiceSecret = "dev_voice_control_secret_change_me"
)

type Config struct {
	Port          string
	PostgresDSN   string
	RedisAddr     string
	RedisPassword string
	JWTSecret     string
	Environment   string
	WorkerID      int64
	// CORS izinli origin'ler (virgülle ayrılmış ALLOWED_ORIGINS env'inden)
	AllowedOrigins []string
	// Voice server → API çağrılarını koruyan paylaşılan secret
	VoiceControlSecret string
	// MinIO bucket-notification webhook'unu koruyan secret. BOŞSA webhook KAPALIDIR
	// (kimliksiz açık bırakmak, herkesin işleme tetiklemesi demek olurdu).
	MediaEventSecret string
	// Arama motoru. MEILI_ADDR boşsa Postgres FTS'e düşülür — ama bu SESSİZ değil:
	// /health hangi motorun aktif olduğunu raporlar. Postgres FTS CJK'da çalışmaz
	// (bkz. docs/DENETIM-GLOBAL.md) → global üretimde MEILI_ADDR ZORUNLU (MustSecure).
	MeiliAddr string
	MeiliKey  string
	// Push bildirimi. VAPID anahtarları boşsa WEB push kapalıdır (payload şifrelemesi
	// anahtarsız yapılamaz); Expo push anahtar istemez (EAS tarafında yapılandırılır).
	ExpoAccessToken string
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string
	// Rate limit (istek/dakika, PER-IP kaba tavan). Asıl brute-force savunması hesap kapsamlıdır
	// (handlers/auth.go: maxFailPerEmailIP/Email/IP) — bu çit yalnızca kaba kötüye kullanımı keser
	// ve paylaşımlı çıkış IP'lerini (operatör CGNAT'ı) boğmayacak kadar gevşek tutulur.
	AuthRateLimitPerMin int
	APIRateLimitPerMin  int
	// Hesap bağlantıları (Connections) OAuth — boşsa GitHub doğrulaması kapalı, elle ekleme çalışır
	GitHubClientID     string
	GitHubClientSecret string
	PublicBaseURL      string
	// İşlem mailleri (şifre sıfırlama/doğrulama) — dev default'u MailHog (localhost:1025)
	SMTPHost   string
	SMTPPort   string
	SMTPUser   string
	SMTPPass   string
	MailFrom   string
	WebBaseURL string
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		Port:          getEnv("API_PORT", "8080"),
		PostgresDSN:   getEnv("POSTGRES_DSN", "postgres://concord:concord_dev@localhost:5433/concord?sslmode=disable"),
		RedisAddr:     getEnv("REDIS_HOST", "localhost") + ":" + getEnv("REDIS_PORT", "6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		// NOT: Gateway'in (Elixir) default'u ile AYNI olmalı, yoksa WS token doğrulaması 403 verir
		JWTSecret:           getEnv("JWT_SECRET", devJWTSecret),
		Environment:         getEnv("NODE_ENV", "development"),
		WorkerID:            parseInt64(getEnv("WORKER_ID", "1")),
		AllowedOrigins:      splitCSV(getEnv("ALLOWED_ORIGINS", "http://localhost:3000")),
		VoiceControlSecret:  getEnv("VOICE_CONTROL_SECRET", devVoiceSecret),
		MediaEventSecret:    getEnv("MEDIA_EVENT_SECRET", ""),
		MeiliAddr:           getEnv("MEILI_ADDR", ""),
		MeiliKey:            getEnv("MEILI_KEY", ""),
		ExpoAccessToken:     getEnv("EXPO_ACCESS_TOKEN", ""),
		VAPIDPublicKey:      getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey:     getEnv("VAPID_PRIVATE_KEY", ""),
		VAPIDSubject:        getEnv("VAPID_SUBJECT", "mailto:admin@concord.local"),
		AuthRateLimitPerMin: parseIntDefault(getEnv("AUTH_RATE_LIMIT_PER_MIN", "60"), 60),
		APIRateLimitPerMin:  parseIntDefault(getEnv("API_RATE_LIMIT_PER_MIN", "600"), 600),
		GitHubClientID:      getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret:  getEnv("GITHUB_CLIENT_SECRET", ""),
		PublicBaseURL:       getEnv("PUBLIC_BASE_URL", "http://localhost:8080"),
		SMTPHost:            getEnv("SMTP_HOST", "localhost"),
		SMTPPort:            getEnv("SMTP_PORT", "1025"),
		SMTPUser:            getEnv("SMTP_USER", ""),
		SMTPPass:            getEnv("SMTP_PASS", ""),
		MailFrom:            getEnv("MAIL_FROM", "Concord <no-reply@concord.local>"),
		WebBaseURL:          getEnv("WEB_BASE_URL", "http://localhost:3000"),
	}
}

// MustSecure — üretimde (NODE_ENV=production) zayıf dev-default secret'larla başlatmayı
// reddeder. main.go bunu Load() sonrası çağırır; hata varsa süreç başlamaz.
func (c *Config) MustSecure() error {
	if c.Environment != "production" {
		return nil
	}
	var bad []string
	if c.JWTSecret == devJWTSecret {
		bad = append(bad, "JWT_SECRET")
	}
	if c.VoiceControlSecret == devVoiceSecret {
		bad = append(bad, "VOICE_CONTROL_SECRET")
	}
	if len(bad) > 0 {
		return fmt.Errorf("üretimde dev-default secret KULLANILAMAZ: %s (güçlü değer ata)", strings.Join(bad, ", "))
	}
	// Boşsa medya webhook'u kapalı olur → yüklenen dosyalar TARANMADAN iliştirilebilir
	// (handlers.resolveAttachments doğrulamayı atlar). Üretimde bu kabul edilemez.
	if c.MediaEventSecret == "" {
		return fmt.Errorf("üretimde MEDIA_EVENT_SECRET ZORUNLU: boşsa dosyalar virüs taramasından geçmeden iliştirilebilir")
	}
	// Postgres FTS CJK'yı kelimelere ayıramaz → Japonca/Çince/Korece kullanıcılar için arama
	// HİÇ çalışmaz (ölçüldü: docs/DENETIM-GLOBAL.md). Global üretimde bu kabul edilemez.
	if c.MeiliAddr == "" {
		return fmt.Errorf("üretimde MEILI_ADDR ZORUNLU: Postgres FTS yedeği CJK'da arama yapamaz (JP/ZH/KO kullanıcıları için arama ölür)")
	}
	return nil
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func parseIntDefault(s string, fallback int) int {
	v, err := strconv.Atoi(s)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func parseInt64(s string) int64 {
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 1
	}
	return v
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}
