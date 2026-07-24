-- Role permissions ekleri:
-- Position tablosu zaten var. Şimdi @everyone otomatik oluşturma + member_roles ile çalışan permission sistemi

-- @everyone rolünü otomatik oluşturan trigger
CREATE OR REPLACE FUNCTION concord_create_everyone_role() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO roles (id, guild_id, name, color, position, permissions, is_everyone)
    VALUES (
        -- Snowflake-like ID üretimi: guild_id + 0 offset = role id
        NEW.id + 1,
        NEW.id,
        '@everyone',
        0,
        0,
        -- Varsayılan: VIEW_CHANNEL + SEND_MESSAGES + READ_MESSAGE_HISTORY + CONNECT + SPEAK
        (1::bigint << 10) | (1::bigint << 11) | (1::bigint << 16) | (1::bigint << 20) | (1::bigint << 21),
        TRUE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guilds_create_everyone
    AFTER INSERT ON guilds
    FOR EACH ROW EXECUTE FUNCTION concord_create_everyone_role();

-- Mevcut guildler için @everyone rolü
INSERT INTO roles (id, guild_id, name, color, position, permissions, is_everyone)
SELECT g.id + 1, g.id, '@everyone', 0, 0,
       (1::bigint << 10) | (1::bigint << 11) | (1::bigint << 16) | (1::bigint << 20) | (1::bigint << 21),
       TRUE
FROM guilds g
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.guild_id = g.id AND r.is_everyone = TRUE);
