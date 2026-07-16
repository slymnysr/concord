package storage

import "testing"

func TestVariantKey(t *testing.T) {
	cases := []struct{ key, want string }{
		{"uploads/2026/07/17/1/abc_foto.jpg", "uploads/2026/07/17/1/abc_foto.thumb.jpg"},
		{"uploads/foto.PNG", "uploads/foto.thumb.jpg"},
		{"uploads/uzantisiz", "uploads/uzantisiz.thumb.jpg"},
		// Dizinde nokta, dosyada yok → yanlışlıkla dizin adını kesmemeli
		{"a.b/c/dosya", "a.b/c/dosya.thumb.jpg"},
	}
	for _, c := range cases {
		if got := VariantKey(c.key, "thumb", ".jpg"); got != c.want {
			t.Errorf("VariantKey(%q) = %q, beklenen %q", c.key, got, c.want)
		}
	}
}

func TestKeyFromPublicURL(t *testing.T) {
	s := &Storage{public: "http://localhost:9000", bucket: "concord-uploads"}
	cases := []struct {
		ad     string
		url    string
		want   string
		wantOK bool
	}{
		{"geçerli", "http://localhost:9000/concord-uploads/uploads/a/b.jpg", "uploads/a/b.jpg", true},
		// İstemci rastgele bir dış URL'i ek diye gönderirse nesne anahtarı sanılmamalı
		{"dış URL", "https://kotu.example/virus.exe", "", false},
		{"başka bucket", "http://localhost:9000/baska-bucket/x.jpg", "", false},
		{"boş anahtar", "http://localhost:9000/concord-uploads/", "", false},
		{"dizin kaçışı", "http://localhost:9000/concord-uploads/../gizli", "", false},
		{"önek benzeri (aldatma)", "http://localhost:9000/concord-uploads-sahte/x.jpg", "", false},
	}
	for _, c := range cases {
		t.Run(c.ad, func(t *testing.T) {
			got, ok := s.KeyFromPublicURL(c.url)
			if ok != c.wantOK || got != c.want {
				t.Errorf("KeyFromPublicURL(%q) = (%q,%v), beklenen (%q,%v)", c.url, got, ok, c.want, c.wantOK)
			}
		})
	}
}
