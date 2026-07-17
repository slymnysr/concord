package config

import "testing"

func TestMustSecure(t *testing.T) {
	cases := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{"prod+default JWT reddedilir", Config{Environment: "production", JWTSecret: devJWTSecret, VoiceControlSecret: "strong", MediaEventSecret: "s"}, true},
		{"prod+default voice reddedilir", Config{Environment: "production", JWTSecret: "strong", VoiceControlSecret: devVoiceSecret, MediaEventSecret: "s"}, true},
		// Boş MEDIA_EVENT_SECRET → webhook kapalı → dosyalar taranmadan iliştirilebilir
		{"prod+medya secret'ı yoksa reddedilir", Config{Environment: "production", JWTSecret: "strong-secret-32chars-min-xxxxxx", VoiceControlSecret: "strong"}, true},
		// Postgres FTS CJK'da arama yapamaz → global üretimde MEILI_ADDR zorunlu
		{"prod+arama motoru yoksa reddedilir", Config{Environment: "production", JWTSecret: "strong-secret-32chars-min-xxxxxx", VoiceControlSecret: "strong", MediaEventSecret: "s"}, true},
		{"prod+güçlü secret geçer", Config{Environment: "production", JWTSecret: "strong-secret-32chars-min-xxxxxx", VoiceControlSecret: "strong", MediaEventSecret: "media-secret", MeiliAddr: "http://meilisearch:7700"}, false},
		{"dev'de default sorun değil", Config{Environment: "development", JWTSecret: devJWTSecret, VoiceControlSecret: devVoiceSecret}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.cfg.MustSecure()
			if (err != nil) != c.wantErr {
				t.Fatalf("MustSecure() err=%v, beklenen hata=%v", err, c.wantErr)
			}
		})
	}
}
