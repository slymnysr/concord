package media

import "testing"

// ClamAV'ın gerçek yanıtları NUL ile biter (zINSTREAM). Bu vaka üretimde enfekte
// kayıtların yazılamamasına yol açtı — imzada kalan NUL Postgres'i patlatıyordu.
func TestParseScanResponse(t *testing.T) {
	cases := []struct {
		ad        string
		raw       string
		clean     bool
		imza      string
		hataBekle bool
	}{
		{"temiz (NUL'lu)", "stream: OK\x00", true, "", false},
		{"temiz (NUL'suz)", "stream: OK\n", true, "", false},
		{"enfekte (NUL'lu)", "stream: Eicar-Test-Signature FOUND\x00", false, "Eicar-Test-Signature", false},
		{"enfekte (NUL'suz)", "stream: Eicar-Test-Signature FOUND\n", false, "Eicar-Test-Signature", false},
		{"beklenmeyen", "stream: ERROR\x00", false, "", true},
	}
	for _, c := range cases {
		t.Run(c.ad, func(t *testing.T) {
			r, err := parseScanResponse(c.raw)
			if c.hataBekle {
				if err == nil {
					t.Fatal("hata bekleniyordu")
				}
				return
			}
			if err != nil {
				t.Fatalf("beklenmeyen hata: %v", err)
			}
			if r.Clean != c.clean {
				t.Errorf("Clean=%v, beklenen %v", r.Clean, c.clean)
			}
			if r.Signature != c.imza {
				t.Errorf("Signature=%q, beklenen %q", r.Signature, c.imza)
			}
			// Postgres text NUL saklayamaz → imza ASLA NUL içermemeli
			for _, b := range []byte(r.Signature) {
				if b == 0 {
					t.Fatalf("imzada NUL baytı var: %q", r.Signature)
				}
			}
		})
	}
}
