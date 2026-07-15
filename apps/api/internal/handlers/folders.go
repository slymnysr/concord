package handlers

import (
	"net/http"
	"strconv"

	"github.com/concord/api/internal/middleware"
)

type folderView struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Color    int32    `json:"color"`
	Position int32    `json:"position"`
	GuildIDs []string `json:"guild_ids"`
}

type createFolderReq struct {
	Name     string   `json:"name"`
	Color    int32    `json:"color,omitempty"`
	GuildIDs []string `json:"guild_ids,omitempty"`
}

// GET /api/v1/users/me/folders
func (h *Handler) ListFolders(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	rows, err := h.Pool.Query(r.Context(), `
        SELECT f.id::text, f.name, f.color, f.position,
               COALESCE(array_agg(m.guild_id::text ORDER BY m.position) FILTER (WHERE m.guild_id IS NOT NULL), '{}') AS gids
        FROM user_guild_folders f
        LEFT JOIN user_guild_folder_members m ON m.folder_id = f.id
        WHERE f.user_id = $1
        GROUP BY f.id, f.name, f.color, f.position
        ORDER BY f.position ASC
    `, uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer rows.Close()
	out := []folderView{}
	for rows.Next() {
		var f folderView
		if err := rows.Scan(&f.ID, &f.Name, &f.Color, &f.Position, &f.GuildIDs); err == nil {
			out = append(out, f)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /api/v1/users/me/folders
func (h *Handler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFrom(r.Context())
	var req createFolderReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Name == "" || len(req.Name) > 40 {
		writeError(w, http.StatusBadRequest, "invalid_name", "1-40 karakter")
		return
	}
	color := req.Color
	if color == 0 {
		color = 8421504
	}
	id := h.IDs.Next()
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	defer tx.Rollback(r.Context())
	_, err = tx.Exec(r.Context(), `
        INSERT INTO user_guild_folders (id, user_id, name, color, position)
        VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position), -1) + 1 FROM user_guild_folders WHERE user_id = $2))
    `, id, uid, req.Name, color)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	for i, gidStr := range req.GuildIDs {
		gid, _ := strconv.ParseInt(gidStr, 10, 64)
		_, _ = tx.Exec(r.Context(), `
            INSERT INTO user_guild_folder_members (folder_id, guild_id, position)
            VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
        `, id, gid, i)
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, folderView{
		ID: int64ToStr(id), Name: req.Name, Color: color, GuildIDs: req.GuildIDs,
	})
}

// PATCH /api/v1/folders/:id
func (h *Handler) UpdateFolder(w http.ResponseWriter, r *http.Request) {
	folderID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	var ownerID int64
	if err := h.Pool.QueryRow(r.Context(), `SELECT user_id FROM user_guild_folders WHERE id = $1`, folderID).Scan(&ownerID); err != nil {
		writeError(w, http.StatusNotFound, "not_found", "klasör yok")
		return
	}
	if ownerID != uid {
		writeError(w, http.StatusForbidden, "forbidden", "kendi klasörün değil")
		return
	}
	var req createFolderReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if req.Name != "" {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE user_guild_folders SET name = $1 WHERE id = $2`, req.Name, folderID)
	}
	if req.Color != 0 {
		_, _ = h.Pool.Exec(r.Context(), `UPDATE user_guild_folders SET color = $1 WHERE id = $2`, req.Color, folderID)
	}
	if req.GuildIDs != nil {
		_, _ = h.Pool.Exec(r.Context(), `DELETE FROM user_guild_folder_members WHERE folder_id = $1`, folderID)
		for i, gidStr := range req.GuildIDs {
			gid, _ := strconv.ParseInt(gidStr, 10, 64)
			_, _ = h.Pool.Exec(r.Context(), `
                INSERT INTO user_guild_folder_members (folder_id, guild_id, position)
                VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
            `, folderID, gid, i)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/folders/:id
func (h *Handler) DeleteFolder(w http.ResponseWriter, r *http.Request) {
	folderID, err := parseID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id")
		return
	}
	uid := middleware.UserIDFrom(r.Context())
	_, _ = h.Pool.Exec(r.Context(), `DELETE FROM user_guild_folders WHERE id = $1 AND user_id = $2`, folderID, uid)
	w.WriteHeader(http.StatusNoContent)
}
