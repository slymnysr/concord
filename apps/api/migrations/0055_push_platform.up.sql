-- Push abonelikleri: iki FARKLI protokolü tek tablo taşıyor.
--
-- SORUN: tablo yalnızca Web Push'a göre tasarlanmıştı (endpoint + p256dh + auth, üçü de
-- NOT NULL). Mobil ise Expo push TOKEN'ı gönderiyor — p256dh/auth diye bir şeyi yok.
-- Sonuç: mobil kayıt isteği HER SEFERİNDE 400 alıyordu ve istemcide .catch(()=>{}) ile
-- sessizce yutuluyordu → hiçbir mobil cihaz kayıtlı değildi, kimse push alamıyordu.
--
-- platform ayrımı: 'web' → VAPID şifreli Web Push, 'expo' → Expo Push Service (FCM/APNs'e
-- kendisi iletir). Gönderici (internal/push) buna göre yol seçer.
ALTER TABLE push_subscriptions
    ADD COLUMN platform TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'expo')),
    ALTER COLUMN p256dh DROP NOT NULL,
    ALTER COLUMN auth DROP NOT NULL,
    -- Gönderim başarısız olan abonelikleri temizleyebilmek için (DeviceNotRegistered vb.)
    ADD COLUMN failed_at TIMESTAMPTZ;

CREATE INDEX idx_push_subs_user ON push_subscriptions (user_id) WHERE failed_at IS NULL;
