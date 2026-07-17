package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Meili — Meilisearch sürücüsü. HTTP ile konuşur (resmi Go istemcisi ek bağımlılık;
// ihtiyacımız olan yüzey küçük: search + documents + settings).
type Meili struct {
	addr   string
	key    string
	index  string
	client *http.Client
}

func NewMeili(addr, key string) *Meili {
	return &Meili{
		addr:   strings.TrimRight(addr, "/"),
		key:    key,
		index:  "messages",
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (m *Meili) Name() string { return "meilisearch" }

func (m *Meili) Ready(ctx context.Context) error {
	var out struct {
		Status string `json:"status"`
	}
	if err := m.do(ctx, http.MethodGet, "/health", nil, &out); err != nil {
		return err
	}
	if out.Status != "available" {
		return fmt.Errorf("meilisearch hazır değil: %s", out.Status)
	}
	return nil
}

// Setup — indeksi ve ayarları oluşturur. Açılışta çağrılır; idempotent.
func (m *Meili) Setup(ctx context.Context) error {
	// İndeks (varsa 'index_already_exists' döner — hata değil)
	_ = m.do(ctx, http.MethodPost, "/indexes",
		map[string]any{"uid": m.index, "primaryKey": "id"}, nil)

	// filterableAttributes ŞART: bunlar tanımlı değilse filtre sorguları HATA verir,
	// yetki filtresi (channel_id) uygulanamaz ve arama ya patlar ya da her şeyi döndürür.
	settings := map[string]any{
		"filterableAttributes": []string{
			"channel_id", "guild_id", "author_id", "created_at", "has_image", "has_link", "pinned",
		},
		"sortableAttributes":   []string{"created_at"},
		"searchableAttributes": []string{"content"},
		// SIRA ÖNEMLİ. "sort" EN BAŞTA: kullanıcı açıkça sort=recent dediğinde kronolojik
		// sıra KESİN olmalı. Varsayılan sırada ("words","typo","proximity","attribute","sort",…)
		// `attribute` kuralı — terimin metindeki KONUMU — sort'tan önce geldiği için
		// sort=recent sessizce alaka sırası döndürüyordu (ölçüldü: [1 2], beklenen [2 1]).
		// Sort verilmediğinde bu kural no-op'tur → alaka sıralaması bozulmaz.
		// Son sıradaki created_at:desc: eşit alakada yeni mesaj öne (sohbette yeni daha yararlı).
		"rankingRules": []string{"sort", "words", "typo", "proximity", "attribute", "exactness", "created_at:desc"},
	}
	return m.do(ctx, http.MethodPatch, "/indexes/"+m.index+"/settings", settings, nil)
}

func (m *Meili) Index(ctx context.Context, d Doc) error {
	return m.IndexBatch(ctx, []Doc{d})
}

// IndexBatch — toplu upsert (backfill). Mesaj başına bir HTTP isteği milyonlarca mesajda
// saatler sürerdi; Meilisearch toplu gövde kabul eder.
func (m *Meili) IndexBatch(ctx context.Context, docs []Doc) error {
	if len(docs) == 0 {
		return nil
	}
	return m.do(ctx, http.MethodPut, "/indexes/"+m.index+"/documents", docs, nil)
}

func (m *Meili) Delete(ctx context.Context, id int64) error {
	return m.do(ctx, http.MethodDelete,
		"/indexes/"+m.index+"/documents/"+strconv.FormatInt(id, 10), nil, nil)
}

func (m *Meili) Search(ctx context.Context, q Query) ([]int64, error) {
	// Yetkisiz kullanıcıya HER ŞEYİ döndürmektense hiçbir şey döndür
	if len(q.AllowedChannelIDs) == 0 {
		return nil, nil
	}

	body := map[string]any{
		"q":                    q.Text,
		"limit":                q.Limit,
		"attributesToRetrieve": []string{"id"},
		"filter":               m.filter(q),
	}
	if q.SortRecent {
		body["sort"] = []string{"created_at:desc"}
	}

	var out struct {
		Hits []struct {
			ID string `json:"id"`
		} `json:"hits"`
	}
	if err := m.do(ctx, http.MethodPost, "/indexes/"+m.index+"/search", body, &out); err != nil {
		return nil, err
	}

	ids := make([]int64, 0, len(out.Hits))
	for _, h := range out.Hits {
		if id, err := strconv.ParseInt(h.ID, 10, 64); err == nil {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

// filter — Meilisearch filtre ifadesi. Yetki (izinli kanallar) HER ZAMAN uygulanır.
func (m *Meili) filter(q Query) []any {
	f := []any{}

	// İzinli kanallar: OR listesi tek bir string olarak (dizi elemanları AND'lenir)
	perms := make([]string, len(q.AllowedChannelIDs))
	for i, c := range q.AllowedChannelIDs {
		perms[i] = "channel_id = " + strconv.FormatInt(c, 10)
	}
	f = append(f, "("+strings.Join(perms, " OR ")+")")

	if q.ChannelID != nil {
		f = append(f, "channel_id = "+strconv.FormatInt(*q.ChannelID, 10))
	}
	if q.GuildID != nil {
		f = append(f, "guild_id = "+strconv.FormatInt(*q.GuildID, 10))
	}
	if q.AuthorID != nil {
		f = append(f, "author_id = "+strconv.FormatInt(*q.AuthorID, 10))
	}
	if q.After != nil {
		f = append(f, "created_at >= "+strconv.FormatInt(q.After.UnixMilli(), 10))
	}
	if q.Before != nil {
		f = append(f, "created_at < "+strconv.FormatInt(q.Before.UnixMilli(), 10))
	}
	if q.Pinned != nil {
		f = append(f, "pinned = "+strconv.FormatBool(*q.Pinned))
	}
	if q.HasImage {
		f = append(f, "has_image = true")
	}
	if q.HasLink {
		f = append(f, "has_link = true")
	}
	return f
}

func (m *Meili) do(ctx context.Context, method, path string, in, out any) error {
	var body *bytes.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	} else {
		body = bytes.NewReader(nil)
	}

	req, err := http.NewRequestWithContext(ctx, method, m.addr+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if m.key != "" {
		req.Header.Set("Authorization", "Bearer "+m.key)
	}

	res, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode >= 300 {
		var e struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		_ = json.NewDecoder(res.Body).Decode(&e)
		// İndeks zaten varsa hata değil (Setup idempotent olmalı)
		if e.Code == "index_already_exists" {
			return nil
		}
		return fmt.Errorf("meili %s %s → %d %s: %s", method, path, res.StatusCode, e.Code, e.Message)
	}
	if out != nil {
		return json.NewDecoder(res.Body).Decode(out)
	}
	return nil
}
