package handlers

import "testing"

func TestValidMediaSecret(t *testing.T) {
	const secret = "gercek-secret"
	cases := []struct {
		ad     string
		header string
		want   bool
	}{
		{"Bearer önekli", "Bearer gercek-secret", true},
		{"çıplak token", "gercek-secret", true},
		{"yanlış", "Bearer baska", false},
		{"boş", "", false},
		// Boş secret'la her istek geçmemeli (webhook config'siz kapalı olmalı)
		{"sadece Bearer", "Bearer ", false},
	}
	for _, c := range cases {
		t.Run(c.ad, func(t *testing.T) {
			if got := validMediaSecret(c.header, secret); got != c.want {
				t.Errorf("validMediaSecret(%q) = %v, beklenen %v", c.header, got, c.want)
			}
		})
	}
}
