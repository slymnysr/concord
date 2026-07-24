-- Uyum (FAZ M): yaş kapısı + veri dışa aktarma.
--
-- NEDEN: uygulama GLOBAL. Bunlar "iyi olur" değil, YASAL zorunluluk:
--  * GDPR Md.15 (erişim hakkı) → veri dışa aktarma
--  * COPPA (ABD, 13+) ve DSA (AB) → yaş kapısı
--
-- NOT: hesap silme (GDPR Md.17) ZATEN VAR — 0043_account_deletion + handlers.DeleteMyAccount
-- (anonimleştirir, login'i engeller). Denetim belgesi "yok" diyordu; ölçüldü, yanlıştı.

-- Doğum tarihi: kayıtta sorulur. NULL = eski kullanıcılar (geriye dönük) → uygulama onları
-- "yaş bilinmiyor" sayar ve yaş kapısı uygulanan yerlerde doğrulama ister.
-- Değiştirme AKIŞI YOK: serbest bırakmak yaş kapısını anlamsız kılardı (kullanıcı reddedilince
-- tarihi değiştirip tekrar dener). Gerçek düzeltme destek talebi olmalı.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Veri dışa aktarma istekleri (GDPR Md.15). ASENKRON: kullanıcı verisi 41 tabloya yayılı;
-- istek süresinde toplamak zaman aşımına uğrar. Hazır olunca indirilir.
CREATE TABLE IF NOT EXISTS data_exports (
    id           BIGINT PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
    payload      JSONB,       -- hazır arşiv (küçük veri; büyürse nesne deposuna taşınır)
    error        TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ready_at     TIMESTAMPTZ,
    -- Arşiv kullanıcının TÜM verisini taşır → süresiz durmamalı
    expires_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_data_exports_user ON data_exports (user_id, requested_at DESC);
