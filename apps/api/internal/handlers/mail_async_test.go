package handlers

import (
	"testing"
	"time"

	"go.uber.org/zap"
)

// Send çağrılınca started'ı kapatır, release gelene kadar BLOKLAR — yavaş SMTP'yi taklit eder.
type blockingSender struct {
	started chan struct{}
	release chan struct{}
}

func (s *blockingSender) Send(to, subject, html string) error {
	close(s.started)
	<-s.release
	return nil
}

// sendMailAsync GERÇEKTEN asenkron mu? ForgotPassword bunu kullanır. Senkron olsaydı:
// (1) yavaş SMTP HTTP isteğini bloke eder, (2) enumeration timing side-channel açılır
// (hesap varsa yanıt SMTP kadar gecikir, yoksa anında döner).
func TestSendMailAsync(t *testing.T) {
	s := &blockingSender{started: make(chan struct{}), release: make(chan struct{})}
	h := &Handler{Mailer: s, logger: zap.NewNop()}

	returned := make(chan struct{})
	go func() {
		h.sendMailAsync("kurban@x.com", "konu", "gövde")
		close(returned)
	}()

	// Send BLOKLARKEN bile sendMailAsync hemen dönmeli
	select {
	case <-returned:
	case <-time.After(2 * time.Second):
		t.Fatal("sendMailAsync bloklandı — senkron çalışıyor (HTTP bloklama + timing side-channel)")
	}
	// Mail arka planda GERÇEKTEN gönderilmeli (yoksa async ama mail hiç gitmiyor demektir)
	select {
	case <-s.started:
	case <-time.After(2 * time.Second):
		t.Fatal("Send hiç çağrılmadı — mail arka planda da gitmiyor")
	}
	close(s.release)
}
