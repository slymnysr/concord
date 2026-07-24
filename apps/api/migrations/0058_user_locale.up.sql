-- Kullanıcı dili — işlem maillerinin dilini belirler.
--
-- NEDEN GEREKLİ: mailler API'den gider, istemci yok → çeviri sunucuda olmak zorunda.
-- Dil bilinmezse Japon kullanıcı şifre sıfırlama mailini TÜRKÇE alıyordu ve ne yapacağını
-- anlamıyordu (uygulama global).
--
-- NULL = bilinmiyor (eski kullanıcılar) → mailer İngilizceye düşer. Türkçe'ye düşmek
-- global kullanıcıya anlamadığı bir mail göndermek olurdu.
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT;
