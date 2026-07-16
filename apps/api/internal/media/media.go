// Package media — yüklenen dosyaların sunucu-tarafı işlenmesi: gerçek tip doğrulama
// (magic-byte), görüntülerde EXIF temizleme + thumbnail üretimi.
//
// Tetikleme: presigned upload'lar doğrudan MinIO'ya gider (API baytları görmez), bu yüzden
// işleme MinIO nesne-oluşturma olayıyla asenkron tetiklenir (webhook — bkz. handlers/media_events.go).
// MinIO event yapılandırması ve ClamAV container'ı FAZ F (infra) sağlar; bu kod hazır olup
// altyapı gelince aktive olur. Çekirdek işleme fonksiyonları altyapıdan bağımsız test edilir.
package media

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"net/http"

	"github.com/disintegration/imaging"
)

// ThumbMaxDim — thumbnail'in uzun kenarı (px). Oran korunur.
const ThumbMaxDim = 400

// Result — işleme çıktısı.
type Result struct {
	RealContentType string // magic-byte'tan tespit edilen gerçek tip
	IsImage         bool
	Width           int
	Height          int
	Thumbnail       []byte // JPEG thumbnail (yalnızca görüntülerde); EXIF içermez
}

// DetectType — dosyanın GERÇEK tipini içeriğinden tespit eder (uzantıya/istemci beyanına
// güvenmez). http.DetectContentType ilk 512 bayta bakar.
func DetectType(data []byte) string {
	return http.DetectContentType(data)
}

// Process — bir dosyayı doğrular ve görüntüyse thumbnail üretir.
//   - Gerçek tip magic-byte'tan alınır.
//   - Görüntü ise: yeniden-kodlanır (EXIF/metadata DÜŞER) ve thumbnail üretilir.
//   - Görüntü değilse: sadece gerçek tip döner (thumbnail yok).
func Process(data []byte) (*Result, error) {
	if len(data) == 0 {
		return nil, errors.New("boş dosya")
	}
	real := DetectType(data)
	res := &Result{RealContentType: real}

	// image/* değilse thumbnail üretmeyiz (video/pdf/vb. FAZ F'te ayrı ele alınır).
	if len(real) < 6 || real[:6] != "image/" {
		return res, nil
	}
	// SVG image/* değil (http.DetectContentType onu text/xml sayar) → buraya düşmez; iyi.
	img, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
	if err != nil {
		// image/* göründü ama decode edilemedi → bozuk/sahte; reddet.
		return nil, fmt.Errorf("görüntü çözülemedi (tip %s): %w", real, err)
	}
	res.IsImage = true
	b := img.Bounds()
	res.Width, res.Height = b.Dx(), b.Dy()

	thumb := imaging.Fit(img, ThumbMaxDim, ThumbMaxDim, imaging.Lanczos)
	var buf bytes.Buffer
	// JPEG olarak yeniden-kodla → EXIF/GPS/metadata tamamen düşer.
	if err := imaging.Encode(&buf, thumb, imaging.JPEG, imaging.JPEGQuality(82)); err != nil {
		return nil, fmt.Errorf("thumbnail kodlanamadı: %w", err)
	}
	res.Thumbnail = buf.Bytes()
	return res, nil
}

// StripExifImage — bir görüntüyü metadata'sız yeniden-kodlar (orijinali korurken EXIF temizlemek
// için; thumbnail'den ayrı, tam boyut). Görüntü değilse veriyi olduğu gibi döndürür.
func StripExifImage(data []byte) ([]byte, error) {
	real := DetectType(data)
	if len(real) < 6 || real[:6] != "image/" {
		return data, nil
	}
	img, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	format := imaging.JPEG
	if real == "image/png" {
		format = imaging.PNG
	}
	if err := encodeImage(&buf, img, format); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func encodeImage(buf *bytes.Buffer, img image.Image, f imaging.Format) error {
	if f == imaging.PNG {
		return imaging.Encode(buf, img, imaging.PNG)
	}
	return imaging.Encode(buf, img, imaging.JPEG, imaging.JPEGQuality(90))
}
