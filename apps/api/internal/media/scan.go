package media

import (
	"encoding/binary"
	"errors"
	"net"
	"os"
	"strings"
	"time"
)

// ScanResult — virüs tarama sonucu.
type ScanResult struct {
	Scanned   bool   // ClamAV yapılandırılmış ve tarama fiilen yapıldı mı
	Clean     bool   // temiz mi
	Signature string // enfekteyse imza adı
}

// clamAVAddr — env: CLAMAV_ADDR (ör. "clamav:3310"). Container'ı FAZ F (infra) sağlar.
func clamAVAddr() string { return os.Getenv("CLAMAV_ADDR") }

// Scan — veriyi ClamAV INSTREAM protokolüyle tarar. CLAMAV_ADDR boşsa Scanned=false döner
// (yapılandırılmadı → atla; dev fail-open). Prod'da FAZ F adresi doldurur.
func Scan(data []byte) (ScanResult, error) {
	addr := clamAVAddr()
	if addr == "" {
		return ScanResult{Scanned: false, Clean: true}, nil
	}
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return ScanResult{}, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(30 * time.Second))

	if _, err := conn.Write([]byte("zINSTREAM\x00")); err != nil {
		return ScanResult{}, err
	}
	// Parçalar: 4-byte big-endian uzunluk + veri
	const chunk = 8192
	lb := make([]byte, 4)
	for i := 0; i < len(data); i += chunk {
		end := i + chunk
		if end > len(data) {
			end = len(data)
		}
		binary.BigEndian.PutUint32(lb, uint32(end-i))
		if _, err := conn.Write(lb); err != nil {
			return ScanResult{}, err
		}
		if _, err := conn.Write(data[i:end]); err != nil {
			return ScanResult{}, err
		}
	}
	// Bitiş: sıfır uzunluklu parça
	binary.BigEndian.PutUint32(lb, 0)
	if _, err := conn.Write(lb); err != nil {
		return ScanResult{}, err
	}

	resp := make([]byte, 4096)
	n, err := conn.Read(resp)
	if err != nil {
		return ScanResult{}, err
	}
	s := strings.TrimSpace(string(resp[:n]))
	switch {
	case strings.Contains(s, "FOUND"):
		sig := strings.TrimSuffix(strings.TrimPrefix(s, "stream: "), " FOUND")
		return ScanResult{Scanned: true, Clean: false, Signature: sig}, nil
	case strings.Contains(s, "OK"):
		return ScanResult{Scanned: true, Clean: true}, nil
	default:
		return ScanResult{}, errors.New("clamav beklenmeyen yanıt: " + s)
	}
}
