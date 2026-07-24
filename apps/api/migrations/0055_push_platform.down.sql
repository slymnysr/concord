DROP INDEX IF EXISTS idx_push_subs_user;
DELETE FROM push_subscriptions WHERE platform = 'expo' OR p256dh IS NULL OR auth IS NULL;
ALTER TABLE push_subscriptions
    DROP COLUMN IF EXISTS failed_at,
    DROP COLUMN IF EXISTS platform,
    ALTER COLUMN p256dh SET NOT NULL,
    ALTER COLUMN auth SET NOT NULL;
