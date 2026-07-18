package auth

import "testing"

func TestGenerateRecoveryCodes(t *testing.T) {
	plain, hashes, err := GenerateRecoveryCodes()
	if err != nil {
		t.Fatalf("üretim hatası: %v", err)
	}
	if len(plain) != RecoveryCodeCount || len(hashes) != RecoveryCodeCount {
		t.Fatalf("kod sayısı %d/%d, beklenen %d", len(plain), len(hashes), RecoveryCodeCount)
	}
	// Kodlar benzersiz olmalı (çakışma tek kullanımlıkta veri karışıklığı yaratır)
	seen := map[string]bool{}
	for _, c := range plain {
		if seen[c] {
			t.Fatalf("tekrar eden kod: %q", c)
		}
		seen[c] = true
	}
	// Döndürülen hash, düz kodun hash'iyle eşleşmeli (DB'ye doğru şey yazılıyor)
	for i, c := range plain {
		if HashRecoveryCode(c) != hashes[i] {
			t.Fatalf("hash uyumsuz: kod %q", c)
		}
	}
}

// Kullanıcı kurtarma kodunu nasıl girerse girsin (tireli/tiresiz/BÜYÜK/boşluklu) aynı hash'e
// çözülmeli — yoksa doğru kodu girip "hatalı" cevabı alırdı.
func TestHashRecoveryCode_normalize(t *testing.T) {
	base := HashRecoveryCode("abcde-fghij")
	for _, v := range []string{"ABCDE-FGHIJ", "abcdefghij", "  abcde-fghij  ", "abcde fghij", "AbCdE-FgHiJ"} {
		if HashRecoveryCode(v) != base {
			t.Errorf("%q farklı hash üretti — normalizasyon eksik, kullanıcı doğru kodu giremez", v)
		}
	}
	// Farklı kod farklı hash (çakışma yok)
	if HashRecoveryCode("abcde-fghij") == HashRecoveryCode("zzzzz-zzzzz") {
		t.Error("farklı kodlar aynı hash — çakışma")
	}
}
