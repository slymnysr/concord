-- Concord ilk şema
-- Snowflake ID = BIGINT (64-bit), uygulamada üretilir

-- Uzantılar BURADA kurulur: şema onlara bağımlı (users.username/email CITEXT).
-- Eskiden hiçbir migration uzantı oluşturmuyordu; geliştirme veritabanında ELLE kurulu
-- oldukları için fark edilmiyordu → SIFIRDAN kurulum (CI, yeni ortam, prod) daha ilk
-- migration'da "type citext does not exist" ile patlıyordu. Migration seti kendi kendine
-- yeterli olmalı: çalıştırıldığı yerde başka hiçbir elle adım gerektirmemeli.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id              BIGINT PRIMARY KEY,
    username        CITEXT NOT NULL UNIQUE,
    email           CITEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    avatar_color    TEXT NOT NULL DEFAULT '#00D9A6',
    avatar_url      TEXT,
    bio             TEXT,
    status          TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','idle','dnd','offline')),
    bot             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id              BIGINT PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    user_agent      TEXT,
    ip              INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

CREATE TABLE guilds (
    id              BIGINT PRIMARY KEY,
    name            TEXT NOT NULL,
    icon_text       TEXT NOT NULL DEFAULT '?',
    icon_color      TEXT NOT NULL DEFAULT '#00D9A6',
    icon_url        TEXT,
    owner_id        BIGINT NOT NULL REFERENCES users(id),
    description     TEXT,
    is_public       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_guilds_owner ON guilds(owner_id);

CREATE TYPE channel_type AS ENUM ('text', 'voice', 'announcement', 'forum', 'stage', 'category', 'dm', 'group_dm');

CREATE TABLE channels (
    id              BIGINT PRIMARY KEY,
    guild_id        BIGINT REFERENCES guilds(id) ON DELETE CASCADE,
    parent_id       BIGINT REFERENCES channels(id) ON DELETE SET NULL,
    type            channel_type NOT NULL,
    name            TEXT NOT NULL,
    topic           TEXT,
    position        INT NOT NULL DEFAULT 0,
    nsfw            BOOLEAN NOT NULL DEFAULT FALSE,
    rate_limit_sec  INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_channels_guild ON channels(guild_id, position);

CREATE TABLE roles (
    id              BIGINT PRIMARY KEY,
    guild_id        BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    color           INT NOT NULL DEFAULT 0,
    position        INT NOT NULL DEFAULT 0,
    permissions     BIGINT NOT NULL DEFAULT 0,
    hoist           BOOLEAN NOT NULL DEFAULT FALSE,
    mentionable     BOOLEAN NOT NULL DEFAULT FALSE,
    is_everyone     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_roles_guild ON roles(guild_id, position);

CREATE TABLE guild_members (
    guild_id        BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname        TEXT,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX idx_members_user ON guild_members(user_id);

CREATE TABLE member_roles (
    guild_id        BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    role_id         BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (guild_id, user_id, role_id),
    FOREIGN KEY (guild_id, user_id) REFERENCES guild_members(guild_id, user_id) ON DELETE CASCADE
);

-- Mesaj metadatası VE içeriği burada (tek DB). Discord 2017+ mesajları ayrı bir
-- geniş-kolon store'a taşır; bizde o ihtiyaç henüz yok — gelirse planlı bir faz
-- olarak ele alınır (ROADMAP-FAZLAR.md TIER 4). Bu yorum eskiden var olmayan bir
-- Scylla kurulumunu tarif ediyordu; kaldırıldı.
CREATE TABLE messages (
    id              BIGINT PRIMARY KEY,
    channel_id      BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id       BIGINT NOT NULL REFERENCES users(id),
    content         TEXT NOT NULL,
    edited_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_channel ON messages(channel_id, id DESC);

CREATE TABLE attachments (
    id              BIGINT PRIMARY KEY,
    message_id      BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    url             TEXT NOT NULL,
    content_type    TEXT,
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Otomatik updated_at trigger
CREATE OR REPLACE FUNCTION concord_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION concord_set_updated_at();
CREATE TRIGGER trg_guilds_updated BEFORE UPDATE ON guilds
    FOR EACH ROW EXECUTE FUNCTION concord_set_updated_at();
CREATE TRIGGER trg_channels_updated BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION concord_set_updated_at();
