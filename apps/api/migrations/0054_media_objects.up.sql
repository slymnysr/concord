-- Medya işleme durumu — NESNE ANAHTARINA bağlı, attachment'a değil.
--
-- NEDEN: upload'lar presigned URL ile İSTEMCİDEN DOĞRUDAN MinIO'ya gider. MinIO'nun
-- ObjectCreated olayı geldiğinde mesaj HENÜZ OLUŞTURULMAMIŞTIR → attachments satırı yoktur.
-- Bu yüzden tarama/işleme sonucu nesne anahtarında tutulur; mesaj oluşturulurken
-- ekin anahtarı burada 'clean' mi diye kontrol edilir (enfekte dosya mesaja iliştirilemez).
CREATE TABLE media_objects (
    key             TEXT PRIMARY KEY,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending|clean|infected|rejected
    content_type    TEXT,                             -- magic-byte'tan TESPİT EDİLEN gerçek tip
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    width           INT,
    height          INT,
    thumb_key       TEXT,                             -- üretilen thumbnail'in nesne anahtarı
    scan_signature  TEXT,                             -- enfekteyse ClamAV imzası
    error           TEXT,                             -- reddedildiyse sebep
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_objects_status ON media_objects (status, created_at DESC);

CREATE TRIGGER trg_media_objects_updated BEFORE UPDATE ON media_objects
    FOR EACH ROW EXECUTE FUNCTION concord_set_updated_at();

-- Ek metadatası: işleme sonucundan doldurulur (istemci beyanına güvenilmez)
ALTER TABLE attachments
    ADD COLUMN width     INT,
    ADD COLUMN height    INT,
    ADD COLUMN thumb_url TEXT;
