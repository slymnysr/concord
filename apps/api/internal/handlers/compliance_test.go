package handlers

import (
	"testing"
	"time"
)

// Yaş kapısı COPPA/DSA gereği. Sınır vakaları önemli: bir gün kayması 12 yaşındaki
// kullanıcıyı içeri alır ve yasal yükümlülük doğurur.
func TestAgeOK(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		ad    string
		dogum time.Time
		want  bool
	}{
		{"tam 13 (doğum günü bugün)", time.Date(2013, 7, 17, 0, 0, 0, 0, time.UTC), true},
		{"13'e bir gün var", time.Date(2013, 7, 18, 0, 0, 0, 0, time.UTC), false},
		{"12 yıl 11 ay", time.Date(2013, 8, 17, 0, 0, 0, 0, time.UTC), false},
		{"14 yaşında", time.Date(2012, 1, 1, 0, 0, 0, 0, time.UTC), true},
		{"5 yaşında", time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC), false},
		{"40 yaşında", time.Date(1986, 3, 3, 0, 0, 0, 0, time.UTC), true},
	}
	for _, c := range cases {
		t.Run(c.ad, func(t *testing.T) {
			if got := ageOK(c.dogum, now); got != c.want {
				t.Errorf("ageOK(%s) = %v, beklenen %v", c.dogum.Format("2006-01-02"), got, c.want)
			}
		})
	}
}
