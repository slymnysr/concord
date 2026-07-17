// Arama indeksi backfill — mevcut mesajları Meilisearch'e yazar.
//
// NE ZAMAN GEREKLİ: Meilisearch ilk kez devreye alınırken (indeks boş) veya indeks
// kaybolduğunda (StatefulSet volume'ü yeniden yaratıldı). Senkron (handlers/search_sync.go)
// yalnızca BUNDAN SONRAKİ yazmaları taşır; eski mesajlar backfill olmadan aramada HİÇ ÇIKMAZ.
//
// Kullanım: MEILI_ADDR=... MEILI_KEY=... POSTGRES_DSN=... go run ./cmd/reindex
package main

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/concord/api/internal/config"
	"github.com/concord/api/internal/search"
)

var linkRe = regexp.MustCompile(`https?://`)

func main() {
	cfg := config.Load()
	if cfg.MeiliAddr == "" {
		fmt.Fprintln(os.Stderr, "MEILI_ADDR gerekli")
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.PostgresDSN)
	if err != nil {
		fmt.Fprintln(os.Stderr, "postgres:", err)
		os.Exit(1)
	}
	defer pool.Close()

	m := search.NewMeili(cfg.MeiliAddr, cfg.MeiliKey)
	if err := m.Ready(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "meilisearch:", err)
		os.Exit(1)
	}
	if err := m.Setup(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "setup:", err)
		os.Exit(1)
	}

	// Sayfalı: milyonlarca mesajı tek sorguda belleğe almak OOM demek.
	// Snowflake ID'ler zamana göre artar → id > cursor sayfalaması hem hızlı hem kararlı.
	const page = 1000
	var cursor int64
	var total int
	start := time.Now()

	for {
		rows, err := pool.Query(ctx, `
            SELECT m.id, m.channel_id, c.guild_id, m.author_id, m.content, m.created_at,
                   EXISTS(SELECT 1 FROM attachments a WHERE a.message_id = m.id)
            FROM messages m JOIN channels c ON c.id = m.channel_id
            WHERE m.id > $1 ORDER BY m.id LIMIT $2`, cursor, page)
		if err != nil {
			fmt.Fprintln(os.Stderr, "sorgu:", err)
			os.Exit(1)
		}

		var batch []search.Doc
		for rows.Next() {
			var d search.Doc
			var created time.Time
			if err := rows.Scan(&d.ID, &d.ChannelID, &d.GuildID, &d.AuthorID, &d.Content, &created, &d.HasImage); err != nil {
				rows.Close()
				fmt.Fprintln(os.Stderr, "scan:", err)
				os.Exit(1)
			}
			d.CreatedAt = created.UnixMilli()
			d.HasLink = linkRe.MatchString(d.Content)
			batch = append(batch, d)
			cursor = d.ID
		}
		rows.Close()

		if len(batch) == 0 {
			break
		}
		if err := m.IndexBatch(ctx, batch); err != nil {
			fmt.Fprintln(os.Stderr, "index:", err)
			os.Exit(1)
		}
		total += len(batch)
		fmt.Printf("\r%d mesaj indekslendi…", total)
	}
	fmt.Printf("\r✓ %d mesaj indekslendi (%s)\n", total, time.Since(start).Round(time.Millisecond))
}
