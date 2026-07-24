package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// Güvenlik başlıkları GERÇEKTEN yanıtlarda mı? Bu başlıklar sessizce düşerse (middleware
// yanlış takılır, header adı yanlış yazılır) tarayıcı korumaları kapanır ve kimse fark etmez.
func TestSecurityHeaders(t *testing.T) {
	son := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	sabitler := map[string]string{
		"X-Content-Type-Options":  "nosniff",
		"X-Frame-Options":         "DENY",
		"Referrer-Policy":         "strict-origin-when-cross-origin",
		"Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
	}

	// prod=false: HSTS OLMAMALI (dev'de localhost HTTP; HSTS geliştiriciyi HTTPS'e kilitler),
	// diğer başlıklar OLMALI.
	t.Run("dev", func(t *testing.T) {
		rec := httptest.NewRecorder()
		securityHeaders(false)(son).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
		for k, v := range sabitler {
			if got := rec.Header().Get(k); got != v {
				t.Errorf("%s = %q, beklenen %q", k, got, v)
			}
		}
		if h := rec.Header().Get("Strict-Transport-Security"); h != "" {
			t.Errorf("dev'de HSTS gönderilmemeli, geldi: %q", h)
		}
	})

	// prod=true: HSTS DE OLMALI (SSL-stripping savunması).
	t.Run("prod", func(t *testing.T) {
		rec := httptest.NewRecorder()
		securityHeaders(true)(son).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
		for k, v := range sabitler {
			if got := rec.Header().Get(k); got != v {
				t.Errorf("%s = %q, beklenen %q", k, got, v)
			}
		}
		if h := rec.Header().Get("Strict-Transport-Security"); h == "" {
			t.Error("prod'da HSTS ZORUNLU — gelmedi (SSL-stripping'e açık)")
		}
	})
}
