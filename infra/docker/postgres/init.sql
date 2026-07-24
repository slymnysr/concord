-- Concord PostgreSQL ilk şema
-- Faz 1'de migration sistemi ile yönetilecek, şimdilik manuel iskele

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Snowflake benzeri ID üretimi için sequence (Discord-stili 64-bit ID)
CREATE SEQUENCE IF NOT EXISTS concord_id_seq;
