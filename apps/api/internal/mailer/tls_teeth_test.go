package mailer

import (
	"bufio"
	"fmt"
	"net"
	"strings"
	"testing"
)

// STARTTLS SUNMAYAN, in-process gerçek bir SMTP sunucusu. Gmail/Outlook TLS sunar; asıl
// tehlikeli durum, TLS sunmayan bir sunucuyla konuşurken sessizce düz metin göndermektir.
//
// NEDEN MAILHOG DEĞİL: önceki hâli MailHog'a (dev compose) bağlıydı ve CI'da MailHog YOK →
// test "connection refused" ile atlanıyordu. Yani RequireTLS reddi silinse bile CI yeşil
// kalırdı: koruma CI'da ETKİSİZDİ. Bu in-process sunucu her yerde çalışır (yerel + CI +
// herhangi bir makine) ve deterministiktir. "Sahte" değil: gerçek bir TCP SMTP diyalogu
// yürütür — test edilen şey İSTEMCİNİN kararı (STARTTLS yoksa RequireTLS reddi), sunucunun
// kimliği değil.
func startPlainSMTP(t *testing.T) (host, port string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("dinleyici: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go serveOnePlainSMTP(conn)
		}
	}()
	h, p, _ := net.SplitHostPort(ln.Addr().String())
	return h, p
}

func serveOnePlainSMTP(conn net.Conn) {
	defer conn.Close()
	br := bufio.NewReader(conn)
	fmt.Fprint(conn, "220 localhost ESMTP\r\n")
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
			// KRİTİK: STARTTLS'i extension listesinde SUNMUYORUZ → c.Extension("STARTTLS")
			// false döner → RequireTLS=true ise mailer burada reddetmeli.
			fmt.Fprint(conn, "250-localhost\r\n250 SIZE 10485760\r\n")
		case strings.HasPrefix(cmd, "DATA"):
			fmt.Fprint(conn, "354 End data with <CR><LF>.<CR><LF>\r\n")
			for {
				l, err := br.ReadString('\n')
				if err != nil {
					return
				}
				if l == ".\r\n" {
					break
				}
			}
			fmt.Fprint(conn, "250 OK queued\r\n")
		case strings.HasPrefix(cmd, "QUIT"):
			fmt.Fprint(conn, "221 Bye\r\n")
			return
		default: // MAIL FROM, RCPT TO, RSET…
			fmt.Fprint(conn, "250 OK\r\n")
		}
	}
}

// RequireTLS gerçekten şifresiz göndermeyi REDDEDİYOR mu? Reddetmezse şifre sıfırlama
// bağlantısı düz metin olarak ağdan geçer ve hesap ele geçirilir.
func TestRequireTLS_sifresizGondermeyiReddeder(t *testing.T) {
	host, port := startPlainSMTP(t)
	m := New(host, port, "", "", "Concord <no-reply@concord.local>", true)
	if err := m.Send("kurban@e2e.local", "deneme", "<p>gövde</p>"); err == nil {
		t.Fatal("DİŞSİZ: RequireTLS=true ve sunucu STARTTLS sunmuyor, yine de gönderdi")
	} else {
		t.Logf("reddetti: %v", err)
	}
}

// Karşı test: kontrol SEÇİCİ mi, yoksa körlemesine her şeyi mi bloke ediyor? Bu olmadan
// yukarıdaki test, Send() her koşulda hata döndürse de yeşil yanardı.
func TestRequireTLSKapali_gonderebilir(t *testing.T) {
	host, port := startPlainSMTP(t)
	m := New(host, port, "", "", "Concord <no-reply@concord.local>", false)
	if err := m.Send("kurban@e2e.local", "deneme", "<p>gövde</p>"); err != nil {
		t.Fatalf("RequireTLS=false iken gönderemedi (kontrol kör): %v", err)
	}
}
