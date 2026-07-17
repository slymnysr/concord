// Paket mailer — SMTP üzerinden işlem mailleri (şifre sıfırlama, e-posta doğrulama).
// Geliştirmede MailHog (localhost:1025, http://localhost:8025) hedeflenir; prod'da
// SMTP_* env değişkenleriyle gerçek sağlayıcıya bağlanır.
package mailer

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// Gönderim zaman aşımı. ÖNCESİNDE YOKTU: smtp.SendMail'in deadline'ı yok, cevap vermeyen
// bir SMTP sunucusu goroutine'i SONSUZA KADAR tutar. Mailler arka planda gönderiliyor,
// yani sızıntı sessizce birikir.
const sendTimeout = 20 * time.Second

type Mailer struct {
	Host string
	Port string
	User string
	Pass string
	From string // "Concord <no-reply@concord.local>"
	// RequireTLS — şifresiz bağlantıda göndermeyi REDDET. Üretimde true olmalı:
	// şifre sıfırlama bağlantısı düz metin olarak ağdan geçerse hesap ele geçirilir.
	RequireTLS bool
	// RootCAs — TLS sunucu sertifikasını doğrulamak için özel kök CA havuzu. nil ise
	// sistemin güven deposu kullanılır (Gmail/Outlook/SES için doğru olan bu). Yalnızca
	// özel CA'lı kurumsal SMTP relay'lerinde veya testte doldurulur. InsecureSkipVerify
	// BİLEREK yok: sertifika doğrulamasını kapatmak MITM'e kapı açar.
	RootCAs *x509.CertPool
}

func New(host, port, user, pass, from string, requireTLS bool) *Mailer {
	return &Mailer{Host: host, Port: port, User: user, Pass: pass, From: from, RequireTLS: requireTLS}
}

// fromAddr — "Ad <adres>" biçiminden düz adresi çıkarır (SMTP MAIL FROM için).
func (m *Mailer) fromAddr() string {
	if i := strings.Index(m.From, "<"); i >= 0 {
		if j := strings.Index(m.From, ">"); j > i {
			return m.From[i+1 : j]
		}
	}
	return m.From
}

// headerSafe — CR/LF temizler.
//
// NEDEN: başlıklar mesaj gövdesine string olarak yazılıyor. Alıcı adresinde veya konuda
// "\r\n" olursa saldırgan KENDİ BAŞLIKLARINI enjekte eder (ör. "Bcc: kurban@x.com" →
// şifre sıfırlama bağlantısı saldırgana da gider). Konu zaten Q-encode ediliyor ama
// adres edilmiyordu.
func headerSafe(s string) string {
	return strings.NewReplacer("\r", "", "\n", "").Replace(s)
}

func (m *Mailer) Send(to, subject, htmlBody string) error {
	to = headerSafe(to)
	if to == "" || !strings.Contains(to, "@") {
		return errors.New("geçersiz alıcı adresi")
	}

	msg := strings.Join([]string{
		"From: " + headerSafe(m.From),
		"To: " + to,
		"Subject: " + mime.QEncoding.Encode("utf-8", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"",
		htmlBody,
	}, "\r\n")

	return m.send(to, []byte(msg))
}

// send — bağlantıyı kurar ve mesajı yollar.
//
// smtp.SendMail KULLANILMIYOR çünkü: (1) zaman aşımı yok, (2) IMPLICIT TLS (port 465)
// desteklemiyor — yalnızca STARTTLS (587) yapar. Gmail/Outlook dahil birçok sağlayıcı
// 465 sunar; SendMail ile o portta bağlantı sessizce asılı kalır.
func (m *Mailer) send(to string, msg []byte) error {
	addr := net.JoinHostPort(m.Host, m.Port)

	conn, err := net.DialTimeout("tcp", addr, sendTimeout)
	if err != nil {
		return fmt.Errorf("smtp bağlantı: %w", err)
	}
	// Tüm işlem için tek deadline — sunucu ortada susarsa asılı kalmayalım
	_ = conn.SetDeadline(time.Now().Add(sendTimeout))

	// Port 465 = IMPLICIT TLS: el sıkışma daha ilk baytta TLS'tir (STARTTLS yok).
	if m.Port == "465" {
		conn = tls.Client(conn, &tls.Config{ServerName: m.Host, MinVersion: tls.VersionTLS12, RootCAs: m.RootCAs})
	}

	c, err := smtp.NewClient(conn, m.Host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("smtp istemci: %w", err)
	}
	defer c.Close()

	// STARTTLS (port 587 ve çoğu sağlayıcı)
	if m.Port != "465" {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(&tls.Config{ServerName: m.Host, MinVersion: tls.VersionTLS12, RootCAs: m.RootCAs}); err != nil {
				return fmt.Errorf("starttls: %w", err)
			}
		} else if m.RequireTLS {
			// Sunucu TLS sunmuyor ve biz şart koşuyoruz → GÖNDERME.
			// Sessizce düz metin göndermek, şifre sıfırlama bağlantısını ağa açmak demek.
			return errors.New("sunucu STARTTLS sunmuyor ve SMTP_REQUIRE_TLS=true — mail gönderilmedi")
		}
	}

	if m.User != "" {
		// smtp.PlainAuth şifresiz bağlantıda kimlik bilgisi göndermeyi kendisi reddeder
		// (Go davranışı) — yani parola düz metin sızmaz.
		if err := c.Auth(smtp.PlainAuth("", m.User, m.Pass, m.Host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err := c.Mail(m.fromAddr()); err != nil {
		return fmt.Errorf("MAIL FROM: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("RCPT TO: %w", err)
	}
	wc, err := c.Data()
	if err != nil {
		return fmt.Errorf("DATA: %w", err)
	}
	if _, err := wc.Write(msg); err != nil {
		return fmt.Errorf("yazma: %w", err)
	}
	if err := wc.Close(); err != nil {
		return fmt.Errorf("kapatma: %w", err)
	}
	return c.Quit()
}
