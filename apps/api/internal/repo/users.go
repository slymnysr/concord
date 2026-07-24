package repo

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID                    int64      `json:"id,string"`
	Username              string     `json:"username"`
	Email                 string     `json:"email"`
	DisplayName           string     `json:"display_name"`
	PasswordHash          string     `json:"-"`
	AvatarColor           string     `json:"avatar_color"`
	AvatarURL             *string    `json:"avatar_url,omitempty"`
	Bio                   *string    `json:"bio,omitempty"`
	BannerURL             *string    `json:"banner_url,omitempty"`
	Pronouns              *string    `json:"pronouns,omitempty"`
	AccentColor           *string    `json:"accent_color,omitempty"`
	CustomStatusText      *string    `json:"custom_status_text,omitempty"`
	CustomStatusEmoji     *string    `json:"custom_status_emoji,omitempty"`
	CustomStatusExpiresAt *time.Time `json:"custom_status_expires_at,omitempty"`
	TOTPSecret            *string    `json:"-"`
	TOTPEnabled           bool       `json:"totp_enabled"`
	AvatarDecoration      *string    `json:"avatar_decoration,omitempty"`
	EmailVerified         bool       `json:"email_verified"`
	Status                string     `json:"status"`
	Bot                   bool       `json:"bot"`
	CreatedAt             time.Time  `json:"created_at"`
	// Doğum tarihi — yaş kapısı (COPPA/DSA). JSON'da GİZLİ: hassas veri, başkasının
	// profilinde görünmemeli; kullanıcı kendi verisini data-export ile alır.
	BirthDate *time.Time `json:"-"`
	// Dil — işlem maillerinin dili (mailler API'den gider, çeviri sunucuda olmalı).
	// nil = bilinmiyor → mailer İngilizceye düşer.
	Locale *string `json:"locale,omitempty"`
}

var ErrNotFound = errors.New("repo: not found")
var ErrConflict = errors.New("repo: conflict")

type Users struct{ pool *pgxpool.Pool }

func NewUsers(p *pgxpool.Pool) *Users { return &Users{pool: p} }

func (r *Users) Create(ctx context.Context, u *User) error {
	_, err := r.pool.Exec(ctx, `
        INSERT INTO users (id, username, email, display_name, password_hash, avatar_color, birth_date, locale)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, u.ID, u.Username, u.Email, u.DisplayName, u.PasswordHash, u.AvatarColor, u.BirthDate, u.Locale)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrConflict
		}
		return err
	}
	return nil
}

func (r *Users) ByEmail(ctx context.Context, email string) (*User, error) {
	u := &User{}
	err := r.pool.QueryRow(ctx, `
        SELECT id, username, email, display_name, password_hash, avatar_color, avatar_url, bio, banner_url, pronouns, accent_color, custom_status_text, custom_status_emoji, custom_status_expires_at, totp_secret, totp_enabled, avatar_decoration, email_verified, status, bot, created_at
        FROM users WHERE email = $1
    `, email).Scan(
		&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.PasswordHash,
		&u.AvatarColor, &u.AvatarURL, &u.Bio, &u.BannerURL, &u.Pronouns, &u.AccentColor, &u.CustomStatusText, &u.CustomStatusEmoji, &u.CustomStatusExpiresAt, &u.TOTPSecret, &u.TOTPEnabled, &u.AvatarDecoration, &u.EmailVerified, &u.Status, &u.Bot, &u.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}

func (r *Users) ByID(ctx context.Context, id int64) (*User, error) {
	u := &User{}
	err := r.pool.QueryRow(ctx, `
        SELECT id, username, email, display_name, password_hash, avatar_color, avatar_url, bio, banner_url, pronouns, accent_color, custom_status_text, custom_status_emoji, custom_status_expires_at, totp_secret, totp_enabled, avatar_decoration, email_verified, status, bot, created_at
        FROM users WHERE id = $1
    `, id).Scan(
		&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.PasswordHash,
		&u.AvatarColor, &u.AvatarURL, &u.Bio, &u.BannerURL, &u.Pronouns, &u.AccentColor, &u.CustomStatusText, &u.CustomStatusEmoji, &u.CustomStatusExpiresAt, &u.TOTPSecret, &u.TOTPEnabled, &u.AvatarDecoration, &u.EmailVerified, &u.Status, &u.Bot, &u.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}
