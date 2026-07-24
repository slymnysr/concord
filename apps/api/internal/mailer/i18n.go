package mailer

// Mail metinleri — kullanıcının DİLİNDE.
//
// NEDEN BURADA: uygulama global. Şablon eskiden Türkçe sabit metin taşıyordu → Japon
// kullanıcı şifre sıfırlama mailini Türkçe alıyordu ve ne yapacağını anlamıyordu.
// Mailler API'den gider (istemci yok) → çeviri burada olmak zorunda.
//
// Desteklenen diller web/mobil sözlükleriyle aynı: tr, en, de, fr, es, pt, ja.
// Bilinmeyen dilde İngilizceye düşer (Türkçe'ye düşmek global kullanıcıya anlamadığı
// bir mail göndermek olurdu).

type Kind int

const (
	PasswordReset Kind = iota
	EmailVerify
	EmailChange
)

type Strings struct {
	Subject     string
	Title       string
	Body        string // %s = görünen ad veya yeni e-posta
	ActionLabel string
	Footer      string
	FallbackURL string
}

var texts = map[string]map[Kind]Strings{
	"tr": {
		PasswordReset: {"Şifre sıfırlama", "Şifreni sıfırla",
			"Merhaba %s,<br><br>Concord hesabın için şifre sıfırlama isteği aldık. Aşağıdaki butonla yeni şifreni belirleyebilirsin. Bağlantı <b>1 saat</b> geçerlidir.",
			"Yeni Şifre Belirle", "Bu işlemi sen başlatmadıysan bu maili yok sayabilirsin.",
			"Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:"},
		EmailVerify: {"E-postanı doğrula", "E-postanı doğrula",
			"Merhaba %s,<br><br>Concord hesabını doğrulamak için aşağıdaki butona tıkla.",
			"Doğrula", "Bu işlemi sen başlatmadıysan bu maili yok sayabilirsin.",
			"Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:"},
		EmailChange: {"E-posta değişikliğini onayla", "E-posta değişikliğini onayla",
			"Concord hesabının e-posta adresini <b>%s</b> olarak değiştirmek istedin. Onaylamak için aşağıdaki butona tıkla.",
			"Doğrula", "Bu işlemi sen başlatmadıysan bu maili yok sayabilirsin.",
			"Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:"},
	},
	"en": {
		PasswordReset: {"Password reset", "Reset your password",
			"Hi %s,<br><br>We received a password reset request for your Concord account. Use the button below to set a new password. The link is valid for <b>1 hour</b>.",
			"Set New Password", "If you didn't request this, you can safely ignore this email.",
			"If the button doesn't work, paste this link into your browser:"},
		EmailVerify: {"Verify your email", "Verify your email",
			"Hi %s,<br><br>Click the button below to verify your Concord account.",
			"Verify", "If you didn't request this, you can safely ignore this email.",
			"If the button doesn't work, paste this link into your browser:"},
		EmailChange: {"Confirm email change", "Confirm email change",
			"You asked to change your Concord account email to <b>%s</b>. Click the button below to confirm.",
			"Verify", "If you didn't request this, you can safely ignore this email.",
			"If the button doesn't work, paste this link into your browser:"},
	},
	"de": {
		PasswordReset: {"Passwort zurücksetzen", "Setze dein Passwort zurück",
			"Hallo %s,<br><br>wir haben eine Anfrage zum Zurücksetzen des Passworts für dein Concord-Konto erhalten. Mit der Schaltfläche unten kannst du ein neues Passwort festlegen. Der Link ist <b>1 Stunde</b> gültig.",
			"Neues Passwort festlegen", "Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.",
			"Wenn die Schaltfläche nicht funktioniert, füge diesen Link in deinen Browser ein:"},
		EmailVerify: {"E-Mail bestätigen", "Bestätige deine E-Mail",
			"Hallo %s,<br><br>klicke auf die Schaltfläche unten, um dein Concord-Konto zu bestätigen.",
			"Bestätigen", "Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.",
			"Wenn die Schaltfläche nicht funktioniert, füge diesen Link in deinen Browser ein:"},
		EmailChange: {"E-Mail-Änderung bestätigen", "E-Mail-Änderung bestätigen",
			"Du möchtest die E-Mail-Adresse deines Concord-Kontos zu <b>%s</b> ändern. Klicke zur Bestätigung auf die Schaltfläche unten.",
			"Bestätigen", "Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.",
			"Wenn die Schaltfläche nicht funktioniert, füge diesen Link in deinen Browser ein:"},
	},
	"fr": {
		PasswordReset: {"Réinitialisation du mot de passe", "Réinitialise ton mot de passe",
			"Bonjour %s,<br><br>Nous avons reçu une demande de réinitialisation du mot de passe de ton compte Concord. Utilise le bouton ci-dessous pour définir un nouveau mot de passe. Le lien est valable <b>1 heure</b>.",
			"Définir un nouveau mot de passe", "Si tu n'es pas à l'origine de cette demande, tu peux ignorer cet e-mail.",
			"Si le bouton ne fonctionne pas, colle ce lien dans ton navigateur :"},
		EmailVerify: {"Vérifie ton e-mail", "Vérifie ton e-mail",
			"Bonjour %s,<br><br>Clique sur le bouton ci-dessous pour vérifier ton compte Concord.",
			"Vérifier", "Si tu n'es pas à l'origine de cette demande, tu peux ignorer cet e-mail.",
			"Si le bouton ne fonctionne pas, colle ce lien dans ton navigateur :"},
		EmailChange: {"Confirme le changement d'e-mail", "Confirme le changement d'e-mail",
			"Tu as demandé à changer l'e-mail de ton compte Concord en <b>%s</b>. Clique sur le bouton ci-dessous pour confirmer.",
			"Vérifier", "Si tu n'es pas à l'origine de cette demande, tu peux ignorer cet e-mail.",
			"Si le bouton ne fonctionne pas, colle ce lien dans ton navigateur :"},
	},
	"es": {
		PasswordReset: {"Restablecer contraseña", "Restablece tu contraseña",
			"Hola %s,<br><br>Recibimos una solicitud para restablecer la contraseña de tu cuenta de Concord. Usa el botón de abajo para establecer una nueva contraseña. El enlace es válido durante <b>1 hora</b>.",
			"Establecer nueva contraseña", "Si no solicitaste esto, puedes ignorar este correo.",
			"Si el botón no funciona, pega este enlace en tu navegador:"},
		EmailVerify: {"Verifica tu correo", "Verifica tu correo",
			"Hola %s,<br><br>Haz clic en el botón de abajo para verificar tu cuenta de Concord.",
			"Verificar", "Si no solicitaste esto, puedes ignorar este correo.",
			"Si el botón no funciona, pega este enlace en tu navegador:"},
		EmailChange: {"Confirma el cambio de correo", "Confirma el cambio de correo",
			"Pediste cambiar el correo de tu cuenta de Concord a <b>%s</b>. Haz clic en el botón de abajo para confirmar.",
			"Verificar", "Si no solicitaste esto, puedes ignorar este correo.",
			"Si el botón no funciona, pega este enlace en tu navegador:"},
	},
	"pt": {
		PasswordReset: {"Redefinição de senha", "Redefina sua senha",
			"Olá %s,<br><br>Recebemos um pedido de redefinição de senha para sua conta Concord. Use o botão abaixo para definir uma nova senha. O link é válido por <b>1 hora</b>.",
			"Definir nova senha", "Se você não solicitou isso, pode ignorar este e-mail.",
			"Se o botão não funcionar, cole este link no seu navegador:"},
		EmailVerify: {"Verifique seu e-mail", "Verifique seu e-mail",
			"Olá %s,<br><br>Clique no botão abaixo para verificar sua conta Concord.",
			"Verificar", "Se você não solicitou isso, pode ignorar este e-mail.",
			"Se o botão não funcionar, cole este link no seu navegador:"},
		EmailChange: {"Confirme a alteração de e-mail", "Confirme a alteração de e-mail",
			"Você pediu para alterar o e-mail da sua conta Concord para <b>%s</b>. Clique no botão abaixo para confirmar.",
			"Verificar", "Se você não solicitou isso, pode ignorar este e-mail.",
			"Se o botão não funcionar, cole este link no seu navegador:"},
	},
	"ja": {
		PasswordReset: {"パスワードのリセット", "パスワードをリセット",
			"%s さん<br><br>Concord アカウントのパスワードリセットのリクエストを受け取りました。下のボタンから新しいパスワードを設定できます。リンクの有効期限は <b>1時間</b> です。",
			"新しいパスワードを設定", "心当たりがない場合は、このメールを無視してください。",
			"ボタンが動作しない場合は、このリンクをブラウザに貼り付けてください:"},
		EmailVerify: {"メールアドレスの確認", "メールアドレスを確認",
			"%s さん<br><br>下のボタンをクリックして Concord アカウントを確認してください。",
			"確認する", "心当たりがない場合は、このメールを無視してください。",
			"ボタンが動作しない場合は、このリンクをブラウザに貼り付けてください:"},
		EmailChange: {"メールアドレス変更の確認", "メールアドレス変更の確認",
			"Concord アカウントのメールアドレスを <b>%s</b> に変更するリクエストがありました。下のボタンで確認してください。",
			"確認する", "心当たりがない場合は、このメールを無視してください。",
			"ボタンが動作しない場合は、このリンクをブラウザに貼り付けてください:"},
	},
}

// T — kullanıcının dilinde mail metinleri. Bilinmeyen dilde İNGİLİZCE (Türkçe'ye düşmek
// global kullanıcıya anlamadığı bir mail göndermek olurdu).
func T(locale string, k Kind) Strings {
	if m, ok := texts[locale]; ok {
		return m[k]
	}
	return texts["en"][k]
}
