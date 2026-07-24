package search

import (
	"context"
	"os"
	"testing"
	"time"
)

// GERÇEK Meilisearch'e karşı koşar (mock YOK: CJK segmentasyonu, yazım toleransı ve filtre
// dili motorun kendi davranışıdır — mock'lasak kendi varsayımımızı test etmiş olurduk).
// MEILI_ADDR yoksa atlanır.
func meili(t *testing.T) *Meili {
	t.Helper()
	addr := os.Getenv("MEILI_ADDR")
	if addr == "" {
		t.Skip("MEILI_ADDR yok → gerçek Meilisearch'e karşı koşamaz, atlanıyor")
	}
	m := NewMeili(addr, os.Getenv("MEILI_KEY"))
	m.index = "test_messages"
	ctx := context.Background()
	if err := m.Ready(ctx); err != nil {
		t.Fatalf("meilisearch hazır değil: %v", err)
	}
	// Temiz başlangıç
	_ = m.do(ctx, "DELETE", "/indexes/"+m.index, nil, nil)
	time.Sleep(300 * time.Millisecond)
	if err := m.Setup(ctx); err != nil {
		t.Fatalf("setup: %v", err)
	}
	return m
}

func seed(t *testing.T, m *Meili, docs []Doc) {
	t.Helper()
	ctx := context.Background()
	for _, d := range docs {
		if err := m.Index(ctx, d); err != nil {
			t.Fatalf("index: %v", err)
		}
	}
	// Meilisearch indekslemeyi ASENKRON yapar → beklemeden sorgulamak boş sonuç verir
	// (ilk ölçümümde tam bu tuzağa düştüm: "CJK çalışmıyor" sandım, indeks henüz bitmemişti).
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		var st struct {
			IsIndexing bool `json:"isIndexing"`
			N          int  `json:"numberOfDocuments"`
		}
		_ = m.do(ctx, "GET", "/indexes/"+m.index+"/stats", nil, &st)
		if !st.IsIndexing && st.N == len(docs) {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Fatal("indeksleme zaman aşımı")
}

// Postgres FTS'in ÇÖKTÜĞÜ vakalar (docs/DENETIM-GLOBAL.md tablosu). Bu test motorun
// varlık sebebini sabitler: bunlar düşerse Meilisearch'e geçmenin anlamı kalmaz.
func TestMeili_GlobalDiller(t *testing.T) {
	m := meili(t)
	ch := int64(100)
	seed(t, m, []Doc{
		{ID: 1, ChannelID: ch, Content: "メッセージがあります", CreatedAt: 1},
		{ID: 2, ChannelID: ch, Content: "这是一条消息", CreatedAt: 2},
		{ID: 3, ChannelID: ch, Content: "메시지가 있습니다", CreatedAt: 3},
		{ID: 4, ChannelID: ch, Content: "сообщения здесь", CreatedAt: 4},
		{ID: 5, ChannelID: ch, Content: "die Nachrichten sind da", CreatedAt: 5},
		{ID: 6, ChannelID: ch, Content: "yarınki toplantılar uzun", CreatedAt: 6},
		{ID: 7, ChannelID: ch, Content: "running the tests", CreatedAt: 7},
		{ID: 8, ChannelID: ch, Content: "les serveurs sont tombés", CreatedAt: 8},
	})

	cases := []struct {
		ad, q string
		want  int64
	}{
		{"japonca", "メッセージ", 1},
		{"çince", "消息", 2},
		{"korece", "메시지", 3},
		{"rusça (kök bulma)", "сообщение", 4},
		{"almanca (kök bulma)", "Nachricht", 5},
		{"türkçe (kök bulma)", "toplantı", 6},
		{"türkçe (ASCII yazım)", "toplanti", 6},
		{"ingilizce (kök bulma)", "test", 7},
		{"fransızca", "serveur", 8},
		{"yazım hatası toleransı", "toplanit", 6},
	}
	for _, c := range cases {
		t.Run(c.ad, func(t *testing.T) {
			ids, err := m.Search(context.Background(), Query{
				Text: c.q, AllowedChannelIDs: []int64{ch}, Limit: 5,
			})
			if err != nil {
				t.Fatalf("arama: %v", err)
			}
			if len(ids) == 0 || ids[0] != c.want {
				t.Errorf("q=%q → %v, beklenen ilk sonuç %d", c.q, ids, c.want)
			}
		})
	}
}

// Yetki filtresi indekste uygulanmalı: sonradan SQL'le elemek, motorun ilk N sonucu
// yetkisiz kanallardan gelirse BOŞ SAYFA döndürmesine yol açar.
func TestMeili_YetkiFiltresi(t *testing.T) {
	m := meili(t)
	seed(t, m, []Doc{
		{ID: 1, ChannelID: 10, Content: "gizli kanal mesajı", CreatedAt: 1},
		{ID: 2, ChannelID: 20, Content: "açık kanal mesajı", CreatedAt: 2},
	})

	ids, err := m.Search(context.Background(), Query{
		Text: "mesajı", AllowedChannelIDs: []int64{20}, Limit: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 || ids[0] != 2 {
		t.Fatalf("yetkisiz kanal sızdı: %v (yalnızca 2 beklenir)", ids)
	}

	// İzinli kanal listesi BOŞSA hiçbir şey dönmemeli (her şeyi döndürmek felaket olurdu)
	ids, err = m.Search(context.Background(), Query{Text: "mesajı", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 0 {
		t.Fatalf("izinsiz kullanıcıya sonuç döndü: %v", ids)
	}
}

func TestMeili_SilinenBelgeAramadaCikmaz(t *testing.T) {
	m := meili(t)
	ch := int64(1)
	seed(t, m, []Doc{{ID: 1, ChannelID: ch, Content: "silinecek mesaj", CreatedAt: 1}})

	if err := m.Delete(context.Background(), 1); err != nil {
		t.Fatal(err)
	}
	time.Sleep(1500 * time.Millisecond)

	ids, _ := m.Search(context.Background(), Query{Text: "silinecek", AllowedChannelIDs: []int64{ch}, Limit: 5})
	if len(ids) != 0 {
		t.Fatalf("silinen mesaj hâlâ aramada: %v", ids)
	}
}

func TestMeili_SortRecent(t *testing.T) {
	m := meili(t)
	ch := int64(1)
	seed(t, m, []Doc{
		{ID: 1, ChannelID: ch, Content: "toplantı toplantı toplantı en alakalı", CreatedAt: 100},
		{ID: 2, ChannelID: ch, Content: "yarınki toplantı", CreatedAt: 200},
	})
	ctx := context.Background()

	// Alaka (varsayılan): 3 kez geçen ÖNDE
	ids, _ := m.Search(ctx, Query{Text: "toplantı", AllowedChannelIDs: []int64{ch}, Limit: 5})
	if len(ids) == 0 || ids[0] != 1 {
		t.Errorf("alaka sıralaması: %v, ilk 1 beklenir", ids)
	}
	// Kronolojik: en YENİ önde
	ids, _ = m.Search(ctx, Query{Text: "toplantı", AllowedChannelIDs: []int64{ch}, Limit: 5, SortRecent: true})
	if len(ids) == 0 || ids[0] != 2 {
		t.Errorf("sort=recent: %v, ilk 2 beklenir", ids)
	}
}
