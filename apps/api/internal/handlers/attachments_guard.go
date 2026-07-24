package handlers

import (
	"context"
	"fmt"

	"github.com/concord/api/internal/repo"
)

// resolvedAttachment — istemci beyanı DEĞİL, sunucunun nesneden tespit ettiği metadata.
type resolvedAttachment struct {
	in       createAttachmentInput
	key      string
	contentT *string
	width    *int
	height   *int
	thumbURL *string
	size     int64
}

// resolveAttachments — mesaja iliştirilmek istenen ekleri DOĞRULAR.
//
// NEDEN: upload presigned URL ile doğrudan MinIO'ya gider, dolayısıyla istemci `url`,
// `content_type`, `size_bytes` alanlarını serbestçe uydurabilir. Doğrulama olmadan:
//   - taranmamış / ENFEKTE bir nesne mesaja iliştirilebilir,
//   - içerik tipi yalan söylenebilir (ör. .exe'yi image/png diye geçirmek),
//   - depoya ait olmayan bir dış URL ek olarak gösterilebilir.
//
// Bu yüzden URL'den nesne anahtarı çıkarılır ve media_objects'te 'clean' olması ŞART koşulur;
// metadata istemciden değil KAYITTAN alınır.
//
// Webhook yapılandırılmamışsa (MEDIA_EVENT_SECRET boş → dev/CI) doğrulama atlanır: MinIO
// olayı hiç gelmeyeceği için her ek 'pending' kalır ve yükleme tamamen kırılırdı. Üretimde
// bu boşluk kapalıdır — config.MustSecure() MEDIA_EVENT_SECRET'i zorunlu kılar.
func (h *Handler) resolveAttachments(ctx context.Context, in []createAttachmentInput) ([]resolvedAttachment, error) {
	out := make([]resolvedAttachment, 0, len(in))
	enforce := h.Config().MediaEventSecret != "" && h.Storage != nil

	for _, a := range in {
		if a.URL == "" || a.Filename == "" {
			continue
		}
		ra := resolvedAttachment{in: a, size: a.SizeBytes}
		if ct := a.ContentType; ct != "" {
			ra.contentT = &ct
		}

		if !enforce {
			out = append(out, ra)
			continue
		}

		key, ok := h.Storage.KeyFromPublicURL(a.URL)
		if !ok {
			return nil, fmt.Errorf("ek %q: bu depoya ait olmayan URL", a.Filename)
		}
		mo, err := h.MediaObjects.ByKey(ctx, key)
		if err != nil {
			return nil, fmt.Errorf("ek %q: durum okunamadı: %w", a.Filename, err)
		}
		switch {
		case mo == nil:
			return nil, fmt.Errorf("ek %q: dosya henüz işlenmedi, birkaç saniye sonra tekrar dene", a.Filename)
		case mo.Status == repo.MediaInfected:
			return nil, fmt.Errorf("ek %q: dosyada virüs bulundu, iliştirilemez", a.Filename)
		case mo.Status == repo.MediaRejected:
			return nil, fmt.Errorf("ek %q: dosya reddedildi (geçersiz/bozuk içerik)", a.Filename)
		case mo.Status != repo.MediaClean:
			return nil, fmt.Errorf("ek %q: dosya henüz taranıyor, birkaç saniye sonra tekrar dene", a.Filename)
		}

		// Metadata SUNUCUDAN — istemci beyanı yok sayılır
		ra.key = key
		ra.size = mo.SizeBytes
		if mo.ContentType != "" {
			ct := mo.ContentType
			ra.contentT = &ct
		}
		ra.width, ra.height = mo.Width, mo.Height
		if mo.ThumbKey != nil {
			tu := h.Storage.PublicURL(*mo.ThumbKey)
			ra.thumbURL = &tu
		}
		out = append(out, ra)
	}
	return out, nil
}
