package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
)

type presignReq struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
}

type presignResp struct {
	UploadURL string `json:"upload_url"`
	PublicURL string `json:"public_url"`
	Key       string `json:"key"`
	Filename  string `json:"filename"`
}

func (h *Handler) PresignUpload(w http.ResponseWriter, r *http.Request) {
	if h.Storage == nil {
		writeError(w, http.StatusServiceUnavailable, "no_storage", "obje deposu yok")
		return
	}
	var req presignReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Filename == "" || req.SizeBytes <= 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "filename + size gerekli")
		return
	}
	const maxSize = 100 * 1024 * 1024 // 100 MB
	if req.SizeBytes > maxSize {
		writeError(w, http.StatusBadRequest, "too_large", "dosya 100MB'tan büyük olamaz")
		return
	}

	uid := middleware.UserIDFrom(r.Context())
	cleanName := sanitizeFilename(req.Filename)
	rb := make([]byte, 8)
	_, _ = rand.Read(rb)
	random := hex.EncodeToString(rb)
	key := makeKey(uid, random, cleanName)

	uploadURL, err := h.Storage.PresignedPut(r.Context(), key, 10*time.Minute)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "imzalı URL üretilemedi")
		return
	}

	writeJSON(w, http.StatusOK, &presignResp{
		UploadURL: uploadURL,
		PublicURL: h.Storage.PublicURL(key),
		Key:       key,
		Filename:  cleanName,
	})
}

func sanitizeFilename(name string) string {
	base := filepath.Base(name)
	// Tehlikeli karakterleri kaldır
	clean := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '.' || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, base)
	if len(clean) > 100 {
		clean = clean[:100]
	}
	if clean == "" {
		clean = "file"
	}
	return clean
}

func makeKey(userID int64, random, name string) string {
	now := time.Now()
	return formatKey(now.Year(), int(now.Month()), now.Day(), userID, random, name)
}

func formatKey(year, month, day int, userID int64, random, name string) string {
	return strings.Join([]string{
		"uploads",
		formatInt(year, 4),
		formatInt(month, 2),
		formatInt(day, 2),
		formatInt64(userID),
		random + "_" + name,
	}, "/")
}

func formatInt(n, width int) string {
	s := ""
	for i := 0; i < width; i++ {
		s = string(rune('0'+(n%10))) + s
		n /= 10
	}
	return s
}

func formatInt64(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf []byte
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}
