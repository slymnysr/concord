// Mesaj arama motoru soyutlaması.
//
// NEDEN İKİ SÜRÜCÜ: Postgres FTS global bir üründe YETMİYOR (ölçüldü, docs/DENETIM-GLOBAL.md):
// CJK'yı kelimelere ayıramıyor (Japonca/Çince cümle TEK TOKEN olarak indekslenir → arama hiç
// çalışmaz), dil başına tek config seçmek zorunda (turkish config Almanca'yı bozuyor), Rusça
// kök bulma yok. Meilisearch aynı vakaların hepsini geçiyor + yazım toleransı.
//
// Postgres sürücüsü YİNE DE duruyor: Meilisearch yapılandırılmamış/erişilemez olduğunda arama
// tamamen ölmesin. Ama bu sessiz bir düşüş DEĞİL — Driver.Name() ile hangi motorun cevap
// verdiği görünür ve sağlık ucunda raporlanır.
package search

import (
	"context"
	"time"
)

// Doc — indekslenen mesaj. Yetki filtresi indekste TUTULUR (channel_id): arama sonuçlarını
// sonradan SQL ile filtrelemek, motorun ilk N sonucu yetkisiz kanallardan gelirse boş sayfa
// döndürmesine yol açardı.
type Doc struct {
	ID        int64  `json:"id,string"`
	ChannelID int64  `json:"channel_id,string"`
	GuildID   *int64 `json:"guild_id,string,omitempty"`
	AuthorID  int64  `json:"author_id,string"`
	Content   string `json:"content"`
	// Unix MİLİSANİYE — motorda sıralama/filtreleme için (RFC3339 string sıralanamaz).
	// SANİYE hassasiyeti YETMİYOR: sohbette mesajlar salkım halinde gelir, aynı saniyedeki
	// mesajlar ayırt edilemeyip sort=recent rastgele sıralanıyordu (ölçüldü).
	// Snowflake ID kullanılamaz: Meilisearch sayıları f64 tutar, 64-bit ID hassasiyet kaybeder.
	CreatedAt int64 `json:"created_at"`
	HasImage  bool  `json:"has_image"`
	HasLink   bool  `json:"has_link"`
	Pinned    bool  `json:"pinned"`
}

// Query — arama isteği. Yetki (izinli kanal listesi) ÇAĞIRANIN sorumluluğu.
type Query struct {
	Text string
	// AllowedChannelIDs — kullanıcının okuyabildiği kanallar. BOŞ ise sonuç yok
	// (üyeliği olmayan kullanıcıya her şeyi döndürmektense hiçbir şey döndür).
	AllowedChannelIDs []int64
	ChannelID         *int64
	GuildID           *int64
	AuthorID          *int64
	Before            *time.Time
	After             *time.Time
	Pinned            *bool
	HasImage          bool
	HasLink           bool
	Limit             int
	// SortRecent — true ise kronolojik; false ise alaka (varsayılan)
	SortRecent bool
}

// Driver — arama motoru sözleşmesi.
type Driver interface {
	// Name — hangi motor cevap veriyor (gözlemlenebilirlik; sessiz düşüş olmasın)
	Name() string
	// Search — eşleşen mesaj ID'leri, motorun sıraladığı SIRAYLA.
	// ID döndürür, tam belge değil: yetki/silinme durumu DB'de tazedir, indekste bayat olabilir.
	Search(ctx context.Context, q Query) ([]int64, error)
	// Index — mesaj oluşturuldu/düzenlendi (upsert)
	Index(ctx context.Context, d Doc) error
	// Delete — mesaj silindi
	Delete(ctx context.Context, id int64) error
	// Ready — motor kullanılabilir mi
	Ready(ctx context.Context) error
}
