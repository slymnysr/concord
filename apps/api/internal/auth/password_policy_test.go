package auth

import "testing"

// Bu parolaların HEPSİ eski kuralı ("8 karakter") geçiyordu — ölçüldü, beşi de kabul
// ediliyordu. Dünyanın en yaygın parolaları; hesap kilidi bile korumaz çünkü saldırgan
// İLK denemede tutturur.
func TestCheckPassword_Reddedilenler(t *testing.T) {
	cases := []struct{ pw, kod string }{
		{"1234567", "too_short"},
		{"kisa", "too_short"},
		{"password", "too_short"},      // 8 karakter → uzunluğa takılır
		{"password123", "too_common"},  // 11 karakter ama listede
		{"password2024", "too_common"}, // sondaki rakamlar soyulunca listede
		{"12345678", "too_short"},
		{"1234567890", "too_common"},     // hem ardışık hem yaygın listede → önce yaygın yakalar
		{"aaaaaaaaaa", "too_repetitive"}, // tek karakter
		{"ababababab", "too_repetitive"}, // 2 karakterli döngü
		{"qwertyuiop", "too_common"},
		{"galatasaray", "too_common"},
	}
	for _, c := range cases {
		t.Run(c.pw, func(t *testing.T) {
			e := CheckPassword(c.pw)
			if e == nil {
				t.Fatalf("%q KABUL EDİLDİ, reddedilmeliydi (%s)", c.pw, c.kod)
			}
			if e.Code != c.kod {
				t.Errorf("%q → kod %q, beklenen %q", c.pw, e.Code, c.kod)
			}
		})
	}
}

// Kullanıcı kendi bilgisini parola yapamaz: e-posta/kullanıcı adı sızarsa parola da sızmış olur.
func TestCheckPassword_KimlikIcermez(t *testing.T) {
	cases := []struct {
		pw       string
		identity []string
	}{
		{"suleyman1234", []string{"suleyman.yasar@gmail.com"}},
		{"benimadimali99", []string{"benimadim"}},
		{"XyzKullanici7", []string{"xyzkullanici"}},
	}
	for _, c := range cases {
		e := CheckPassword(c.pw, c.identity...)
		if e == nil || e.Code != "contains_identity" {
			t.Errorf("%q (kimlik %v) → %v, contains_identity bekleniyordu", c.pw, c.identity, e)
		}
	}
}

// NIST SP 800-63B: karmaşıklık kuralı (büyük/küçük/rakam/sembol) ARTIK ÖNERİLMİYOR —
// kullanıcıyı "Password1!" kalıbına iter. Uzun ve sıradan olmayan parola GEÇMELİ.
func TestCheckPassword_Kabuller(t *testing.T) {
	kabuller := []string{
		"kirmizi at kosuyor",      // passphrase — sembol/rakam YOK ama entropi yüksek
		"mor-kedi-uctu-2026",      // passphrase
		"Tr0ub4dor&3",             // klasik karmaşık
		"benimcokgizliparolam",    // uzun, sıradan değil
		"correcthorsebatterystap", // xkcd
	}
	for _, pw := range kabuller {
		if e := CheckPassword(pw, "ahmet", "ahmet@ornek.com"); e != nil {
			t.Errorf("%q reddedildi (%s: %s) — geçmeliydi", pw, e.Code, e.Msg)
		}
	}
}

func TestCheckPassword_CokUzun(t *testing.T) {
	uzun := make([]byte, 200)
	for i := range uzun {
		uzun[i] = byte('a' + i%26)
	}
	// Çok uzun parola pahalı hash demek → DoS yüzeyi
	if e := CheckPassword(string(uzun)); e == nil || e.Code != "too_long" {
		t.Errorf("200 karakterlik parola → %v, too_long bekleniyordu", e)
	}
}
