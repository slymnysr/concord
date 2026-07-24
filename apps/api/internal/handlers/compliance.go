package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"go.uber.org/zap"

	"github.com/concord/api/internal/middleware"
)

// MinAge — asgari yaş. COPPA (ABD) 13'ün altındaki çocuklardan veri toplamayı yasaklar;
// AB'de DSA benzer yükümlülükler getirir. Discord da 13 uygular (bazı ülkelerde daha yüksek —
// ülke bazlı kural gerekirse bu sabit tabloya dönüşür).
const MinAge = 13

// ageOK — doğum tarihinden yaş kapısı. Zaman dilimi hassasiyeti kasıtlı olarak YOK:
// gün sınırındaki bir kullanıcıyı yanlış tarafta bırakmak, yasal riski olmayan bir hata.
func ageOK(birth time.Time, now time.Time) bool {
	yil := now.Year() - birth.Year()
	// Doğum günü bu yıl HENÜZ GELMEDİYSE bir yaş düş — yoksa 12 yıl 11 ay olan biri
	// 13 sayılır ve kapı sızdırır.
	if now.YearDay() < birth.YearDay() {
		yil--
	}
	return yil >= MinAge
}

// RequestDataExport — GDPR Md.15 (erişim hakkı).
//
// ASENKRON: kullanıcı verisi 41 tabloya yayılı; istek süresinde toplamak zaman aşımına uğrar
// ve büyük hesaplarda API'yi bloklar. İstek kaydedilir, arka planda toplanır, hazır olunca
// indirilir.
func (h *Handler) RequestDataExport(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())

	// Zaten bekleyen istek varsa yenisini açma (kötüye kullanım: her istek 41 tablo tarar)
	var mevcut int64
	err := h.Pool.QueryRow(r.Context(), `
        SELECT id FROM data_exports
        WHERE user_id = $1 AND status = 'pending'
        ORDER BY requested_at DESC LIMIT 1
    `, uid).Scan(&mevcut)
	if err == nil {
		// ID STRING: Snowflake 64-bit; JSON sayı olarak dönerse JS Number 53-bit'te
		// yuvarlar ve istemci yanlış id ile indirmeye çalışır (404).
		writeJSON(w, http.StatusOK, map[string]any{"id": strconv.FormatInt(mevcut, 10), "status": "pending"})
		return
	}

	id := h.IDs.Next()
	if _, err := h.Pool.Exec(r.Context(), `
        INSERT INTO data_exports (id, user_id, status) VALUES ($1, $2, 'pending')
    `, id, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "dışa aktarma isteği kaydedilemedi")
		return
	}

	go h.buildExport(id, uid)
	writeJSON(w, http.StatusAccepted, map[string]any{"id": strconv.FormatInt(id, 10), "status": "pending"})
}

// ListDataExports — kullanıcının dışa aktarma istekleri.
func (h *Handler) ListDataExports(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `
        SELECT id, status, requested_at, ready_at, expires_at, COALESCE(error,'')
        FROM data_exports WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 20
    `, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "liste alınamadı")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var status, errMsg string
		var req time.Time
		var ready, exp *time.Time
		if err := rows.Scan(&id, &status, &req, &ready, &exp, &errMsg); err != nil {
			continue
		}
		m := map[string]any{"id": strconv.FormatInt(id, 10), "status": status, "requested_at": req}
		if ready != nil {
			m["ready_at"] = ready
		}
		if exp != nil {
			m["expires_at"] = exp
		}
		if errMsg != "" {
			m["error"] = errMsg
		}
		out = append(out, m)
	}
	writeJSON(w, http.StatusOK, out)
}

// DownloadDataExport — hazır arşivi indir.
func (h *Handler) DownloadDataExport(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	id, err := parseID(r, "exportID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id geçersiz")
		return
	}

	var status string
	var payload []byte
	var exp *time.Time
	// user_id koşulu ŞART: başkasının arşivini indirmek TÜM verisini okumak demek
	err = h.Pool.QueryRow(r.Context(), `
        SELECT status, payload, expires_at FROM data_exports WHERE id = $1 AND user_id = $2
    `, id, uid).Scan(&status, &payload, &exp)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "dışa aktarma yok")
		return
	}
	if status != "ready" {
		writeError(w, http.StatusConflict, "not_ready", "arşiv henüz hazır değil")
		return
	}
	if exp != nil && time.Now().After(*exp) {
		writeError(w, http.StatusGone, "expired", "arşivin süresi doldu, yeni istek oluştur")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="concord-data-export.json"`)
	_, _ = w.Write(payload)
}

// buildExport — arka planda kullanıcı verisini toplar.
//
// KAPSAM: GDPR "kişisel veri" der — kullanıcının KENDİ ürettiği ve kendisine ait olan her şey.
// Başkalarının mesajları DAHİL DEĞİL (onlar başkasının verisi; paylaşılan kanalda bile).
func (h *Handler) buildExport(id, uid int64) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	data := map[string]any{"exported_at": time.Now(), "format": "concord-export-v1"}

	// Her sorgu bağımsız: biri patlarsa diğerleri yine dışa aktarılsın (eksik veri,
	// hiç veri vermemekten iyidir — ama hangi bölümün eksik olduğu görünür).
	kisimlar := map[string]string{
		"profile": `SELECT id::text, username, email, display_name, avatar_color, avatar_url, bio,
		            status, birth_date, created_at FROM users WHERE id = $1`,
		"messages": `SELECT id::text, channel_id::text, content, created_at, edited_at
		             FROM messages WHERE author_id = $1 ORDER BY id`,
		"guild_memberships": `SELECT guild_id::text, nickname, joined_at FROM guild_members WHERE user_id = $1`,
		"friendships":       `SELECT friend_id::text, status, created_at FROM friendships WHERE user_id = $1`,
		"reactions":         `SELECT message_id::text, emoji, created_at FROM message_reactions WHERE user_id = $1`,
		"notes":             `SELECT target_user_id::text, note FROM user_notes WHERE user_id = $1`,
		"keywords":          `SELECT keyword FROM user_keywords WHERE user_id = $1`,
		"connections":       `SELECT type, external_username, verified FROM user_connections WHERE user_id = $1`,
		"reports_filed":     `SELECT target_user_id::text, reason, created_at FROM user_reports WHERE reporter_id = $1`,
	}

	for ad, sorgu := range kisimlar {
		rows, err := h.Pool.Query(ctx, sorgu, uid)
		if err != nil {
			h.logger.Warn("dışa aktarma bölümü alınamadı", zap.String("bölüm", ad), zap.Error(err))
			data[ad] = map[string]string{"error": "alınamadı"}
			continue
		}
		var liste []map[string]any
		flds := rows.FieldDescriptions()
		for rows.Next() {
			vals, err := rows.Values()
			if err != nil {
				continue
			}
			m := map[string]any{}
			for i, f := range flds {
				m[string(f.Name)] = vals[i]
			}
			liste = append(liste, m)
		}
		rows.Close()
		if liste == nil {
			liste = []map[string]any{}
		}
		data[ad] = liste
	}

	payload, err := json.Marshal(data)
	if err != nil {
		h.failExport(ctx, id, err.Error())
		return
	}

	// Arşiv TÜM veriyi taşır → süresiz durmamalı (sızıntı yüzeyi)
	exp := time.Now().Add(7 * 24 * time.Hour)
	if _, err := h.Pool.Exec(ctx, `
        UPDATE data_exports SET status='ready', payload=$2, ready_at=NOW(), expires_at=$3
        WHERE id = $1
    `, id, payload, exp); err != nil {
		h.logger.Error("dışa aktarma kaydedilemedi", zap.Error(err), zap.Int64("export", id))
	}
}

func (h *Handler) failExport(ctx context.Context, id int64, msg string) {
	_, _ = h.Pool.Exec(ctx, `UPDATE data_exports SET status='failed', error=$2 WHERE id=$1`, id, msg)
}
