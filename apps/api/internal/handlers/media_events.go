package handlers

import (
	"context"
	"crypto/subtle"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/concord/api/internal/media"
	"github.com/concord/api/internal/repo"
	"github.com/concord/api/internal/storage"
)

// maxProcessBytes — işleme için belleğe alınacak azami nesne boyutu. Presign sınırı 100MB;
// ama işleme (decode/tarama) belleği tutar → daha düşük tutulur. Büyük dosyalar taranmadan
// 'clean' sayılmaz; 'rejected' olur (sessizce geçirmek güvenlik açığı olurdu).
const maxProcessBytes = 25 * 1024 * 1024

// minioEvent — MinIO'nun ObjectCreated webhook gövdesi (S3 olay şeması, ihtiyacımız olan kısmı).
type minioEvent struct {
	Records []struct {
		EventName string `json:"eventName"`
		S3        struct {
			Bucket struct {
				Name string `json:"name"`
			} `json:"bucket"`
			Object struct {
				Key         string `json:"key"`
				Size        int64  `json:"size"`
				ContentType string `json:"contentType"`
			} `json:"object"`
		} `json:"s3"`
	} `json:"Records"`
}

// MediaEvents — MinIO ObjectCreated webhook'u.
//
// AKIŞ: upload presigned URL ile istemciden DOĞRUDAN MinIO'ya gider (API baytları görmez).
// MinIO burayı çağırır; biz nesneyi indirip doğrular, EXIF'siz thumbnail üretir ve tararız.
// Sonuç media_objects'e yazılır; mesaj oluşturulurken 'clean' değilse ek reddedilir.
//
// KİMLİK: MinIO `auth_token` config'ini `Authorization` header'ı olarak gönderir
// (X-Media-Secret DEĞİL — kendi betiğimizin başlığı bunu yanlış yazıyordu, düzeltildi).
func (h *Handler) MediaEvents(w http.ResponseWriter, r *http.Request) {
	secret := h.Config().MediaEventSecret
	if secret == "" {
		// Yapılandırılmamış → endpoint kapalı. Açık bırakmak kimliksiz webhook demek olurdu.
		writeError(w, http.StatusServiceUnavailable, "not_configured", "medya webhook'u yapılandırılmadı")
		return
	}
	if !validMediaSecret(r.Header.Get("Authorization"), secret) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "geçersiz webhook kimliği")
		return
	}
	if h.Storage == nil {
		writeError(w, http.StatusServiceUnavailable, "no_storage", "obje deposu yok")
		return
	}

	var ev minioEvent
	// Hoşgörülü: MinIO olayı şemasını bizim kontrol etmediğimiz onlarca alan taşır
	if err := readJSONLenient(r, &ev); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	// MinIO yanıtı beklemesin: işleme (indir+decode+tara) saniyeler sürebilir, yavaş yanıt
	// MinIO'nun kuyruğunu tıkar. 200 dön, arka planda işle.
	for _, rec := range ev.Records {
		if !strings.HasPrefix(rec.EventName, "s3:ObjectCreated:") {
			continue
		}
		key, err := url.QueryUnescape(rec.S3.Object.Key)
		if err != nil {
			key = rec.S3.Object.Key // kaçışsız gelmiş olabilir
		}
		// Türev nesnelerin kendi olayı yine buraya düşer → sonsuz döngü olmasın
		if strings.Contains(key, ".thumb.") {
			continue
		}
		go h.processMediaObject(key, rec.S3.Object.Size)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "accepted"})
}

// validMediaSecret — "Bearer <token>" veya çıplak token kabul eder; sabit-zamanlı karşılaştırır.
func validMediaSecret(header, secret string) bool {
	got := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	return subtle.ConstantTimeCompare([]byte(got), []byte(secret)) == 1
}

// processMediaObject — nesneyi indirir, doğrular, tarar, thumbnail üretir; sonucu yazar.
// Arka planda çalışır (istek context'i bağlı değil).
func (h *Handler) processMediaObject(key string, size int64) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	log := h.logger.With(zap.String("key", key))
	rec := repo.MediaObject{Key: key, SizeBytes: size, Status: repo.MediaPending}

	save := func() {
		if err := h.MediaObjects.Upsert(ctx, rec); err != nil {
			log.Error("medya durumu yazılamadı", zap.Error(err))
		}
	}
	reject := func(reason string) {
		rec.Status = repo.MediaRejected
		rec.Error = &reason
		// Reddedilen nesne depoda kalmasın: kimse iliştiremese de public bucket'ta erişilebilir olurdu
		if err := h.Storage.RemoveObject(ctx, key); err != nil {
			log.Warn("reddedilen nesne silinemedi", zap.Error(err))
		}
		save()
		log.Warn("medya reddedildi", zap.String("sebep", reason))
	}

	data, err := h.Storage.GetObject(ctx, key, maxProcessBytes)
	if err != nil {
		reject("nesne okunamadı/çok büyük: " + err.Error())
		return
	}

	// 1) Virüs taraması — ÖNCE. Enfekte dosyayı decode etmeye çalışmayalım.
	scan, err := media.Scan(data)
	if err != nil {
		// ClamAV yapılandırılmış ama ulaşılamıyor → 'clean' demek AÇIK olurdu. Beklet.
		rec.Status = repo.MediaPending
		e := "tarama başarısız: " + err.Error()
		rec.Error = &e
		save()
		log.Error("virüs taraması başarısız — nesne beklemede", zap.Error(err))
		return
	}
	if scan.Scanned && !scan.Clean {
		rec.Status = repo.MediaInfected
		rec.ScanSignature = &scan.Signature
		if err := h.Storage.RemoveObject(ctx, key); err != nil {
			log.Warn("enfekte nesne silinemedi", zap.Error(err))
		}
		save()
		log.Warn("ENFEKTE medya silindi", zap.String("imza", scan.Signature))
		return
	}

	// 2) Doğrula + (görüntüyse) EXIF'siz thumbnail üret
	res, err := media.Process(data)
	if err != nil {
		reject("işlenemedi: " + err.Error())
		return
	}
	rec.ContentType = res.RealContentType

	if res.IsImage {
		rec.Width, rec.Height = &res.Width, &res.Height
		if len(res.Thumbnail) > 0 {
			tk := storage.VariantKey(key, "thumb", ".jpg")
			if err := h.Storage.PutVariant(ctx, tk, "image/jpeg", res.Thumbnail); err != nil {
				// Thumbnail bonus; dosyanın kendisi temiz → reddetme, sadece logla
				log.Warn("thumbnail yazılamadı", zap.Error(err))
			} else {
				rec.ThumbKey = &tk
			}
		}
	}

	rec.Status = repo.MediaClean
	save()
	log.Info("medya işlendi", zap.String("tip", res.RealContentType),
		zap.Bool("görüntü", res.IsImage), zap.Bool("tarandı", scan.Scanned))
}
