package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
)

// Mention pattern'leri
//
//	@kullaniciadi            → username (kullanıcı)
//	<@123456789>             → user_id direkt
//	<@&123456789>            → role_id (rol mention)
//	@everyone                → tüm üyeler (MENTION_EVERYONE perm gerekli)
//	@here                    → sadece online üyeler (MENTION_EVERYONE perm gerekli)
var (
	mentionUserRegex     = regexp.MustCompile(`@([a-z0-9_.]{3,32})`)
	mentionUserIDRegex   = regexp.MustCompile(`<@(\d{10,21})>`)
	mentionRoleIDRegex   = regexp.MustCompile(`<@&(\d{10,21})>`)
	mentionEveryoneRegex = regexp.MustCompile(`(?:^|\s)@everyone(?:\s|$)`)
	mentionHereRegex     = regexp.MustCompile(`(?:^|\s)@here(?:\s|$)`)
)

// parseAndPersistMentions — kullanıcı + rol + everyone/here bahsetmelerini ayıklar.
// İzin gerektiren bahsetmeleri (everyone, role[mentionable=false]) kontrol eder.
// Bildirim oluşturur ve gateway'e yayar.
func (h *Handler) parseAndPersistMentions(ctx context.Context, ch *repo.Channel, m *repo.Message, replyAuthor *int64) []int64 {
	content := m.Content
	mentionedUsers := map[int64]bool{}

	// Yanıt verilen mesajın yazarını pingle (Discord davranışı)
	if replyAuthor != nil && *replyAuthor != m.AuthorID {
		mentionedUsers[*replyAuthor] = true
	}

	// 1) Username mention'ları
	if matches := mentionUserRegex.FindAllStringSubmatch(content, -1); len(matches) > 0 {
		usernames := map[string]bool{}
		for _, mm := range matches {
			if len(mm) > 1 {
				usernames[strings.ToLower(mm[1])] = true
			}
		}
		list := make([]string, 0, len(usernames))
		for u := range usernames {
			list = append(list, u)
		}
		if len(list) > 0 {
			rows, _ := h.Pool.Query(ctx, `SELECT id FROM users WHERE lower(username) = ANY($1)`, list)
			if rows != nil {
				for rows.Next() {
					var uid int64
					if err := rows.Scan(&uid); err == nil && uid != m.AuthorID {
						mentionedUsers[uid] = true
					}
				}
				rows.Close()
			}
		}
	}

	// 2) Direct user ID mention <@123>
	if matches := mentionUserIDRegex.FindAllStringSubmatch(content, -1); len(matches) > 0 {
		var ids []int64
		for _, mm := range matches {
			if len(mm) > 1 {
				if id, err := strconv.ParseInt(mm[1], 10, 64); err == nil && id != m.AuthorID {
					ids = append(ids, id)
				}
			}
		}
		if len(ids) > 0 {
			// Sadece sunucu üyesi olanları al
			if ch.GuildID != nil {
				rows, _ := h.Pool.Query(ctx,
					`SELECT user_id FROM guild_members WHERE guild_id = $1 AND user_id = ANY($2)`,
					*ch.GuildID, ids)
				if rows != nil {
					for rows.Next() {
						var uid int64
						if err := rows.Scan(&uid); err == nil {
							mentionedUsers[uid] = true
						}
					}
					rows.Close()
				}
			} else {
				// DM — sadece kanalın katılımcıları
				rows, _ := h.Pool.Query(ctx,
					`SELECT user_id FROM dm_participants WHERE channel_id = $1 AND user_id = ANY($2)`,
					ch.ID, ids)
				if rows != nil {
					for rows.Next() {
						var uid int64
						if err := rows.Scan(&uid); err == nil {
							mentionedUsers[uid] = true
						}
					}
					rows.Close()
				}
			}
		}
	}

	// 3) Role mention <@&123> — sadece guild
	if ch.GuildID != nil {
		if matches := mentionRoleIDRegex.FindAllStringSubmatch(content, -1); len(matches) > 0 {
			var roleIDs []int64
			for _, mm := range matches {
				if len(mm) > 1 {
					if id, err := strconv.ParseInt(mm[1], 10, 64); err == nil {
						roleIDs = append(roleIDs, id)
					}
				}
			}
			if len(roleIDs) > 0 {
				// Rollerin mentionable olduğunu veya yazar'ın MentionEveryone iznine sahip olduğunu kontrol et
				authorPerms, _ := h.Roles.MemberPermissions(ctx, *ch.GuildID, m.AuthorID)
				canMentionAny := perms.Has(authorPerms, perms.MentionEveryone)

				// Rol bilgilerini al
				rows, _ := h.Pool.Query(ctx,
					`SELECT id, mentionable FROM roles WHERE id = ANY($1) AND guild_id = $2`,
					roleIDs, *ch.GuildID)
				validRoles := []int64{}
				if rows != nil {
					for rows.Next() {
						var rid int64
						var mentionable bool
						if err := rows.Scan(&rid, &mentionable); err == nil {
							if mentionable || canMentionAny {
								validRoles = append(validRoles, rid)
							}
						}
					}
					rows.Close()
				}

				// Rol → üye listesini al
				if len(validRoles) > 0 {
					memberRows, _ := h.Pool.Query(ctx, `
                        SELECT DISTINCT user_id FROM member_roles
                        WHERE guild_id = $1 AND role_id = ANY($2)
                    `, *ch.GuildID, validRoles)
					if memberRows != nil {
						for memberRows.Next() {
							var uid int64
							if err := memberRows.Scan(&uid); err == nil && uid != m.AuthorID {
								mentionedUsers[uid] = true
							}
						}
						memberRows.Close()
					}
				}
			}
		}
	}

	// 4) @everyone / @here — sadece guild, MENTION_EVERYONE izni gerekli
	everyoneHit := mentionEveryoneRegex.MatchString(" " + content + " ")
	hereHit := mentionHereRegex.MatchString(" " + content + " ")
	if (everyoneHit || hereHit) && ch.GuildID != nil {
		authorPerms, _ := h.Roles.MemberPermissions(ctx, *ch.GuildID, m.AuthorID)
		if perms.Has(authorPerms, perms.MentionEveryone) {
			// Mesajda mention_everyone flag'i set et
			_, _ = h.Pool.Exec(ctx, `UPDATE messages SET mention_everyone = TRUE WHERE id = $1`, m.ID)

			var q string
			if hereHit && !everyoneHit {
				// @here → sadece presence'a göre online olanlar; basitleştirme: status != 'offline'
				q = `SELECT user_id FROM guild_members WHERE guild_id = $1`
				// Not: Gerçek "online" presence ayrı gelmeli; şimdilik tüm üyelere yayıyoruz
			} else {
				q = `SELECT user_id FROM guild_members WHERE guild_id = $1`
			}
			rows, _ := h.Pool.Query(ctx, q, *ch.GuildID)
			if rows != nil {
				for rows.Next() {
					var uid int64
					if err := rows.Scan(&uid); err == nil && uid != m.AuthorID {
						mentionedUsers[uid] = true
					}
				}
				rows.Close()
			}
		}
	}

	if len(mentionedUsers) == 0 {
		return nil
	}

	userIDs := make([]int64, 0, len(mentionedUsers))
	for id := range mentionedUsers {
		userIDs = append(userIDs, id)
	}

	_ = h.Mentions.Add(ctx, m.ID, userIDs)

	// Bildirim oluştur ve user kanalına yay
	for _, uid := range userIDs {
		n := &repo.Notification{
			ID:        h.IDs.Next(),
			UserID:    uid,
			Type:      "mention",
			ChannelID: &m.ChannelID,
			MessageID: &m.ID,
			ActorID:   &m.AuthorID,
		}
		if ch.GuildID != nil {
			n.GuildID = ch.GuildID
		}
		_ = h.Notifications.Create(ctx, n)
		// Push: kullanıcı uygulamayı KAPALIYKEN de haberdar olmalı — WS olayı yalnızca
		// açık istemciye ulaşır. Bu bağlanmadan önce abonelikler kaydedilip hiç
		// kullanılmıyordu (izin istenir, token yazılır, bildirim asla gitmez).
		h.pushForNotification(n, h.actorName(ctx, m.AuthorID), pushPreview(m.Content))
		if h.Redis != nil {
			payload, _ := json.Marshal(map[string]any{
				"type":         "NOTIFICATION",
				"notification": n,
				"ts":           time.Now().UnixMilli(),
			})
			_, _ = h.Redis.Publish(ctx, "concord:user:"+strconv.FormatInt(uid, 10), payload).Result()
		}
	}
	return userIDs
}

// === Notifications endpoints ===

func (h *Handler) ListNotifications(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	list, err := h.Notifications.ListEnriched(r.Context(), uid, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "bildirimler alınamadı")
		return
	}
	if list == nil {
		list = []repo.EnrichedNotification{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) NotificationsCount(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	n, err := h.Notifications.Unread(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "sayım hatası")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"unread": n})
}

func (h *Handler) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	if err := h.Notifications.MarkAllRead(r.Context(), uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "okundu işareti hatası")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
