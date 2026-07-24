package handlers

import (
	"context"
	"strings"
	"time"

	"github.com/concord/api/internal/repo"
)

// === Mesaj kapıları: doğrulama seviyesi + müstehcen içerik filtresi ===
// guilds.verification_level ve guilds.explicit_content_filter ayarlarının gerçek davranışı.

// assignedRoleCount — üyenin AÇIKÇA atanmış rol sayısı (@everyone hariç).
// Not: Roles.MemberRoleIDs everyone'ı da içerdiği için muafiyet kontrolünde kullanılamaz.
func (h *Handler) assignedRoleCount(ctx context.Context, guildID, uid int64) int {
	var n int
	_ = h.Pool.QueryRow(ctx,
		`SELECT count(*) FROM member_roles WHERE guild_id = $1 AND user_id = $2`, guildID, uid).Scan(&n)
	return n
}

// checkVerificationGate — verification_level'ı uygular. Rolü olan üyeler ve sunucu
// sahibi muaftır (Discord davranışı). Seviyeler:
// 1: e-posta doğrulanmış olmalı
// 2: + hesap en az 5 dakikalık olmalı
// 3: + sunucuya katılalı en az 10 dakika geçmiş olmalı
// 4: + iki adımlı doğrulama (2FA) etkin olmalı (telefon doğrulamasının Concord karşılığı)
func (h *Handler) checkVerificationGate(ctx context.Context, g *repo.Guild, uid int64, roleCount int) (code, msg string) {
	if g.VerificationLevel <= 0 {
		return "", ""
	}
	if g.OwnerID == uid || roleCount > 0 {
		return "", ""
	}
	var emailVerified, totp bool
	var createdAt time.Time
	if err := h.Pool.QueryRow(ctx,
		`SELECT email_verified, totp_enabled, created_at FROM users WHERE id = $1`, uid).
		Scan(&emailVerified, &totp, &createdAt); err != nil {
		return "", ""
	}
	if !emailVerified {
		return "verification_email", "bu sunucuda yazabilmek için e-posta adresini doğrulamalısın (Ayarlar → Profil → Doğrula)"
	}
	if g.VerificationLevel >= 2 && time.Since(createdAt) < 5*time.Minute {
		return "verification_account_age", "hesabın çok yeni — bu sunucuda yazabilmek için hesabının en az 5 dakikalık olması gerekiyor"
	}
	if g.VerificationLevel >= 3 {
		var joinedAt time.Time
		if err := h.Pool.QueryRow(ctx,
			`SELECT joined_at FROM guild_members WHERE guild_id = $1 AND user_id = $2`,
			g.ID, uid).Scan(&joinedAt); err == nil && time.Since(joinedAt) < 10*time.Minute {
			return "verification_member_age", "sunucuya yeni katıldın — yazabilmek için 10 dakika beklemen gerekiyor"
		}
	}
	if g.VerificationLevel >= 4 && !totp {
		return "verification_2fa", "bu sunucuda yazabilmek için iki adımlı doğrulamayı (2FA) etkinleştirmelisin (Ayarlar → Hesap)"
	}
	return "", ""
}

// Müstehcen içerik çekirdek kelime listesi (TR + EN). Token bazlı eşleşme —
// substring değil, "klasik" gibi kelimeler yanlış pozitif vermez.
var explicitWords = map[string]bool{
	// TR
	"amk": true, "aq": true, "sik": true, "sikim": true, "sikeyim": true, "sikerim": true,
	"yarrak": true, "yarak": true, "amcık": true, "amcik": true, "orospu": true, "oç": true,
	"pezevenk": true, "göt": true, "got": true, "taşak": true, "tasak": true, "porno": true,
	"sex": true, "seks": true, "çıplak": true, "ciplak": true, "nude": true, "nudes": true,
	// EN
	"fuck": true, "fucking": true, "shit": true, "bitch": true, "dick": true, "cock": true,
	"pussy": true, "porn": true, "nsfw": true, "hentai": true, "xxx": true, "naked": true,
}

var explicitTokenTrim = ".,!?;:()[]{}\"'`*_~|<>@#%&+-/\\"

// containsExplicit — metni token'lara bölüp listeye bakar.
func containsExplicit(text string) (string, bool) {
	for _, tok := range strings.Fields(strings.ToLower(text)) {
		tok = strings.Trim(tok, explicitTokenTrim)
		if tok != "" && explicitWords[tok] {
			return tok, true
		}
	}
	return "", false
}

// checkExplicitContent — explicit_content_filter'ı uygular. NSFW işaretli kanallar muaftır.
// Seviye 1: yalnızca rolü olmayan üyeler taranır. Seviye 2: herkes (sahip dahil).
func (h *Handler) checkExplicitContent(g *repo.Guild, ch *repo.Channel, uid int64, roleCount int, content string, fileNames []string) (code, msg string) {
	if g.ExplicitContentFilter <= 0 || ch.NSFW {
		return "", ""
	}
	if g.ExplicitContentFilter == 1 && (uid == g.OwnerID || roleCount > 0) {
		return "", ""
	}
	if word, found := containsExplicit(content + " " + strings.Join(fileNames, " ")); found {
		return "explicit_content",
			"mesaj müstehcen içerik filtresine takıldı (\"" + word + "\") — bu tür içerik yalnızca 🔞 işaretli kanallarda paylaşılabilir"
	}
	return "", ""
}
