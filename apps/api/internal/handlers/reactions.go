package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
	"github.com/go-chi/chi/v5"
)

func (h *Handler) AddReaction(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message id parse")
		return
	}
	emoji, err := url.PathUnescape(chi.URLParam(r, "emoji"))
	if err != nil || emoji == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "emoji geçersiz")
		return
	}
	uid := middleware.UserIDFrom(r.Context())

	// Mesaj + kanal erişimi
	ok, ch, _ := h.canReadMessage(r, messageID, uid)
	if !ok || ch == nil {
		writeError(w, http.StatusForbidden, "forbidden", "bu mesaja tepki veremezsin")
		return
	}
	// Zaman aşımı (timeout) yaptırımı — süresi dolana kadar tepki eklenemez
	if ch.GuildID != nil {
		if until, terr := h.Moderation.ActiveTimeout(r.Context(), *ch.GuildID, uid); terr == nil && until != nil {
			writeError(w, http.StatusForbidden, "communication_disabled",
				"zaman aşımı uygulandı — "+until.Format(time.RFC3339)+" tarihine kadar tepki ekleyemezsin")
			return
		}
	}
	if err := h.Reactions.Add(r.Context(), messageID, uid, emoji); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "tepki eklenemedi")
		return
	}
	h.publishReaction(r.Context(), ch, messageID, uid, emoji, "REACTION_ADD")
	if ch.GuildID != nil {
		h.applyReactionRoles(r.Context(), *ch.GuildID, uid, messageID, emoji, true)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message id parse")
		return
	}
	emoji, err := url.PathUnescape(chi.URLParam(r, "emoji"))
	if err != nil || emoji == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "emoji geçersiz")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ok, ch, _ := h.canReadMessage(r, messageID, uid)
	if !ok || ch == nil {
		writeError(w, http.StatusForbidden, "forbidden", "yetersiz")
		return
	}
	if err := h.Reactions.Remove(r.Context(), messageID, uid, emoji); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "tepki kaldırılamadı")
		return
	}
	h.publishReaction(r.Context(), ch, messageID, uid, emoji, "REACTION_REMOVE")
	if ch.GuildID != nil {
		h.applyReactionRoles(r.Context(), *ch.GuildID, uid, messageID, emoji, false)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListReactions(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ok, _, _ := h.canReadMessage(r, messageID, uid)
	if !ok {
		writeError(w, http.StatusForbidden, "forbidden", "yetersiz")
		return
	}
	list, err := h.Reactions.ForMessage(r.Context(), messageID, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "tepkiler alınamadı")
		return
	}
	if list == nil {
		list = []repo.ReactionSummary{}
	}
	writeJSON(w, http.StatusOK, list)
}

// canReadMessage — mesajın bulunduğu kanalı okuma yetkisi
func (h *Handler) canReadMessage(r *http.Request, messageID, userID int64) (bool, *repo.Channel, *repo.Message) {
	// Mesajı önce bul
	var channelID int64
	if err := h.Pool.QueryRow(r.Context(),
		`SELECT channel_id FROM messages WHERE id = $1`, messageID).Scan(&channelID); err != nil {
		return false, nil, nil
	}
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		return false, nil, nil
	}
	if ch.GuildID != nil {
		if ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, userID); !ok {
			return false, nil, nil
		}
		chanPerms, err := h.computeChannelPerms(r.Context(), *ch.GuildID, ch.ID, userID)
		if err != nil || !perms.Has(chanPerms, perms.ViewChannel) {
			return false, nil, nil
		}
	} else {
		if ok, _ := h.DMs.IsParticipant(r.Context(), ch.ID, userID); !ok {
			return false, nil, nil
		}
	}
	return true, ch, nil
}

func (h *Handler) publishReaction(ctx context.Context, ch *repo.Channel, messageID, userID int64, emoji, eventType string) {
	if h.Redis == nil {
		return
	}
	base := map[string]any{
		"type":       eventType,
		"channel_id": strconv.FormatInt(ch.ID, 10),
		"message_id": strconv.FormatInt(messageID, 10),
		"user_id":    strconv.FormatInt(userID, 10),
		"emoji":      emoji,
		"ts":         time.Now().UnixMilli(),
	}
	if ch.GuildID != nil {
		base["guild_id"] = strconv.FormatInt(*ch.GuildID, 10)
		payload, _ := json.Marshal(base)
		h.Redis.Publish(ctx, "concord:guild:"+strconv.FormatInt(*ch.GuildID, 10), payload)
	} else {
		payload, _ := json.Marshal(base)
		rows, err := h.Pool.Query(ctx, `SELECT user_id FROM dm_participants WHERE channel_id = $1`, ch.ID)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var uid int64
			if err := rows.Scan(&uid); err == nil {
				h.Redis.Publish(ctx, "concord:user:"+strconv.FormatInt(uid, 10), payload)
			}
		}
	}
}

// GET /messages/{messageID}/reactions/{emoji}/users — bir emojiye kim tepki verdi
func (h *Handler) ListReactionUsers(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "message id")
		return
	}
	emoji, err := url.PathUnescape(chi.URLParam(r, "emoji"))
	if err != nil || emoji == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "emoji")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ok, _, _ := h.canReadMessage(r, messageID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "yetersiz")
		return
	}
	rows, err := h.Pool.Query(r.Context(), `
        SELECT u.id::text, u.display_name, u.avatar_color
        FROM message_reactions mr JOIN users u ON u.id = mr.user_id
        WHERE mr.message_id = $1 AND mr.emoji = $2
        ORDER BY u.display_name LIMIT 50
    `, messageID, emoji)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer rows.Close()
	type ru struct {
		ID          string `json:"id"`
		DisplayName string `json:"display_name"`
		AvatarColor string `json:"avatar_color"`
	}
	out := []ru{}
	for rows.Next() {
		var u ru
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.AvatarColor); err == nil {
			out = append(out, u)
		}
	}
	writeJSON(w, http.StatusOK, out)
}
