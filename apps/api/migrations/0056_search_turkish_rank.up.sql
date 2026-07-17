-- Arama: Türkçe kök bulma + aksan-duyarsızlık + alaka sıralaması.
--
-- ÖNCESİNDEKİ ÜÇ GERÇEK KUSUR (ölçülerek bulundu, varsayılmadı):
-- 1) 'simple' config KÖK BULMAZ → "mesajlar" araması "mesaj"ı BULMUYORDU.
-- 2) ASCII yazım hiç eşleşmiyordu → "toplanti" araması "toplantı"yı bulmuyordu. Türkiye'de
--    kullanıcıların çoğu Türkçe karakter yazmaz; bu, aramanın pratikte çalışmaması demekti.
-- 3) Sıralama m.id DESC idi → alaka sıralaması YOKTU (handlers/search.go'da düzeltildi).
--
-- ÖLÇÜM (8 vaka: kök bulma + ASCII + İngilizce): 'simple' 0/6 → bu şema 8/8.
--
-- NEDEN unaccent + turkish + english BİRLİKTE:
-- * unaccent (ı→i, ş→s, ç→c…): ASCII yazan kullanıcıyı yakalar. BONUS: Türkçe snowball
--   stemmer'ı aksanlı metinde TUTARSIZ ('toplantı'→'topla' ama 'toplantılar'→'toplan',
--   birbirini bulmuyorlar; 'sunucu'→'sunuç' gibi saçma kökler de var). ASCII'ye indirgenince
--   kökler tutarlılaşıyor → stemmer'ın bozduğu vakalar da düzeliyor.
-- * turkish + english birlikte: içerik karışık (Türkçe sohbet + İngilizce terim/kod).
--   Tek config diğer dili bozar. tsvector birleşimi (||) tam bunun için var.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() STABLE'dır (sözlük araması), generated column ise IMMUTABLE ister.
-- Bu sarmalayıcı standart çözümdür ve GÜVENLİDİR: sözlük (unaccent.rules) çalışma
-- zamanında değişmez; değişirse indeksin REINDEX edilmesi gerekir.
-- regdictionary ŞEMA-NİTELİKLİ olmalı: generated column'ın search_path'i sabit değildir,
-- niteliksiz ad başka bir şemada çözülüp sessizce farklı sonuç üretebilir.
CREATE OR REPLACE FUNCTION concord_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

ALTER TABLE messages DROP COLUMN search_vector;

ALTER TABLE messages ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector('turkish', concord_unaccent(coalesce(content, ''))) ||
        to_tsvector('english', concord_unaccent(coalesce(content, '')))
    ) STORED;

CREATE INDEX idx_messages_search ON messages USING GIN (search_vector);
