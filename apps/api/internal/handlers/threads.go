package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/concord/api/internal/middleware"
	"github.com/concord/api/internal/perms"
	"github.com/concord/api/internal/repo"
)

type createThreadReq struct {
	Name               string   `json:"name"`
	Type               string   `json:"type"` // public_thread | private_thread
	AutoArchiveMinutes int32    `json:"auto_archive_minutes,omitempty"`
	StarterMessageID   string   `json:"starter_message_id,omitempty"`
	Invitable          *bool    `json:"invitable,omitempty"`
	TagIDs             []string `json:"tag_ids,omitempty"` // forum etiketleri
}

func (h *Handler) CreateThread(w http.ResponseWriter, r *http.Request) {
	parentID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "channel id")
		return
	}
	parent, err := h.Channels.ByID(r.Context(), parentID)
	if err != nil || parent.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok veya DM'den thread açılamaz")
		return
	}
	uid := middleware.UserIDFrom(r.Context())

	var req createThreadReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 100 {
		writeError(w, http.StatusBadRequest, "invalid_name", "thread adı 1-100 karakter")
		return
	}
	if req.Type == "" {
		req.Type = "public_thread"
	}
	if req.Type != "public_thread" && req.Type != "private_thread" {
		writeError(w, http.StatusBadRequest, "invalid_type", "public_thread veya private_thread")
		return
	}
	requiredPerm := perms.CreatePublicThreads
	if req.Type == "private_thread" {
		requiredPerm = perms.CreatePrivateThreads
	}
	chanPerms, err := h.computeChannelPerms(r.Context(), *parent.GuildID, parentID, uid)
	if err != nil || !perms.Has(chanPerms, requiredPerm) {
		writeError(w, http.StatusForbidden, "missing_permission", "thread oluşturma izni yok")
		return
	}
	if req.AutoArchiveMinutes == 0 {
		req.AutoArchiveMinutes = 1440 // 24h default
	}
	switch req.AutoArchiveMinutes {
	case 60, 1440, 4320, 10080: // 1h, 1d, 3d, 7d
	default:
		writeError(w, http.StatusBadRequest, "invalid_auto_archive", "60 | 1440 | 4320 | 10080 olmalı")
		return
	}

	threadID := h.IDs.Next()
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "tx başarısız")
		return
	}
	defer tx.Rollback(r.Context())

	guildID := *parent.GuildID
	parentIDCopy := parentID
	thread := &repo.Channel{
		ID:       threadID,
		GuildID:  &guildID,
		ParentID: &parentIDCopy,
		Type:     req.Type,
		Name:     req.Name,
	}

	if _, err := tx.Exec(r.Context(), `
        INSERT INTO channels (id, guild_id, parent_id, type, name, position)
        VALUES ($1, $2, $3, $4::channel_type, $5, 0)
    `, thread.ID, guildID, parentID, req.Type, req.Name); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "thread channel: "+err.Error())
		return
	}

	var starterID *int64
	if req.StarterMessageID != "" {
		if id, err := strconv.ParseInt(req.StarterMessageID, 10, 64); err == nil {
			starterID = &id
		}
	}
	invitable := true
	if req.Invitable != nil {
		invitable = *req.Invitable
	}
	if _, err := tx.Exec(r.Context(), `
        INSERT INTO thread_metadata (channel_id, auto_archive_minutes, creator_id, starter_message_id, invitable)
        VALUES ($1, $2, $3, $4, $5)
    `, threadID, req.AutoArchiveMinutes, uid, starterID, invitable); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "thread metadata: "+err.Error())
		return
	}
	if _, err := tx.Exec(r.Context(), `
        INSERT INTO thread_members (channel_id, user_id) VALUES ($1, $2)
    `, threadID, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "thread member: "+err.Error())
		return
	}

	// Forum etiketleri (yalnızca bu forumun kendi etiketleri kabul edilir)
	for _, ts := range req.TagIDs {
		tagID, perr := strconv.ParseInt(ts, 10, 64)
		if perr != nil {
			continue
		}
		if _, err := tx.Exec(r.Context(), `
            INSERT INTO thread_tags (thread_id, tag_id)
            SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM forum_tags WHERE id = $2 AND channel_id = $3)
            ON CONFLICT DO NOTHING
        `, threadID, tagID, parentID); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "thread tag: "+err.Error())
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "commit")
		return
	}

	h.Events.ToGuild(r.Context(), guildID, "THREAD_CREATE", map[string]any{
		"thread":     thread,
		"parent_id":  strconv.FormatInt(parentID, 10),
		"creator_id": strconv.FormatInt(uid, 10),
	})
	writeJSON(w, http.StatusCreated, thread)
}

func (h *Handler) ListThreads(w http.ResponseWriter, r *http.Request) {
	channelID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	parent, err := h.Channels.ByID(r.Context(), channelID)
	if err != nil || parent.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "kanal yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ok, _ := h.Guilds.IsMember(r.Context(), *parent.GuildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	includeArchived := r.URL.Query().Get("archived") == "true"

	q := `
        SELECT c.id, c.guild_id, c.parent_id, c.type::text, c.name, c.position, c.created_at,
               t.archived, t.archive_timestamp, t.auto_archive_minutes, t.locked, t.creator_id,
               t.message_count, t.member_count,
               COALESCE(ARRAY(SELECT tag_id::text FROM thread_tags WHERE thread_id = c.id), '{}') AS tag_ids
        FROM channels c
        JOIN thread_metadata t ON t.channel_id = c.id
        WHERE c.parent_id = $1
    `
	if !includeArchived {
		q += " AND t.archived = FALSE"
	}
	q += " ORDER BY c.id DESC LIMIT 100"

	rows, err := h.Pool.Query(r.Context(), q, channelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "alınamadı: "+err.Error())
		return
	}
	defer rows.Close()
	type threadView struct {
		repo.Channel
		Archived           bool     `json:"archived"`
		ArchiveTimestamp   *string  `json:"archive_timestamp,omitempty"`
		AutoArchiveMinutes int32    `json:"auto_archive_minutes"`
		Locked             bool     `json:"locked"`
		CreatorID          int64    `json:"creator_id,string"`
		MessageCount       int32    `json:"message_count"`
		MemberCount        int32    `json:"member_count"`
		TagIDs             []string `json:"tag_ids"`
	}
	out := []threadView{}
	for rows.Next() {
		var t threadView
		var archiveTs *string
		if err := rows.Scan(&t.ID, &t.GuildID, &t.ParentID, &t.Type, &t.Name, &t.Position, &t.CreatedAt,
			&t.Archived, &archiveTs, &t.AutoArchiveMinutes, &t.Locked, &t.CreatorID,
			&t.MessageCount, &t.MemberCount, &t.TagIDs); err != nil {
			continue
		}
		t.ArchiveTimestamp = archiveTs
		out = append(out, t)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) JoinThread(w http.ResponseWriter, r *http.Request) {
	threadID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	thread, err := h.Channels.ByID(r.Context(), threadID)
	if err != nil || thread.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "thread yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if ok, _ := h.Guilds.IsMember(r.Context(), *thread.GuildID, uid); !ok {
		writeError(w, http.StatusForbidden, "forbidden", "üye değilsin")
		return
	}
	if _, err := h.Pool.Exec(r.Context(), `
        INSERT INTO thread_members (channel_id, user_id) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
    `, threadID, uid); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "katılınamadı")
		return
	}
	h.Pool.Exec(r.Context(), `UPDATE thread_metadata SET member_count = (SELECT count(*) FROM thread_members WHERE channel_id = $1) WHERE channel_id = $1`, threadID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) LeaveThread(w http.ResponseWriter, r *http.Request) {
	threadID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	tag, err := h.Pool.Exec(r.Context(),
		`DELETE FROM thread_members WHERE channel_id = $1 AND user_id = $2`, threadID, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "ayrılınamadı")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "üye değilsin")
		return
	}
	h.Pool.Exec(r.Context(), `UPDATE thread_metadata SET member_count = (SELECT count(*) FROM thread_members WHERE channel_id = $1) WHERE channel_id = $1`, threadID)
	w.WriteHeader(http.StatusNoContent)
}

type threadStateReq struct {
	Archived *bool `json:"archived,omitempty"`
	Locked   *bool `json:"locked,omitempty"`
}

func (h *Handler) UpdateThreadState(w http.ResponseWriter, r *http.Request) {
	threadID, err := parseID(r, "channelID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	thread, err := h.Channels.ByID(r.Context(), threadID)
	if err != nil || thread.GuildID == nil {
		writeError(w, http.StatusNotFound, "not_found", "thread yok")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	if !h.requirePerm(r, *thread.GuildID, uid, perms.ManageThreads, w) {
		return
	}
	var req threadStateReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	sets := []string{}
	args := []any{threadID}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+itoa(len(args)))
	}
	if req.Archived != nil {
		add("archived", *req.Archived)
		if *req.Archived {
			sets = append(sets, "archive_timestamp = NOW()")
		} else {
			sets = append(sets, "archive_timestamp = NULL")
		}
	}
	if req.Locked != nil {
		add("locked", *req.Locked)
	}
	if len(sets) == 0 {
		writeError(w, http.StatusBadRequest, "nothing_to_update", "değişiklik yok")
		return
	}
	q := "UPDATE thread_metadata SET " + strings.Join(sets, ", ") + " WHERE channel_id = $1"
	if _, err := h.Pool.Exec(r.Context(), q, args...); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "güncellenmedi")
		return
	}
	h.Events.ToGuild(r.Context(), *thread.GuildID, "THREAD_UPDATE", map[string]any{
		"thread_id": strconv.FormatInt(threadID, 10),
	})
	w.WriteHeader(http.StatusNoContent)
}
