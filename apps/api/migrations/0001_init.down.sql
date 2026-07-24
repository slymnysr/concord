DROP TRIGGER IF EXISTS trg_channels_updated ON channels;
DROP TRIGGER IF EXISTS trg_guilds_updated ON guilds;
DROP TRIGGER IF EXISTS trg_users_updated ON users;
DROP FUNCTION IF EXISTS concord_set_updated_at;

DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS member_roles;
DROP TABLE IF EXISTS guild_members;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS channels;
DROP TYPE  IF EXISTS channel_type;
DROP TABLE IF EXISTS guilds;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
