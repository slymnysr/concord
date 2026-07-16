package config

import "testing"

func TestMustSecure(t *testing.T) {
	cases := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{"prod+default JWT reddedilir", Config{Environment: "production", JWTSecret: devJWTSecret, VoiceControlSecret: "strong"}, true},
		{"prod+default voice reddedilir", Config{Environment: "production", JWTSecret: "strong", VoiceControlSecret: devVoiceSecret}, true},
		{"prod+güçlü secret geçer", Config{Environment: "production", JWTSecret: "strong-secret-32chars-min-xxxxxx", VoiceControlSecret: "strong"}, false},
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
