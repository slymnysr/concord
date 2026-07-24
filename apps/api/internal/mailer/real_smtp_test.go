//go:build realsmtp

// Gerçek bir DIŞ SMTP sağlayıcısına, gerçek internet üzerinden mail gönderimi kanıtı.
// Build tag'li: normal `go test` ve CI ÇALIŞTIRMAZ (dış servise + ağa bağımlı, flaky olur).
// Elle çalıştır:  SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... \
//                 go test -tags realsmtp -run RealSMTP -v ./internal/mailer/
//
// MailHog (yerel, TLS'siz) ve self-signed testleri (yerel) yerel yolları kanıtlar. Bu test
// PRODUCTION koşullarını kanıtlar: gerçek DNS, gerçek TLS (sistem güven deposu, RootCAs=nil),
// gerçek SMTP AUTH, gerçek ağ. Gmail'e özgü olan TEK şey credential'dır — akışın kendisi budur.
package mailer

import (
	"os"
	"testing"
)

func TestRealSMTP(t *testing.T) {
	host, port := os.Getenv("SMTP_HOST"), os.Getenv("SMTP_PORT")
	user, pass := os.Getenv("SMTP_USER"), os.Getenv("SMTP_PASS")
	if host == "" || user == "" {
		t.Skip("SMTP_HOST/USER verilmedi — gerçek SMTP testi atlandı")
	}
	// RequireTLS=true: sağlayıcı STARTTLS sunmazsa göndermeyi reddet (prod ayarı).
	// RootCAs vermiyoruz → sistem güven deposu → sağlayıcının GERÇEK sertifikasını doğrular.
	m := New(host, port, user, pass, "Concord <"+user+">", true)
	err := m.Send(
		user, // kendine gönder (test kutusu)
		"Concord — gerçek SMTP kanıtı",
		"<h2>Bu mail gerçek internet üzerinden gönderildi</h2>"+
			"<p>DNS + TLS (sistem CA) + SMTP AUTH + STARTTLS. Aynı kod Gmail App Password ile "+
			"Gmail'e de çalışır — credential dışında fark yok.</p>",
	)
	if err != nil {
		t.Fatalf("gerçek dış SMTP gönderimi BAŞARISIZ: %v", err)
	}
	t.Logf("✓ %s üzerinden %s adresine gerçek mail gönderildi (STARTTLS+AUTH)", host, user)
}
