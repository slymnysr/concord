package auth

import "strings"

// Parola politikası.
//
// ÖNCESİ: tek kural "en az 8 karakter" → "password", "12345678", "aaaaaaaa", "qwertyui"
// hepsi kabul ediliyordu (ölçüldü). Bunlar dünyanın en yaygın parolaları; brute-force
// savunması (hesap kilidi) bile onları korumaz çünkü saldırgan İLK denemede tutturur.
//
// TASARIM — karmaşıklık kuralı (büyük/küçük/rakam/sembol zorunlu) KASITLI OLARAK YOK:
// NIST SP 800-63B bunları ARTIK ÖNERMİYOR. Kullanıcıyı "Password1!" gibi tahmin edilebilir
// kalıplara iter ve gerçek entropiyi artırmaz. Bunun yerine:
//   1. Uzunluk (asıl entropi kaynağı)
//   2. Bilinen-zayıf liste (NIST'in açıkça ÖNERDİĞİ kontrol)
//   3. Tekrar/dizi tespiti ("aaaaaaaa", "12345678")
//   4. Kullanıcının kendi bilgisini içermemesi (e-posta/kullanıcı adı)

const MinPasswordLen = 10

// Şifre listesi — en yaygın sızdırılmış parolalar + Türkçe/global varyantlar.
// Tam liste (milyonlarca) yerine üst dilim: uzun kuyruk zaten uzunluk kuralına takılır.
// Karşılaştırma küçük harfe indirgenmiş halde yapılır.
var yaygınParolalar = map[string]bool{
	"password": true, "passw0rd": true, "password1": true, "password123": true,
	"12345678": true, "123456789": true, "1234567890": true, "qwertyuiop": true,
	"qwerty123": true, "1q2w3e4r": true, "1qaz2wsx": true, "abc123456": true,
	"iloveyou": true, "sunshine": true, "princess": true, "football": true,
	"monkey123": true, "dragon123": true, "letmein123": true, "welcome123": true,
	"admin123": true, "administrator": true, "qwertyui": true, "asdfghjk": true,
	"87654321": true, "11111111": true, "00000000": true, "aaaaaaaa": true,
	// Türkçe yaygınlar
	"sifre123": true, "parola123": true, "galatasaray": true, "fenerbahce": true,
	"besiktas1": true, "trabzonspor": true, "istanbul1": true, "turkiye123": true,
}

// PasswordError — hangi kural ihlal edildi (istemci çevirebilsin diye KOD).
type PasswordError struct {
	Code string // "too_short" | "too_common" | "too_repetitive" | "contains_identity"
	Msg  string
}

func (e *PasswordError) Error() string { return e.Msg }

// CheckPassword — parola politikası. identity: e-posta/kullanıcı adı gibi kendi bilgileri.
func CheckPassword(pw string, identity ...string) *PasswordError {
	if len([]rune(pw)) < MinPasswordLen {
		return &PasswordError{"too_short", "parola en az 10 karakter olmalı"}
	}
	// 72 bayt: bcrypt sınırı. argon2id'de sınır yok ama makul üst sınır DoS'a karşı
	// (çok uzun parola = pahalı hash).
	if len(pw) > 128 {
		return &PasswordError{"too_long", "parola en fazla 128 karakter olabilir"}
	}

	low := strings.ToLower(pw)
	if yaygınParolalar[low] {
		return &PasswordError{"too_common", "bu parola çok yaygın, tahmin edilmesi kolay"}
	}
	// Sondaki rakamları soyup tekrar bak: "password2024" → "password"
	if yaygınParolalar[strings.TrimRight(low, "0123456789!.")] {
		return &PasswordError{"too_common", "bu parola çok yaygın, tahmin edilmesi kolay"}
	}

	if tekDüzen(pw) {
		return &PasswordError{"too_repetitive", "parola tekrar veya sıralı dizi içeriyor (ör. aaaa, 1234)"}
	}

	for _, id := range identity {
		for _, parça := range kimlikParçaları(id) {
			if strings.Contains(low, parça) {
				return &PasswordError{"contains_identity", "parola kullanıcı adını veya e-postanı içeremez"}
			}
		}
	}
	return nil
}

// kimlikParçaları — bir kimlikten (e-posta/kullanıcı adı) aranacak parçalar.
//
// Yalnızca tamamını aramak YETMEZ: "suleyman.yasar@gmail.com" e-postasında yerel kısım
// "suleyman.yasar" ama kullanıcı parolasını "suleyman1234" yapar ve kontrol geçer (ölçüldü).
// Ayırıcılara bölüp her anlamlı parçayı ayrı ararız.
func kimlikParçaları(id string) []string {
	if id == "" {
		return nil
	}
	// E-postada yalnızca yerel kısım anlamlı: alan adı ("gmail") herkeste ortak
	if i := strings.Index(id, "@"); i > 0 {
		id = id[:i]
	}
	low := strings.ToLower(id)

	out := []string{}
	ekle := func(p string) {
		// 4'ten kısa parçalar ("ali", "ege") rastgele parolalarda da geçer → yanlış pozitif
		if len(p) >= 4 {
			out = append(out, p)
		}
	}
	ekle(low)
	for _, p := range strings.FieldsFunc(low, func(r rune) bool {
		return r == '.' || r == '_' || r == '-' || r == '+' || (r >= '0' && r <= '9')
	}) {
		ekle(p)
	}
	return out
}

// tekDüzen — parola tek karakterin tekrarı mı ya da ardışık dizi mi.
// Bunlar uzunluk kuralını geçer ama entropileri sıfıra yakındır.
func tekDüzen(pw string) bool {
	r := []rune(pw)
	if len(r) < 4 {
		return false
	}

	// Hepsi aynı karakter
	hepsiAyni := true
	for _, c := range r[1:] {
		if c != r[0] {
			hepsiAyni = false
			break
		}
	}
	if hepsiAyni {
		return true
	}

	// Tamamen ardışık (1234…, abcd…, 9876…)
	artan, azalan := true, true
	for i := 1; i < len(r); i++ {
		if r[i] != r[i-1]+1 {
			artan = false
		}
		if r[i] != r[i-1]-1 {
			azalan = false
		}
	}
	if artan || azalan {
		return true
	}

	// Yalnızca 2 farklı karakterden oluşan uzun parolalar ("ababab…", "1212…")
	farkli := map[rune]bool{}
	for _, c := range r {
		farkli[c] = true
	}
	if len(farkli) <= 2 && len(r) >= 8 {
		return true
	}

	// Klavye dizisinin bir parçası mı ("qwertyui" → "qwertyuiop" içinde)
	low := strings.ToLower(pw)
	for _, satır := range []string{"qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"} {
		if len(r) >= 6 && strings.Contains(satır, low) {
			return true
		}
	}
	return false
}
