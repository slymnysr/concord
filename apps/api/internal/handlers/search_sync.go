package handlers

import (
	"context"
	"regexp"
	"time"

	"go.uber.org/zap"

	"github.com/concord/api/internal/repo"
	"github.com/concord/api/internal/search"
)

var linkRe = regexp.MustCompile(`https?://`)

// indexMessage — mesaj oluşturuldu/düzenlendi → arama indeksini güncelle.
//
// NEDEN ARKA PLANDA: indeksleme ağ çağrısıdır (Meilisearch). Mesaj gönderimini arama
// motorunun hızına/erişilebilirliğine bağlamak, Meilisearch yavaşlayınca sohbeti
// durdururdu. Arama biraz gecikebilir; mesaj gönderimi gecikemez.
//
// NEDEN SENKRON ŞART: bağlanmazsa indeks bayatlar → yeni mesajlar aramada HİÇ çıkmaz,
// düzenlenenler eski metniyle bulunur, silinenler sonuçlarda kalır. "Sonra hallederiz"
// denecek bir şey değil; arama sessizce yanlış cevap verir.
func (h *Handler) indexMessage(m *repo.Message) {
	if h.Search == nil || m == nil {
		return
	}
	d := search.Doc{
		ID:        m.ID,
		ChannelID: m.ChannelID,
		AuthorID:  m.AuthorID,
		Content:   m.Content,
		CreatedAt: m.CreatedAt.UnixMilli(),
		HasImage:  len(m.Attachments) > 0,
		HasLink:   linkRe.MatchString(m.Content),
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := h.Search.Index(ctx, d); err != nil {
			h.logger.Error("arama indeksi güncellenemedi — mesaj aramada çıkmayacak",
				zap.Error(err), zap.Int64("message", m.ID))
		}
	}()
}

// unindexMessage — mesaj silindi → indeksten düş (yoksa silinen mesaj aramada görünmeye devam eder).
func (h *Handler) unindexMessage(id int64) {
	if h.Search == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := h.Search.Delete(ctx, id); err != nil {
			h.logger.Error("arama indeksinden silinemedi — silinen mesaj aramada kalacak",
				zap.Error(err), zap.Int64("message", id))
		}
	}()
}
