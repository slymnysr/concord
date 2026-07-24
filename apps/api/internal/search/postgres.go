package search

import (
	"context"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres — FTS yedek sürücüsü.
//
// SINIRLARI (ölçüldü, docs/DENETIM-GLOBAL.md): CJK'yı kelimelere AYIRAMAZ (Japonca/Çince
// cümle tek token olur → o dillerde arama ÇALIŞMAZ), Rusça kök bulmaz, turkish config
// Almanca'yı bozar. Bu yüzden BİRİNCİL motor değil.
//
// NEDEN YİNE DE VAR: Meilisearch yapılandırılmamışsa (yerel geliştirme) veya geçici olarak
// erişilemezse arama tamamen ölmesin. Düşüş SESSİZ DEĞİL: Name() farklı döner ve
// /health hangi motorun aktif olduğunu raporlar.
type Postgres struct{ pool *pgxpool.Pool }

func NewPostgres(p *pgxpool.Pool) *Postgres { return &Postgres{pool: p} }

func (p *Postgres) Name() string                  { return "postgres-fts" }
func (p *Postgres) Ready(_ context.Context) error { return nil }

// İndeks Postgres'te GENERATED kolon (search_vector) → yazma/silme senkronu gerekmez.
func (p *Postgres) Index(_ context.Context, _ Doc) error    { return nil }
func (p *Postgres) Delete(_ context.Context, _ int64) error { return nil }

func (p *Postgres) Search(ctx context.Context, q Query) ([]int64, error) {
	if len(q.AllowedChannelIDs) == 0 {
		return nil, nil
	}

	var where []string
	var args []any

	args = append(args, q.AllowedChannelIDs)
	where = append(where, "m.channel_id = ANY($1)")

	tsq := ""
	if q.Text != "" {
		args = append(args, q.Text)
		n := strconv.Itoa(len(args))
		// İndeksle AYNI dönüşüm (migrations/0056): concord_unaccent + turkish||english
		tsq = "(plainto_tsquery('turkish', concord_unaccent($" + n + ")) || " +
			"plainto_tsquery('english', concord_unaccent($" + n + ")))"
		where = append(where, "m.search_vector @@ "+tsq)
	}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, cond+"$"+strconv.Itoa(len(args)))
	}
	if q.ChannelID != nil {
		add("m.channel_id = ", *q.ChannelID)
	}
	if q.AuthorID != nil {
		add("m.author_id = ", *q.AuthorID)
	}
	if q.After != nil {
		add("m.created_at >= ", *q.After)
	}
	if q.Before != nil {
		add("m.created_at < ", *q.Before)
	}

	order := "m.id DESC"
	if tsq != "" && !q.SortRecent {
		order = "ts_rank(m.search_vector, " + tsq + ") DESC, m.id DESC"
	}

	args = append(args, q.Limit)
	rows, err := p.pool.Query(ctx, `
        SELECT m.id FROM messages m
        WHERE `+strings.Join(where, " AND ")+`
        ORDER BY `+order+`
        LIMIT $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
