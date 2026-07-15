package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port          string
	PostgresDSN   string
	RedisAddr     string
	RedisPassword string
	JWTSecret     string
	Environment   string
	WorkerID      int64
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
		JWTSecret:     getEnv("JWT_SECRET", "dev_jwt_secret_change_in_prod_at_least_32_chars"),
		Environment:   getEnv("NODE_ENV", "development"),
		WorkerID:      parseInt64(getEnv("WORKER_ID", "1")),
		GitHubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
		PublicBaseURL:      getEnv("PUBLIC_BASE_URL", "http://localhost:8080"),
		SMTPHost:           getEnv("SMTP_HOST", "localhost"),
		SMTPPort:           getEnv("SMTP_PORT", "1025"),
		SMTPUser:           getEnv("SMTP_USER", ""),
		SMTPPass:           getEnv("SMTP_PASS", ""),
		MailFrom:           getEnv("MAIL_FROM", "Concord <no-reply@concord.local>"),
		WebBaseURL:         getEnv("WEB_BASE_URL", "http://localhost:3000"),
	}
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
