package mailer

import "fmt"

// Mail şablonu.
//
// DİL: uygulama GLOBAL. Şablon eskiden `lang="tr"` ve Türkçe sabit metin ("Bu işlemi sen
// başlatmadıysan…") taşıyordu → Japon kullanıcı şifre sıfırlama mailini Türkçe alıyordu.
// Metinler artık ÇAĞIRANDAN gelir; burada yalnızca iskelet var.

// Text — şablonun çevrilebilir parçaları.
type Text struct {
	Lang        string // "tr" | "en" | … (html lang özniteliği)
	Title       string
	Body        string
	ActionURL   string
	ActionLabel string
	Footer      string // "Bu işlemi sen başlatmadıysan bu maili yok sayabilirsin."
	FallbackURL string // "Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:"
}

func Layout(t Text) string {
	btn := ""
	if t.ActionURL != "" {
		btn = fmt.Sprintf(
			`<p style="margin:28px 0"><a href="%s" style="background:#00D9A6;color:#0E1117;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">%s</a></p>
			<p style="color:#888;font-size:12px">%s<br>%s</p>`,
			t.ActionURL, t.ActionLabel, t.FallbackURL, t.ActionURL)
	}
	lang := t.Lang
	if lang == "" {
		lang = "en"
	}
	return fmt.Sprintf(
		`<!doctype html><html lang="%s"><body style="margin:0;background:#0E1117;font-family:sans-serif;padding:32px">
<div style="max-width:520px;margin:0 auto;background:#161B22;border-radius:16px;padding:32px;color:#E6EDF3">
<h2 style="margin:0 0 6px;color:#00D9A6">Concord</h2>
<h3 style="margin:0 0 16px">%s</h3>
<div style="line-height:1.6;font-size:14px">%s</div>%s
<p style="color:#666;font-size:11px;margin-top:28px">%s</p>
</div></body></html>`, lang, t.Title, t.Body, btn, t.Footer)
}
