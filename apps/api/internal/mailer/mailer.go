// Paket mailer — SMTP üzerinden işlem mailleri (şifre sıfırlama, e-posta doğrulama).
// Geliştirmede MailHog (localhost:1025, http://localhost:8025) hedeflenir; prod'da
// SMTP_* env değişkenleriyle gerçek sağlayıcıya bağlanır.
package mailer

import (
	"fmt"
	"mime"
	"net/smtp"
	"strings"
)

type Mailer struct {
	Host string
	Port string
	User string
	Pass string
	From string // "Concord <no-reply@concord.local>"
}

func New(host, port, user, pass, from string) *Mailer {
	return &Mailer{Host: host, Port: port, User: user, Pass: pass, From: from}
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

func (m *Mailer) Send(to, subject, htmlBody string) error {
	encSubject := mime.QEncoding.Encode("utf-8", subject)
	msg := strings.Join([]string{
		"From: " + m.From,
		"To: " + to,
		"Subject: " + encSubject,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"",
		htmlBody,
	}, "\r\n")
	var a smtp.Auth
	if m.User != "" {
		a = smtp.PlainAuth("", m.User, m.Pass, m.Host)
	}
	addr := fmt.Sprintf("%s:%s", m.Host, m.Port)
	return smtp.SendMail(addr, a, m.fromAddr(), []string{to}, []byte(msg))
}

// Layout — basit, markasız olmayan ortak şablon.
func Layout(title, body, actionURL, actionLabel string) string {
	btn := ""
	if actionURL != "" {
		btn = fmt.Sprintf(
			`<p style="margin:28px 0"><a href="%s" style="background:#00D9A6;color:#0E1117;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">%s</a></p>
			<p style="color:#888;font-size:12px">Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:<br>%s</p>`,
			actionURL, actionLabel, actionURL)
	}
	return fmt.Sprintf(
		`<!doctype html><html lang="tr"><body style="margin:0;background:#0E1117;font-family:sans-serif;padding:32px">
<div style="max-width:520px;margin:0 auto;background:#161B22;border-radius:16px;padding:32px;color:#E6EDF3">
<h2 style="margin:0 0 6px;color:#00D9A6">Concord</h2>
<h3 style="margin:0 0 16px">%s</h3>
<div style="line-height:1.6;font-size:14px">%s</div>%s
<p style="color:#666;font-size:11px;margin-top:28px">Bu işlemi sen başlatmadıysan bu maili yok sayabilirsin.</p>
</div></body></html>`, title, body, btn)
}
