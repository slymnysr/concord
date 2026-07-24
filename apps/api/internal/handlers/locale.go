package handlers

import (
	"net/http"
	"strings"
)

// Desteklenen diller — web/mobil sözlükleri ve mailer ile AYNI liste.
// Biri eklenirse üçü birden güncellenmeli, yoksa kullanıcı yarı çevrilmiş ürün görür.
var supportedLocales = map[string]bool{
	"tr": true, "en": true, "de": true, "fr": true, "es": true, "pt": true, "ja": true,
}

// localeFrom — isteğin dili.
//
// Sıra: açık `locale` alanı → Accept-Language başlığı → "en".
// Türkçe'ye DÜŞMÜYORUZ: uygulama global, bilinmeyen dilde İngilizce vermek Türkçe
// vermekten iyidir (İngilizce dünya genelinde en yaygın ikinci dil).
func localeFrom(r *http.Request, explicit string) string {
	if l := normalizeLocale(explicit); l != "" {
		return l
	}
	// Accept-Language: "fr-CA,fr;q=0.9,en;q=0.8" → sırayla dene
	for _, part := range strings.Split(r.Header.Get("Accept-Language"), ",") {
		tag := strings.TrimSpace(strings.SplitN(part, ";", 2)[0])
		if l := normalizeLocale(tag); l != "" {
			return l
		}
	}
	return "en"
}

// normalizeLocale — "pt-BR" → "pt", "JA" → "ja". Desteklenmiyorsa "".
func normalizeLocale(tag string) string {
	tag = strings.ToLower(strings.TrimSpace(tag))
	if i := strings.IndexAny(tag, "-_"); i > 0 {
		tag = tag[:i]
	}
	if supportedLocales[tag] {
		return tag
	}
	return ""
}

// userLocale — kullanıcının kayıtlı dili; yoksa "en".
func userLocale(l *string) string {
	if l != nil && supportedLocales[*l] {
		return *l
	}
	return "en"
}
