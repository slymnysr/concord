package handlers

import (
	"errors"
	"net/http"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
)

func (h *Handler) PinMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	m, err := h.Messages.ByID(r.Context(), messageID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "mesaj yok")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), m.ChannelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID == nil {
		// DM: herkes pinleyebilir
		if ok, _ := h.DMs.IsParticipant(r.Context(), ch.ID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
			return
		}
	} else {
		cp, err := h.computeChannelPerms(r.Context(), *ch.GuildID, ch.ID, uid)
		if err != nil || !perms.Has(cp, perms.ManageMessages) {
			writeError(w, http.StatusForbidden, "missing_permission", "ManageMessages gerekli")
			return
		}
	}
	_, err = h.Pool.Exec(r.Context(),
		`INSERT INTO channel_pins (channel_id, message_id, pinned_by) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
		ch.ID, messageID, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "sabitlenmedi")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) UnpinMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := parseID(r, "messageID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id parse")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	m, err := h.Messages.ByID(r.Context(), messageID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "mesaj yok")
		return
	}
	ch, err := h.Channels.ByID(r.Context(), m.ChannelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	if ch.GuildID != nil {
		cp, err := h.computeChannelPerms(r.Context(), *ch.GuildID, ch.ID, uid)
		if err != nil || !perms.Has(cp, perms.ManageMessages) {
			writeError(w, http.StatusForbidden, "missing_permission", "ManageMessages gerekli")
			return
		}
	} else {
		if ok, _ := h.DMs.IsParticipant(r.Context(), ch.ID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "yetersiz")
			return
		}
	}
	tag, err := h.Pool.Exec(r.Context(),
		`DELETE FROM channel_pins WHERE channel_id = $1 AND message_id = $2`, ch.ID, messageID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "kaldırılamadı")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "pin yok")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListPins(w http.ResponseWriter, r *http.Request) {
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
	if ch.GuildID != nil {
		if ok, _ := h.Guilds.IsMember(r.Context(), *ch.GuildID, uid); !ok {
			writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
			return
		}
	} else if ok, _ := h.DMs.IsParticipant(r.Context(), channelID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	rows, err := h.Pool.Query(r.Context(), `
        SELECT m.id, m.channel_id, m.author_id, m.content, m.edited_at, m.created_at
        FROM channel_pins p
        JOIN messages m ON m.id = p.message_id
        WHERE p.channel_id = $1
        ORDER BY p.pinned_at DESC
        LIMIT 50
    `, channelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı")
		return
	}
	defer rows.Close()
	var list []repo.Message
	for rows.Next() {
		var m repo.Message
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &m.EditedAt, &m.CreatedAt); err != nil {
			continue
		}
		list = append(list, m)
	}
	if list == nil {
		list = []repo.Message{}
	}
	writeJSON(w, http.StatusOK, list)
}

var _ = errors.New
