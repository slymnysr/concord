package media

import (
	"bytes"
	"image"
	"image/color"
	"testing"

	"github.com/disintegration/imaging"
)

func makePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{uint8(x % 256), uint8(y % 256), 128, 255})
		}
	}
	var buf bytes.Buffer
	if err := imaging.Encode(&buf, img, imaging.PNG); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// Gerçek görüntü → IsImage, boyutlar, thumbnail geçerli ve uzun kenarı <= ThumbMaxDim.
func TestProcess_Image(t *testing.T) {
	data := makePNG(t, 800, 600)
	res, err := Process(data)
	if err != nil {
		t.Fatal(err)
	}
	if !res.IsImage || res.Width != 800 || res.Height != 600 {
		t.Fatalf("beklenen 800x600 görüntü, gelen %+v", res)
	}
	if len(res.Thumbnail) == 0 {
		t.Fatal("thumbnail üretilmedi")
	}
	// Thumbnail geçerli bir görüntü mü + küçültülmüş mü?
	th, err := imaging.Decode(bytes.NewReader(res.Thumbnail))
	if err != nil {
		t.Fatalf("thumbnail decode edilemedi: %v", err)
	}
	b := th.Bounds()
	if b.Dx() > ThumbMaxDim || b.Dy() > ThumbMaxDim {
		t.Fatalf("thumbnail %dx%d, sınır %d aşıldı", b.Dx(), b.Dy(), ThumbMaxDim)
	}
	if b.Dx() != 400 { // 800x600 → fit 400 → 400x300
		t.Fatalf("oran korunmalıydı; beklenen genişlik 400, gelen %d", b.Dx())
	}
}

// Görüntü olmayan veri → IsImage=false, thumbnail yok, hata yok.
func TestProcess_NonImage(t *testing.T) {
	res, err := Process([]byte("bu düz bir metin dosyasıdır, görüntü değil"))
	if err != nil {
		t.Fatal(err)
	}
	if res.IsImage || len(res.Thumbnail) != 0 {
		t.Fatalf("metin görüntü sayılmamalı; gelen %+v", res)
	}
}

// image/* magic-byte'a sahip ama bozuk içerik → reddet (sahte/zararlı olabilir).
func TestProcess_FakeImageRejected(t *testing.T) {
	fake := append([]byte("\x89PNG\r\n\x1a\n"), []byte("çöp veri, geçerli png değil")...)
	if DetectType(fake) != "image/png" {
		t.Skip("ortam bunu image/png saymadı")
	}
	if _, err := Process(fake); err == nil {
		t.Fatal("bozuk 'görüntü' reddedilmeliydi")
	}
}

// EXIF temizleme: yeniden-kodlanan çıktı geçerli görüntü olarak decode edilebilmeli.
func TestStripExif(t *testing.T) {
	data := makePNG(t, 100, 100)
	out, err := StripExifImage(data)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := imaging.Decode(bytes.NewReader(out)); err != nil {
		t.Fatalf("EXIF-temizlenmiş çıktı geçersiz: %v", err)
	}
}

// ClamAV yapılandırılmadığında tarama atlanır (Scanned=false, hata yok).
func TestScan_SkipWhenUnconfigured(t *testing.T) {
	res, err := Scan([]byte("herhangi bir veri"))
	if err != nil {
		t.Fatal(err)
	}
	if res.Scanned {
		t.Fatal("CLAMAV_ADDR yokken tarama yapılmamalıydı")
	}
	if !res.Clean {
		t.Fatal("yapılandırılmamışken Clean=true (fail-open) beklenir")
	}
}
