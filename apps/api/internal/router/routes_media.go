package router

import (
	"github.com/go-chi/chi/v5"

	"github.com/concord/api/internal/handlers"
)

// mountMediaRoutes — medya boru hattı route'ları.
//
// Ayrı dosyada: bunlar KİMLİKSİZ (JWT yok) ve altyapıdan gelir — MinIO bucket-notification'ı
// çağırır, kullanıcı değil. Kimlik paylaşılan secret ile (handlers.MediaEvents). Auth'lu
// grubun içine karışmasınlar diye router.go'nun kullanıcı route'larından ayrı tutulur.
func mountMediaRoutes(r chi.Router, h *handlers.Handler) {
	// MinIO → API. Rate limit'e TAKILMAMALI: toplu yükleme olayları hızlı gelir ve
	// olay kaybı = taranmamış dosya demek. Kimlik zaten secret ile sağlanıyor.
	r.Post("/internal/media/events", h.MediaEvents)
}
