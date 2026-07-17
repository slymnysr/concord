package mailer

import (
	"strings"
	"testing"
)

// RequireTLS gerçekten şifresiz göndermeyi REDDEDİYOR mu?
//
// NEDEN GERÇEK SUNUCUYA KARŞI: MailHog (dev compose) TLS SUNMAZ. Sahte bir SMTP
// sunucusuyla test etmek, "reddediyor" iddiasını kanıtlamaz — asıl soru, TLS sunmayan
// GERÇEK bir sunucuyla konuşurken ne olduğu. Reddetmezse şifre sıfırlama bağlantısı
// düz metin olarak ağdan geçer ve hesap ele geçirilir.
//
// MailHog yoksa atlanır (CI'da compose ile ayakta).
func TestRequireTLS_sifresizGondermeyiReddeder(t *testing.T) {
	m := New("localhost", "1025", "", "", "Concord <no-reply@concord.local>", true)
	err := m.Send("kurban@e2e.local", "deneme", "<p>gövde</p>")
	if err == nil {
		t.Fatal("DİŞSİZ: RequireTLS=true olmasına rağmen ŞİFRESİZ gönderdi")
	}
	if strings.Contains(err.Error(), "connection refused") {
		t.Skip("MailHog ayakta değil")
	}
	t.Logf("reddetti: %v", err)
}

// Karşı kontrol: kontrol SEÇİCİ mi, yoksa körlemesine her şeyi mi bloke ediyor?
// Bu olmadan yukarıdaki test, Send() her zaman hata döndürse de geçerdi.
func TestRequireTLSKapali_gonderebilir(t *testing.T) {
	m := New("localhost", "1025", "", "", "Concord <no-reply@concord.local>", false)
	if err := m.Send("kurban@e2e.local", "deneme", "<p>gövde</p>"); err != nil {
		if strings.Contains(err.Error(), "connection refused") {
			t.Skip("MailHog ayakta değil")
		}
		t.Fatalf("RequireTLS=false iken de gönderemedi (kontrol kör): %v", err)
	}
}
