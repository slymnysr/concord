package mailer

import (
	"bufio"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"fmt"
	"math/big"
	"net"
	"strings"
	"testing"
	"time"
)

// SMTP kurulumunun EN KRİTİK ve MailHog'la KANITLANAMAYAN yolu: gerçek TLS üzerinden mail
// gönderimi. MailHog TLS sunmaz → prod'da her mail STARTTLS/465 ile gidecek ama o kod yolu
// (tls.Client sarmalama, StartTLS handshake) hiç çalıştırılmamıştı. Bir hata varsa prod'da
// HİÇ mail gitmez ve bunu ancak canlıda görürdük. Bu test o yolu self-signed sertifikayla,
// gerçek TLS el sıkışmasıyla, uçtan uca doğrular.

// testCert — 127.0.0.1 için self-signed sertifika ve onu doğrulayan CA havuzu.
func testCert(t *testing.T) (tls.Certificate, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("anahtar: %v", err)
	}
	tmpl := x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "127.0.0.1"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
		IsCA:                  true,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("sertifika: %v", err)
	}
	parsed, _ := x509.ParseCertificate(der)
	pool := x509.NewCertPool()
	pool.AddCert(parsed)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}, pool
}

// smtpKomutDongusu — TLS kurulduktan SONRA çalışan ortak SMTP diyaloğu. Gövdeyi captured'a yazar.
func smtpKomutDongusu(rw *bufio.ReadWriter) (govde string) {
	var b strings.Builder
	inData := false
	for {
		line, err := rw.ReadString('\n')
		if err != nil {
			return b.String()
		}
		if inData {
			if line == ".\r\n" {
				inData = false
				fmt.Fprint(rw, "250 OK queued\r\n")
				rw.Flush()
				continue
			}
			b.WriteString(line)
			continue
		}
		u := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(u, "EHLO"), strings.HasPrefix(u, "HELO"):
			fmt.Fprint(rw, "250-test\r\n250 OK\r\n")
		case strings.HasPrefix(u, "DATA"):
			fmt.Fprint(rw, "354 gönder\r\n")
			inData = true
		case strings.HasPrefix(u, "QUIT"):
			fmt.Fprint(rw, "221 bye\r\n")
			rw.Flush()
			return b.String()
		default: // MAIL FROM, RCPT TO
			fmt.Fprint(rw, "250 OK\r\n")
		}
		rw.Flush()
	}
}

// TestSend_STARTTLS — Gmail 587'nin yolu: düz bağlantı aç, STARTTLS ile TLS'e yükselt,
// sonra gönder. mailer gerçekten TLS el sıkışması yapıp maili iletmeli.
func TestSend_STARTTLS(t *testing.T) {
	cert, pool := testCert(t)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	sonuc := make(chan string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			sonuc <- ""
			return
		}
		defer conn.Close()
		br := bufio.NewReader(conn)
		fmt.Fprint(conn, "220 test ESMTP\r\n")
		if _, err := br.ReadString('\n'); err != nil { // ilk EHLO
			sonuc <- ""
			return
		}
		fmt.Fprint(conn, "250-test\r\n250 STARTTLS\r\n")
		if _, err := br.ReadString('\n'); err != nil { // STARTTLS komutu
			sonuc <- ""
			return
		}
		fmt.Fprint(conn, "220 TLS'e hazır\r\n")
		// Düz bağlantıyı TLS'e yükselt
		tc := tls.Server(conn, &tls.Config{Certificates: []tls.Certificate{cert}})
		if err := tc.Handshake(); err != nil {
			sonuc <- "HANDSHAKE HATASI: " + err.Error()
			return
		}
		trw := bufio.NewReadWriter(bufio.NewReader(tc), bufio.NewWriter(tc))
		sonuc <- smtpKomutDongusu(trw)
	}()

	_, port, _ := net.SplitHostPort(ln.Addr().String())
	m := New("127.0.0.1", port, "", "", "Concord <no-reply@concord.local>", true)
	m.RootCAs = pool // self-signed sertifikayı doğrula (InsecureSkipVerify YOK)

	if err := m.Send("kime@x.local", "konu", "<p>şifre sıfırlama</p>"); err != nil {
		t.Fatalf("STARTTLS gönderimi başarısız (prod'da mail gitmezdi): %v", err)
	}
	govde := <-sonuc
	if strings.HasPrefix(govde, "HANDSHAKE") {
		t.Fatal(govde)
	}
	if !strings.Contains(govde, "şifre sıfırlama") {
		t.Fatalf("mail gövdesi TLS üzerinden sunucuya ulaşmadı: %q", govde)
	}
}

// TestSend_STARTTLS_sertifikaDogrular — TLS'in DOĞRU yapılandırıldığının kanıtı. RootCAs
// verilmezse (prod'da sistem güven deposu) mailer, güvenilmeyen self-signed sunucuyu
// REDDETMELİ. Reddetmezse InsecureSkipVerify açık demektir → MITM: saldırgan araya girip
// şifre sıfırlama maillerini okur/değiştirir. "TLS var" yetmez, "sertifika doğrulanıyor" şart.
func TestSend_STARTTLS_sertifikaDogrular(t *testing.T) {
	cert, _ := testCert(t) // CA havuzunu KASITLI vermiyoruz
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		br := bufio.NewReader(conn)
		fmt.Fprint(conn, "220 test ESMTP\r\n")
		_, _ = br.ReadString('\n') // EHLO
		fmt.Fprint(conn, "250-test\r\n250 STARTTLS\r\n")
		_, _ = br.ReadString('\n') // STARTTLS
		fmt.Fprint(conn, "220 hazır\r\n")
		tc := tls.Server(conn, &tls.Config{Certificates: []tls.Certificate{cert}})
		if err := tc.Handshake(); err != nil {
			return // mailer sertifikayı reddetti → handshake burada biter (BEKLENEN)
		}
		// Handshake GEÇTİYSE (yani mailer kabul ettiyse) SMTP diyaloğunu tamamla. Bu şart:
		// aksi hâlde sunucu TLS sonrası susardı ve Send, cert kabul edilse BİLE sonraki
		// adımda hata alırdı → test dişsiz kalır (cert reddini değil, sessizliği yakalardı).
		trw := bufio.NewReadWriter(bufio.NewReader(tc), bufio.NewWriter(tc))
		smtpKomutDongusu(trw)
	}()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	m := New("127.0.0.1", port, "", "", "Concord <no-reply@concord.local>", true)
	// RootCAs YOK → sistem güven deposu → güvenilmeyen self-signed REDDEDİLMELİ
	if err := m.Send("kime@x.local", "konu", "<p>x</p>"); err == nil {
		t.Fatal("self-signed sertifika KABUL edildi — doğrulama kapalı, MITM'e açık")
	}
}

// NOT — 465 (implicit TLS) yolu ayrı test edilmedi: mailer implicit-TLS'e yalnızca
// Port=="465" iken karar verir, o portu bağlamak ayrıcalık ister ve rastgele portta test
// etmek prod koduna yalnızca-test bir kanca eklemeyi (prod'u kirletmeyi) gerektirirdi.
// 465 yolu STARTTLS ile AYNI tls.Config'i (ServerName + MinTLS1.2 + RootCAs) ve aynı SMTP
// gönderim akışını paylaşır; farkı tek satırdır (tls.Client sarmalama). STARTTLS testi TLS
// el sıkışması + gönderimi zaten kanıtlıyor.
