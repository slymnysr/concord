package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/concord/api/internal/auth"
	"github.com/concord/api/internal/automod"
	"github.com/concord/api/internal/config"
	"github.com/concord/api/internal/events"
	"github.com/concord/api/internal/mailer"
	"github.com/concord/api/internal/push"
	"github.com/concord/api/internal/repo"
	"github.com/concord/api/internal/snowflake"
	"github.com/concord/api/internal/storage"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type Handler struct {
	logger *zap.Logger
	cfg    *config.Config

	IDs     *snowflake.Generator
	Iss     *auth.Issuer
	Pool    *pgxpool.Pool
	Redis   *redis.Client
	Storage *storage.Storage
	Events  *events.Publisher
	AutoMod *automod.Engine
	Mailer  *mailer.Mailer
	Push    *push.Sender

	Users         *repo.Users
	Guilds        *repo.Guilds
	Channels      *repo.Channels
	Messages      *repo.Messages
	RefreshTokens *repo.RefreshTokens
	Invites       *repo.Invites
	Members       *repo.Members
	Roles         *repo.Roles
	ChannelPerms  *repo.ChannelPerms
	Moderation    *repo.Moderation
	DMs           *repo.DMs
	Reactions     *repo.Reactions
	MediaObjects  *repo.MediaObjects
	PushSubs      *repo.PushSubs
	Attachments   *repo.Attachments
	Mentions      *repo.Mentions
	Notifications *repo.Notifications
	Friends       *repo.Friends
	LoginAttempts *repo.LoginAttempts
}

// Config — router gibi paketlerin config'e erişmesi için (CORS origin'leri vb.).
func (h *Handler) Config() *config.Config { return h.cfg }

func New(logger *zap.Logger, cfg *config.Config, pool *pgxpool.Pool, rdb *redis.Client, ids *snowflake.Generator, iss *auth.Issuer, store *storage.Storage) *Handler {
	return &Handler{
		logger: logger,
		cfg:    cfg,
		Push: push.NewSender(push.Config{
			ExpoAccessToken: cfg.ExpoAccessToken,
			VAPIDPublicKey:  cfg.VAPIDPublicKey,
			VAPIDPrivateKey: cfg.VAPIDPrivateKey,
			VAPIDSubject:    cfg.VAPIDSubject,
		}),
		IDs:           ids,
		Iss:           iss,
		Pool:          pool,
		Redis:         rdb,
		Storage:       store,
		Events:        events.New(rdb),
		AutoMod:       automod.New(pool),
		Mailer:        mailer.New(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.MailFrom),
		Users:         repo.NewUsers(pool),
		Guilds:        repo.NewGuilds(pool),
		Channels:      repo.NewChannels(pool),
		Messages:      repo.NewMessages(pool),
		RefreshTokens: repo.NewRefreshTokens(pool),
		Invites:       repo.NewInvites(pool),
		Members:       repo.NewMembers(pool),
		Roles:         repo.NewRoles(pool),
		ChannelPerms:  repo.NewChannelPerms(pool),
		Moderation:    repo.NewModeration(pool),
		DMs:           repo.NewDMs(pool),
		Reactions:     repo.NewReactions(pool),
		MediaObjects:  repo.NewMediaObjects(pool),
		PushSubs:      repo.NewPushSubs(pool),
		Attachments:   repo.NewAttachments(pool),
		Mentions:      repo.NewMentions(pool),
		Notifications: repo.NewNotifications(pool),
		Friends:       repo.NewFriends(pool),
		LoginAttempts: repo.NewLoginAttempts(pool),
	}
}

func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "concord-api",
	})
}

func (h *Handler) Version(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"version":     "0.0.1",
		"environment": h.cfg.Environment,
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, detail string) {
	writeJSON(w, status, map[string]string{
		"error":  code,
		"detail": detail,
	})
}

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return errors.New("invalid JSON: " + err.Error())
	}
	return nil
}

// readJSONLenient — bilinmeyen alanları YOK SAYAR. Yalnızca şemasını BİZİM KONTROL ETMEDİĞİMİZ
// dış kaynaklar için (ör. MinIO bucket-notification): readJSON'ın DisallowUnknownFields'ı
// kullanıcı girdisinde doğrudur (yazım hatası/mass-assignment yakalar) ama üçüncü-parti
// webhook'ta yanlıştır — MinIO'nun S3 olayı onlarca ek alan taşır ve sürümle yenileri eklenir;
// katı çözücü tüm olayları 400'le reddediyordu (dosyalar sessizce taranmadan kalıyordu).
// KULLANICI girdisinde ASLA kullanma.
func readJSONLenient(r *http.Request, v any) error {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return errors.New("invalid JSON: " + err.Error())
	}
	return nil
}
