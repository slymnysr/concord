package handlers

import (
	"net/http"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
)

func (h *Handler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	ch, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID == nil {
		writeError(w, http.StatusBadRequest, "invalid", "DM kanalı bu endpoint'le silinemez")
		return
	}
	if !h.requirePerm(r, *ch.GuildID, uid, perms.ManageChannels, w) {
		return
	}
	if _, err := h.Pool.Exec(r.Context(), `DELETE FROM channels WHERE id = $1`, channelID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinmedi")
		return
	}
	h.Events.ToGuild(r.Context(), *ch.GuildID, "CHANNEL_DELETE", map[string]any{
		"channel_id": channelID,
	})
	h.logAudit(r.Context(), *ch.GuildID, uid, &channelID, "channel_delete", "", map[string]string{
		"name": ch.Name,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteGuild(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	g, err := h.Guilds.ByID(r.Context(), guildID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "sunucu yok")
		return
	}
	if g.OwnerID != uid {
		writeError(w, http.StatusForbidden, "forbidden", "sadece sahibi silebilir")
		return
	}
	// Önce üyelere yay
	h.Events.ToGuild(r.Context(), guildID, "GUILD_DELETE", map[string]any{"guild_id": guildID})
	if _, err := h.Pool.Exec(r.Context(), `DELETE FROM guilds WHERE id = $1`, guildID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "silinmedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) LeaveGuild(w http.ResponseWriter, r *http.Request) {
	guildID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	g, err := h.Guilds.ByID(r.Context(), guildID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "sunucu yok")
		return
	}
	if g.OwnerID == uid {
		writeError(w, http.StatusBadRequest, "owner_cant_leave",
			"sunucu sahibi ayrılamaz; önce sahipliği devret veya sunucuyu sil")
		return
	}
	tag, err := h.Pool.Exec(r.Context(),
		`DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2`, guildID, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "ayrılınamadı")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "zaten üye değilsin")
		return
	}
	h.Events.ToGuild(r.Context(), guildID, "GUILD_MEMBER_REMOVE", map[string]any{"user_id": uid})
	w.WriteHeader(http.StatusNoContent)
}
