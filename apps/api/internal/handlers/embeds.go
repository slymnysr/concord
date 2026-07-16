package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var urlRegex = regexp.MustCompile(`https?://[^\s<>]+`)
var titleRegex = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
var ogTitleRegex = regexp.MustCompile(`(?i)<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']`)
var ogDescRegex = regexp.MustCompile(`(?i)<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']`)
var ogImageRegex = regexp.MustCompile(`(?i)<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']`)
var ogSiteRegex = regexp.MustCompile(`(?i)<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']`)

// parseAndStoreEmbeds — mesaj içindeki URL'leri parse edip OG meta'larını DB'ye yaz
func (h *Handler) parseAndStoreEmbeds(messageID int64, content string) {
	urls := urlRegex.FindAllString(content, 4) // en fazla 4 URL
	if len(urls) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	client := &http.Client{Timeout: 5 * time.Second}
	for _, u := range urls {
		req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Concord-LinkPreview/1.0")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		// İlk 64KB yeterli (OG meta head'de)
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
		resp.Body.Close()
		html := string(body)

		title := firstMatch(ogTitleRegex, html)
		if title == "" {
			title = strings.TrimSpace(firstMatch(titleRegex, html))
		}
		desc := firstMatch(ogDescRegex, html)
		image := firstMatch(ogImageRegex, html)
		siteName := firstMatch(ogSiteRegex, html)

		if title == "" && desc == "" && image == "" {
			continue
		}
		_, _ = h.Pool.Exec(ctx, `
            INSERT INTO message_embeds (id, message_id, url, title, description, image_url, site_name, embed_type)
            VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), 'link')
        `, h.IDs.Next(), messageID, u, title, desc, image, siteName)
	}
	// Embed'ler hazır. Gateway broadcast yapmak için kanal/guild bilgisine ihtiyaç var;
	// mesaj geldiğinde zaten MESSAGE event'i yayıldı. Frontend embed'leri "GET /messages/:id/embeds"
	// veya bir sonraki mesaj çekiminde alacak.
}

// storeRichEmbeds — gönderen tarafından sağlanan zengin embed'leri (renk/alan/footer) kaydeder.
// Her embed JSON payload olarak message_embeds.payload'a embed_type='rich' ile yazılır.
func (h *Handler) storeRichEmbeds(ctx context.Context, messageID int64, embeds []json.RawMessage) {
	if len(embeds) == 0 {
		return
	}
	if len(embeds) > 10 {
		embeds = embeds[:10] // Discord paritesi: mesaj başına en fazla 10 embed
	}
	for _, e := range embeds {
		if len(e) == 0 || string(e) == "null" {
			continue
		}
		// Başlık/açıklamayı fallback için çıkar (eski istemciler payload'ı bilmese de bir şey görsün)
		var meta struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			URL         string `json:"url"`
		}
		_ = json.Unmarshal(e, &meta)
		_, _ = h.Pool.Exec(ctx, `
            INSERT INTO message_embeds (id, message_id, url, title, description, embed_type, payload)
            VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), 'rich', $6)
        `, h.IDs.Next(), messageID, meta.URL, meta.Title, meta.Description, []byte(e))
	}
}

func firstMatch(re *regexp.Regexp, s string) string {
	m := re.FindStringSubmatch(s)
	if len(m) >= 2 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

type embedView struct {
	ID          string          `json:"id"`
	URL         string          `json:"url"`
	Title       *string         `json:"title,omitempty"`
	Description *string         `json:"description,omitempty"`
	ImageURL    *string         `json:"image_url,omitempty"`
	SiteName    *string         `json:"site_name,omitempty"`
	EmbedType   string          `json:"embed_type"`
	Payload     json.RawMessage `json:"payload,omitempty"`
}

// GET /api/v1/messages/:messageID/embeds
func (h *Handler) GetMessageEmbeds(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	rows, err := h.Pool.Query(r.Context(), `
        SELECT id::text, url, title, description, image_url, site_name, embed_type, payload
        FROM message_embeds WHERE message_id = $1 ORDER BY id ASC
    `, messageID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer rows.Close()
	out := []embedView{}
	for rows.Next() {
		var e embedView
		if err := rows.Scan(&e.ID, &e.URL, &e.Title, &e.Description, &e.ImageURL, &e.SiteName, &e.EmbedType, &e.Payload); err == nil {
			out = append(out, e)
		}
	}
	writeJSON(w, http.StatusOK, out)
}
