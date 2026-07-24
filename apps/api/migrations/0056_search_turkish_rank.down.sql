ALTER TABLE messages DROP COLUMN search_vector;
ALTER TABLE messages ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;
CREATE INDEX idx_messages_search ON messages USING GIN (search_vector);
DROP FUNCTION IF EXISTS concord_unaccent(text);
