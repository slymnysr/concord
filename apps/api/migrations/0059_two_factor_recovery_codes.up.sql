-- 2FA kurtarma kodları — authenticator'ını/telefonunu kaybeden kullanıcının hesabına
-- girebilmesi için tek kullanımlık yedek kodlar. Login'de TOTP'nin ALTERNATİFİDİR: TOTP
-- tutmazsa kurtarma kodu denenir. Bu tablo olmadan 2FA açıp cihazını kaybeden kullanıcı
-- hesabına BİR DAHA giremezdi (kalıcı kilitlenme).
CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
    id         BIGINT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Kodun kendisi DEĞİL, SHA-256 hash'i saklanır (DB sızsa kodlar ele geçmesin). Kodlar
    -- yüksek entropili (rastgele) olduğu için SHA-256 yeterli — salt/argon gerekmez.
    code_hash  TEXT   NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Login sırasında kullanılmamış kodda hızlı arama
CREATE INDEX IF NOT EXISTS idx_2fa_recovery_unused ON two_factor_recovery_codes(user_id) WHERE used_at IS NULL;
