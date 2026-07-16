# Concord Backend — Discord Özellik Denetimi

**Tarih:** 2026-05-25
**Mevcut backend kapsamı:** ~50 endpoint, 18 tablo, 4 servis (API, Gateway, Voice, Storage)
**Notasyon:** ✅ Var · ⚠️ Kısmi · ❌ Yok · ❎ Niyet yok (zaten Discord'da da yok)

---

## 1. Kimlik & Hesap Yönetimi

| Özellik                                   | Durum | Eksik                                                                               |
| ----------------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| E-posta ile kayıt                         | ✅    | —                                                                                   |
| E-posta ile giriş                         | ✅    | —                                                                                   |
| Kullanıcı adı + discriminator (`#1234`)   | ❌    | Discord 2023'te discriminator'ı kaldırdı, biz username unique olarak gidiyoruz — OK |
| Display name (görünen ad)                 | ✅    | —                                                                                   |
| Avatar yükleme                            | ❌    | Endpoint yok (storage hazır), `PATCH /users/me/avatar` lazım                        |
| Avatar rengi (default)                    | ✅    | —                                                                                   |
| Profil bio                                | ❌    | DB'de `bio` kolonu var, endpoint yok                                                |
| Profil banner                             | ❌    | DB'de kolon yok                                                                     |
| Profil teması (rozet)                     | ❌    | —                                                                                   |
| Connected accounts (Twitch/Steam/Spotify) | ❌    | Oauth entegrasyonu yok                                                              |
| E-posta değiştirme                        | ❌    | —                                                                                   |
| Parola değiştirme                         | ❌    | —                                                                                   |
| Parola sıfırlama (e-posta)                | ❌    | SMTP entegrasyonu yok                                                               |
| E-posta doğrulama                         | ❌    | `email_verified` kolonu yok                                                         |
| Telefon doğrulama                         | ❌    | —                                                                                   |
| Hesap silme                               | ❌    | —                                                                                   |
| GDPR/KVKK veri indirme                    | ❌    | —                                                                                   |
| 2FA TOTP                                  | ❌    | —                                                                                   |
| 2FA SMS                                   | ❌    | —                                                                                   |
| Yedek kodlar (2FA)                        | ❌    | —                                                                                   |
| Per-server nickname                       | ⚠️    | DB'de `nickname` kolonu var, endpoint yok                                           |
| Per-server avatar                         | ❌    | —                                                                                   |
| Hesap rozetleri (HypeSquad vs.)           | ❌    | —                                                                                   |
| Pronouns                                  | ❌    | —                                                                                   |
| Tema seçimi (dark/light)                  | ❎    | İstemci tarafı, backend gerektirmez                                                 |

## 2. Kimlik Doğrulama & Güvenlik

| Özellik                         | Durum | Eksik                                               |
| ------------------------------- | ----- | --------------------------------------------------- |
| JWT access token (HS256)        | ✅    | —                                                   |
| Refresh token                   | ✅    | —                                                   |
| Token rotasyonu                 | ✅    | —                                                   |
| Argon2id parola hash            | ✅    | —                                                   |
| Login attempt rate limit        | ❌    | Brute-force koruması yok                            |
| CAPTCHA                         | ❌    | —                                                   |
| IP loglama                      | ⚠️    | refresh_tokens'te `ip` kolonu var ama doldurulmuyor |
| Şüpheli giriş bildirimi         | ❌    | —                                                   |
| Aktif oturum listesi            | ❌    | —                                                   |
| Oturum sonlandırma (logout-all) | ❌    | —                                                   |
| Device tracking                 | ⚠️    | `user_agent` var ama UI yok                         |
| Login alarmı                    | ❌    | —                                                   |

## 3. Arkadaşlar & Sosyal

| Özellik                             | Durum | Eksik                                                   |
| ----------------------------------- | ----- | ------------------------------------------------------- |
| Arkadaşlık isteği gönderme          | ✅    | username veya user_id ile                               |
| Kabul etme                          | ✅    | —                                                       |
| Reddetme                            | ✅    | (Remove ile)                                            |
| Arkadaş listesi                     | ✅    | —                                                       |
| Bekleyen istekler                   | ✅    | —                                                       |
| Gönderilen istekler                 | ✅    | —                                                       |
| Engellenen kullanıcılar             | ⚠️    | `friendship_status='blocked'` tipi var ama endpoint yok |
| Engelleme/engel kaldırma            | ❌    | Block/unblock endpoint yok                              |
| Engellenen kullanıcılarla DM engeli | ❌    | —                                                       |
| Arkadaş arama (kullanıcı keşfi)     | ❌    | —                                                       |
| Karşılıklı arkadaş gösterimi        | ❌    | —                                                       |
| Aile/yakın arkadaş etiketi          | ❎    | Discord'da yok                                          |
| Friend nickname                     | ❌    | —                                                       |

## 4. Direct Messages (DM)

| Özellik                                 | Durum | Eksik                                           |
| --------------------------------------- | ----- | ----------------------------------------------- |
| 1-1 DM kanalı oluşturma                 | ✅    | —                                               |
| DM listesi                              | ✅    | —                                               |
| DM mesajı gönderme                      | ✅    | —                                               |
| DM mesajı düzenleme/silme               | ✅    | (genel message endpoint'i çalışıyor)            |
| Grup DM oluşturma                       | ❌    | `group_dm` tipi var ama endpoint yok            |
| Grup DM'e kullanıcı ekleme              | ❌    | —                                               |
| Grup DM'den ayrılma                     | ❌    | —                                               |
| Grup DM isim/avatar değişimi            | ❌    | —                                               |
| DM'leri okundu işaretleme               | ⚠️    | `last_read_at` kolonu var, endpoint yok         |
| DM bildirimleri                         | ⚠️    | Redis publish var, NOTIFICATION tablo kaydı yok |
| DM kapatma (gizleme)                    | ❌    | —                                               |
| Mesaj isteği (yabancılardan)            | ❌    | —                                               |
| Gizlilik: yalnız arkadaşlar DM atabilir | ❌    | —                                               |

## 5. Sunucular (Guilds)

| Özellik                                     | Durum | Eksik                                |
| ------------------------------------------- | ----- | ------------------------------------ |
| Sunucu oluşturma                            | ✅    | —                                    |
| Sunucu listesi (kendi üyeliklerim)          | ✅    | —                                    |
| Sunucu detayı                               | ✅    | —                                    |
| Sunucu adı/ikonu güncelleme                 | ❌    | `PATCH /guilds/:id` yok              |
| Sunucu banner                               | ❌    | —                                    |
| Sunucu açıklaması                           | ⚠️    | DB kolonu var, endpoint yok          |
| Sunucu silme                                | ❌    | —                                    |
| Sunucudan ayrılma (üye)                     | ❌    | —                                    |
| Sahiplik transferi                          | ❌    | —                                    |
| Sunucu şablonları                           | ❌    | —                                    |
| Sunucu keşfi (public listing)               | ⚠️    | `is_public` kolonu var, endpoint yok |
| Sunucu doğrulama (Verified)                 | ❌    | —                                    |
| Partner program                             | ❌    | —                                    |
| Topluluk sunucusu özellikleri               | ❌    | —                                    |
| Welcome screen                              | ❌    | —                                    |
| Üyelik taraması / rules screening           | ❌    | —                                    |
| Onboarding flow                             | ❌    | —                                    |
| Sunucu widget'ı (embed)                     | ❌    | —                                    |
| Sunucu istatistikleri (insights)            | ❌    | —                                    |
| AFK kanalı + timeout                        | ❌    | —                                    |
| Varsayılan bildirim seviyesi                | ❌    | —                                    |
| Doğrulama seviyesi (yeni hesap kısıtlaması) | ❌    | —                                    |
| Açıklayıcı filtre (explicit content)        | ❌    | —                                    |
| Sistem mesajları kanalı                     | ❌    | —                                    |
| Vanity URL (discord.gg/name)                | ❌    | —                                    |
| Hub sunucuları (eğitim)                     | ❎    | Çok niche                            |

## 6. Sunucu Boost (Premium)

| Özellik                           | Durum | Eksik       |
| --------------------------------- | ----- | ----------- |
| Boost level                       | ❌    | Tamamen yok |
| Boost sayısı                      | ❌    | —           |
| Boost ile artırılan upload limiti | ❌    | —           |
| Boost ile ses kalitesi            | ❌    | —           |
| Boost ile emoji slotu             | ❌    | —           |
| Banner / animated icon (boost)    | ❌    | —           |
| Vanity URL (boost lvl 3)          | ❌    | —           |

## 7. Kanallar

### 7.1 Genel

| Özellik                          | Durum | Eksik                                        |
| -------------------------------- | ----- | -------------------------------------------- |
| Text kanal oluşturma             | ✅    | —                                            |
| Voice kanal oluşturma            | ✅    | —                                            |
| Announcement kanal               | ⚠️    | type ENUM'da var, endpoint farkı yok         |
| Forum kanal                      | ⚠️    | type ENUM'da var, behavior yok               |
| Stage kanal                      | ⚠️    | type ENUM'da var, behavior yok               |
| Category (kategori grubu)        | ⚠️    | `parent_id` var, frontend kullanmıyor        |
| Kanal listesi (per guild)        | ✅    | —                                            |
| Kanal silme                      | ❌    | —                                            |
| Kanal güncelleme (rename, topic) | ❌    | `PATCH /channels/:id` yok                    |
| Kanal pozisyon değiştirme        | ❌    | —                                            |
| Slowmode                         | ⚠️    | `rate_limit_sec` kolonu var, enforcement yok |
| NSFW kanal                       | ⚠️    | `nsfw` kolonu var, yaş onayı yok             |
| Kanal kopyalama                  | ❌    | —                                            |
| Kanal kullanıcı limit (voice)    | ❌    | `user_limit` kolonu yok                      |
| Bölge seçimi (voice region)      | ❌    | —                                            |
| Voice bitrate ayarı              | ❌    | —                                            |
| Kanal varsayılan bildirim ayarı  | ❌    | —                                            |

### 7.2 Thread'ler

| Özellik                                   | Durum | Eksik       |
| ----------------------------------------- | ----- | ----------- |
| Public thread oluşturma                   | ❌    | Tamamen yok |
| Private thread                            | ❌    | —           |
| Announcement thread                       | ❌    | —           |
| Thread'e katılma                          | ❌    | —           |
| Thread arşivleme                          | ❌    | —           |
| Thread auto-archive (24h, 3 gün, 1 hafta) | ❌    | —           |
| Thread'i kilitleme                        | ❌    | —           |
| Thread'lerden ayrılma                     | ❌    | —           |

### 7.3 Forum kanalları

| Özellik                          | Durum | Eksik |
| -------------------------------- | ----- | ----- |
| Post oluşturma                   | ❌    | —     |
| Forum tagleri                    | ❌    | —     |
| Tag ile filtre                   | ❌    | —     |
| Sort (latest activity, creation) | ❌    | —     |
| Pinned posts                     | ❌    | —     |

### 7.4 Stage kanalları

| Özellik                      | Durum | Eksik |
| ---------------------------- | ----- | ----- |
| Stage başlatma               | ❌    | —     |
| Konuşmacı / dinleyici ayrımı | ❌    | —     |
| El kaldırma (raise hand)     | ❌    | —     |
| Stage moderasyonu            | ❌    | —     |

## 8. Mesajlar

| Özellik                                   | Durum | Eksik                             |
| ----------------------------------------- | ----- | --------------------------------- |
| Mesaj gönderme                            | ✅    | —                                 |
| Mesaj listesi (sayfalama)                 | ✅    | `before` cursor ile               |
| Mesaj düzenleme                           | ✅    | —                                 |
| Mesaj silme (kendi)                       | ✅    | —                                 |
| Mesaj silme (mod, ManageMessages)         | ✅    | —                                 |
| Mesaj okundu işareti                      | ❌    | Read state tablosu yok            |
| Mesaj cevaplama (reply)                   | ❌    | `replied_to_id` kolonu yok        |
| Mesaj iletme (forward)                    | ❌    | —                                 |
| Mesaj sabitleme (pin)                     | ✅    | —                                 |
| Pin listesi                               | ✅    | —                                 |
| Mesaj çevirme (translate)                 | ❌    | —                                 |
| Mesaj bildirimi (ping notif)              | ⚠️    | Mention parse var, full notif yok |
| Mesaj URL (deep link)                     | ❌    | —                                 |
| Mesaj history (limit)                     | ✅    | Authorize edilmiş                 |
| Mesaj toplu silme (bulk)                  | ❌    | —                                 |
| Mesaj filtre arama (from:user, has:image) | ❌    | Genel search var, filtre yok      |
| Crosspost (announcement publish)          | ❌    | —                                 |
| Mesaj voice (sesli mesaj)                 | ❌    | —                                 |
| Polls                                     | ❌    | —                                 |
| Edit history görüntüleme                  | ❌    | Discord'da bile yok               |
| Markdown render                           | ✅    | Frontend                          |
| Code block (syntax highlight)             | ⚠️    | Frontend için planlı              |
| Spoiler tag                               | ✅    | Frontend markdown                 |
| Embed (link preview)                      | ❌    | Otomatik URL crawl yok            |
| Custom embed (bot)                        | ❌    | API'sı yok                        |
| Suppress embeds                           | ❌    | —                                 |
| Reply mention toggle                      | ❌    | —                                 |
| Inline reply preview                      | ❌    | —                                 |
| Quote (eski)                              | ❎    | Discord kaldırdı, reply var       |
| Mesaj başına `flags` (Discord pattern)    | ❌    | —                                 |
| Mesaj attribute (TTS)                     | ❌    | —                                 |

## 9. Reactions & Emoji

| Özellik                           | Durum | Eksik                                                     |
| --------------------------------- | ----- | --------------------------------------------------------- |
| Unicode emoji reaction add/remove | ✅    | —                                                         |
| Reaction listesi                  | ✅    | —                                                         |
| Reaction count + me flag          | ✅    | —                                                         |
| Custom emoji reaction             | ⚠️    | Emoji stringi olarak çalışır ama custom emoji tablosu yok |
| Sunucu custom emoji yükleme       | ❌    | —                                                         |
| Custom emoji listesi              | ❌    | —                                                         |
| Animated emoji                    | ❌    | —                                                         |
| Emoji slot limiti                 | ❌    | —                                                         |
| Super reactions                   | ❌    | —                                                         |
| Emoji external (başka sunucudan)  | ❌    | —                                                         |
| Reaction kim koydu listesi        | ⚠️    | DB'de bilgi var, endpoint sadece sayım                    |

## 10. Stickers & GIFs

| Özellik          | Durum | Eksik            |
| ---------------- | ----- | ---------------- |
| Sticker gönderme | ❌    | —                |
| Sticker yükleme  | ❌    | —                |
| Tenor GIF picker | ❌    | API anahtarı yok |
| Soundboard       | ❌    | —                |

## 11. Eklentiler (Attachments)

| Özellik                       | Durum | Eksik                |
| ----------------------------- | ----- | -------------------- |
| Dosya yükleme (presigned PUT) | ✅    | MinIO                |
| Maks. dosya boyutu (100MB)    | ✅    | —                    |
| Mesajda attachment            | ✅    | —                    |
| Görsel önizleme               | ✅    | Frontend             |
| Video oynatma                 | ✅    | Frontend             |
| PDF preview                   | ❌    | —                    |
| Audio player                  | ⚠️    | Frontend yapılabilir |
| Dosya virüs taraması          | ❌    | —                    |
| Attachment alt text (a11y)    | ❌    | —                    |
| Spoiler attachment            | ❌    | —                    |
| Image lightbox                | ❌    | Frontend, sonradan   |
| Image scale (CDN resize)      | ❌    | —                    |
| Boost ile artırılan limit     | ❌    | —                    |

## 12. Voice / Video

| Özellik                              | Durum | Eksik                                       |
| ------------------------------------ | ----- | ------------------------------------------- |
| Voice kanala bağlanma (WebRTC + SFU) | ✅    | mediasoup                                   |
| Voice presence (kim bağlı)           | ✅    | HTTP polling                                |
| Mikrofon mute/unmute                 | ✅    | —                                           |
| Kamera açma/kapama                   | ✅    | —                                           |
| Ekran paylaşımı                      | ✅    | —                                           |
| Ses kalitesi seçeneği                | ❌    | —                                           |
| Echo cancellation                    | ⚠️    | İstemci tarafı flag var, gerçek RNNoise yok |
| Noise suppression (Krisp benzeri)    | ❌    | —                                           |
| Voice activity detection             | ❌    | —                                           |
| Push-to-talk                         | ❌    | İstemci klavye binding yok                  |
| Konuşan kullanıcı göstergesi         | ❌    | RTC stats parse yok                         |
| Server mute / deafen                 | ❌    | —                                           |
| Server move user                     | ❌    | —                                           |
| Voice priority speaker               | ❌    | —                                           |
| Stage live audio                     | ❌    | —                                           |
| Go Live (oyun streaming)             | ❌    | —                                           |
| Watch Together (activities)          | ❌    | —                                           |
| Voice channel chat                   | ⚠️    | Aynı kanal text mesajı yok                  |
| Voice room SFU clustering            | ❌    | Tek node                                    |
| AFK timeout                          | ❌    | —                                           |
| Soundboard sample upload             | ❌    | —                                           |
| Voice region selection               | ❌    | —                                           |
| Krisp lisans / RNNoise WASM          | ❌    | —                                           |

## 13. Roller & İzinler

| Özellik                               | Durum | Eksik                                                               |
| ------------------------------------- | ----- | ------------------------------------------------------------------- |
| Rol oluşturma                         | ✅    | —                                                                   |
| Rol güncelleme                        | ✅    | —                                                                   |
| Rol silme                             | ✅    | —                                                                   |
| @everyone otomatik                    | ✅    | trigger ile                                                         |
| Rol bitmask (41 permission)           | ✅    | —                                                                   |
| Rol pozisyonu (hiyerarşi)             | ⚠️    | position kolonu var, hiyerarşik enforcement (üst rolü atayamaz) yok |
| Rol rengi                             | ✅    | —                                                                   |
| Rol hoist (ayrı grup)                 | ✅    | —                                                                   |
| Mentionable rol                       | ✅    | —                                                                   |
| Rol icon (PNG/emoji)                  | ❌    | —                                                                   |
| Rol drag-drop reorder                 | ⚠️    | API var, frontend yok                                               |
| Üyeye rol atama                       | ✅    | —                                                                   |
| Üyeden rol kaldırma                   | ✅    | —                                                                   |
| Kanal-level override (allow/deny)     | ✅    | role + user                                                         |
| Override hesaplama (Discord priority) | ✅    | —                                                                   |
| Linked roles (connected accounts)     | ❌    | —                                                                   |
| Subscriber roles (Twitch)             | ❌    | —                                                                   |
| Booster rolü                          | ❌    | —                                                                   |

## 14. Moderasyon

| Özellik                                   | Durum | Eksik              |
| ----------------------------------------- | ----- | ------------------ |
| Kick                                      | ✅    | —                  |
| Ban                                       | ✅    | —                  |
| Unban                                     | ✅    | —                  |
| Ban listesi                               | ✅    | —                  |
| Ban sebebi                                | ✅    | —                  |
| Ban silme (mesajları)                     | ❌    | —                  |
| Ban süresi (temp ban)                     | ❌    | —                  |
| Timeout (mute)                            | ✅    | —                  |
| Timeout süre limiti (28 gün max)          | ❌    | Validation yok     |
| AutoMod (anahtar kelime engelleme)        | ❌    | —                  |
| AutoMod (regex pattern)                   | ❌    | —                  |
| AutoMod (spam filtresi)                   | ❌    | —                  |
| AutoMod (mention spam)                    | ❌    | —                  |
| AutoMod (link engelleme)                  | ❌    | —                  |
| AutoMod (NSFW filter)                     | ❌    | —                  |
| AutoMod aksiyonları (alert/block/timeout) | ❌    | —                  |
| Audit log                                 | ❌    | Tablo yok          |
| Audit log filtre/arama                    | ❌    | —                  |
| Şikayet sistemi                           | ❌    | —                  |
| Trust & safety raporları                  | ❌    | —                  |
| Şüpheli IP engelleme                      | ❌    | —                  |
| KVKK içerik kaldırma                      | ❌    | İstek endpoint yok |
| BTK uyumlu içerik moderation              | ❌    | —                  |

## 15. Davetler

| Özellik                                 | Durum | Eksik         |
| --------------------------------------- | ----- | ------------- |
| Davet oluşturma                         | ✅    | —             |
| Davet süresi                            | ✅    | —             |
| Davet kullanım limiti                   | ✅    | —             |
| Davet kabul etme                        | ✅    | —             |
| Davet listeleme                         | ✅    | —             |
| Davet silme                             | ✅    | —             |
| Davet önizleme                          | ✅    | —             |
| Davet vanity URL                        | ❌    | —             |
| Davet temporary membership (geçici üye) | ❌    | —             |
| Davet target kanal                      | ⚠️    | DB kolonu yok |
| Davet target user (DM grup için)        | ❌    | —             |
| Banlanan kullanıcı davete katılamaz     | ✅    | —             |

## 16. Bildirimler & Mention

| Özellik                                   | Durum | Eksik                                |
| ----------------------------------------- | ----- | ------------------------------------ |
| `@username` parse + mention               | ✅    | —                                    |
| `@role` mention                           | ❌    | Parse yok                            |
| `@everyone`                               | ❌    | Parse yok, MENTION_EVERYONE perm var |
| `@here` (online'lara)                     | ❌    | —                                    |
| Mention bildirim oluşturma                | ✅    | —                                    |
| Bildirim listesi                          | ✅    | —                                    |
| Okunmamış sayısı                          | ✅    | —                                    |
| Hepsini okundu                            | ✅    | —                                    |
| Bildirim okuma (tekil)                    | ❌    | —                                    |
| Bildirim ayarları (per channel)           | ❌    | —                                    |
| "Tüm mesajlar / sadece mention'lar / hiç" | ❌    | —                                    |
| Mute kanal/sunucu                         | ❌    | —                                    |
| Mute süresi (15dk, 1sa, ... , forever)    | ❌    | —                                    |
| Web push (browser notif)                  | ❌    | —                                    |
| Mobile push (FCM/APNs)                    | ❌    | —                                    |
| Email digest                              | ❌    | —                                    |
| Bildirim sesleri                          | ❎    | İstemci tarafı                       |

## 17. Arama

| Özellik                             | Durum | Eksik                                     |
| ----------------------------------- | ----- | ----------------------------------------- |
| Mesaj full-text search              | ✅    | ts_vector + GIN                           |
| Sunucu içi arama                    | ✅    | —                                         |
| Kanal içi arama                     | ✅    | —                                         |
| Yazar filtresi                      | ✅    | —                                         |
| Arama: `has:image`                  | ❌    | —                                         |
| Arama: `has:link`                   | ❌    | —                                         |
| Arama: `from:@user`                 | ⚠️    | author_id ile çalışır, username parse yok |
| Arama: `in:#channel`                | ⚠️    | channel_id ile çalışır                    |
| Arama: `before:date` / `after:date` | ❌    | —                                         |
| Arama: `mentions:@user`             | ❌    | —                                         |
| Arama: `has:embed`                  | ❌    | —                                         |
| Arama: `pinned:true`                | ❌    | —                                         |
| Kullanıcı arama (global)            | ❌    | —                                         |
| Sunucu keşif arama                  | ❌    | —                                         |

## 18. Presence & Status

| Özellik                                  | Durum | Eksik            |
| ---------------------------------------- | ----- | ---------------- |
| Online status (gerçek-zaman)             | ✅    | Phoenix Presence |
| Manuel durum (online/idle/dnd/invisible) | ✅    | —                |
| Custom status (emoji + metin)            | ❌    | DB kolonu yok    |
| Custom status süresi                     | ❌    | —                |
| Activity status ("X oynuyor")            | ❌    | —                |
| Rich presence (oyun detay)               | ❌    | —                |
| Spotify "şu an dinliyor"                 | ❌    | —                |
| Streaming on Twitch                      | ❌    | —                |
| Otomatik idle                            | ❌    | —                |
| Mobile online göstergesi                 | ❌    | —                |

## 19. Slash Komutları & Bots

| Özellik                              | Durum | Eksik       |
| ------------------------------------ | ----- | ----------- |
| Slash komutları                      | ❌    | Tamamen yok |
| Application registry                 | ❌    | —           |
| Interaction endpoint                 | ❌    | —           |
| Buttons                              | ❌    | —           |
| Select menus                         | ❌    | —           |
| Modals                               | ❌    | —           |
| Autocomplete                         | ❌    | —           |
| Context menu commands (user/message) | ❌    | —           |
| Bot token verme                      | ❌    | —           |
| OAuth2 (3rd party app login)         | ❌    | —           |
| Application directory                | ❌    | —           |
| Permissions for bots                 | ❌    | —           |
| Bot intents (privileged)             | ❌    | —           |

## 20. Webhooks

| Özellik                             | Durum | Eksik                             |
| ----------------------------------- | ----- | --------------------------------- |
| Webhook oluşturma                   | ❌    | —                                 |
| Webhook ile mesaj atma              | ❌    | —                                 |
| Webhook avatarı/adı override        | ❌    | —                                 |
| Webhook silme                       | ❌    | —                                 |
| Webhook permission (ManageWebhooks) | ⚠️    | Permission flag var, endpoint yok |

## 21. Embed sistem

| Özellik                           | Durum | Eksik                |
| --------------------------------- | ----- | -------------------- |
| Otomatik URL embed (link preview) | ❌    | OG meta scraping yok |
| YouTube embed                     | ❌    | —                    |
| Twitter/X embed                   | ❌    | —                    |
| Image embed                       | ❌    | —                    |
| Bot embed (rich)                  | ❌    | —                    |
| Embed limit (10 per message)      | ❌    | —                    |

## 22. CDN / Storage

| Özellik                            | Durum | Eksik                              |
| ---------------------------------- | ----- | ---------------------------------- |
| Object storage (MinIO/S3)          | ✅    | —                                  |
| Presigned PUT                      | ✅    | —                                  |
| Public bucket                      | ✅    | —                                  |
| CDN cache                          | ❌    | Cloudflare R2 entegrasyonu prod'da |
| Image CDN dönüşüm (resize, format) | ❌    | —                                  |
| Video transcode                    | ❌    | —                                  |
| Streaming uploads (chunked)        | ❌    | —                                  |

## 23. Real-time Olaylar (Gateway)

| Event                           | Discord | Concord | Durum                                                              |
| ------------------------------- | ------- | ------- | ------------------------------------------------------------------ |
| READY (login sonrası)           | ✓       | ❌      | Yok                                                                |
| MESSAGE_CREATE                  | ✓       | ✅      | —                                                                  |
| MESSAGE_UPDATE                  | ✓       | ✅      | —                                                                  |
| MESSAGE_DELETE                  | ✓       | ✅      | —                                                                  |
| MESSAGE_DELETE_BULK             | ✓       | ❌      | —                                                                  |
| MESSAGE_REACTION_ADD            | ✓       | ✅      | (REACTION_ADD)                                                     |
| MESSAGE_REACTION_REMOVE         | ✓       | ✅      | —                                                                  |
| MESSAGE_REACTION_REMOVE_ALL     | ✓       | ❌      | —                                                                  |
| TYPING_START                    | ✓       | ✅      | —                                                                  |
| PRESENCE_UPDATE                 | ✓       | ⚠️      | Phoenix.Presence var ama PRESENCE_UPDATE event'i broadcast etmiyor |
| GUILD_CREATE                    | ✓       | ❌      | —                                                                  |
| GUILD_UPDATE                    | ✓       | ❌      | —                                                                  |
| GUILD_DELETE                    | ✓       | ❌      | —                                                                  |
| GUILD_MEMBER_ADD                | ✓       | ❌      | (üye katıldığında yayın yok)                                       |
| GUILD_MEMBER_REMOVE             | ✓       | ❌      | (kick/ban'da yayın yok)                                            |
| GUILD_MEMBER_UPDATE             | ✓       | ❌      | —                                                                  |
| GUILD_ROLE_CREATE/UPDATE/DELETE | ✓       | ❌      | —                                                                  |
| CHANNEL_CREATE/UPDATE/DELETE    | ✓       | ❌      | —                                                                  |
| CHANNEL_PINS_UPDATE             | ✓       | ❌      | —                                                                  |
| INVITE_CREATE/DELETE            | ✓       | ❌      | —                                                                  |
| USER_UPDATE                     | ✓       | ❌      | (avatar/status değişince yayın yok)                                |
| VOICE_STATE_UPDATE              | ✓       | ⚠️      | Voice service kendi event'i var                                    |
| VOICE_SERVER_UPDATE             | ✓       | ❌      | —                                                                  |
| INTERACTION_CREATE              | ✓       | ❌      | (slash command)                                                    |
| THREAD_CREATE/UPDATE/DELETE     | ✓       | ❌      | —                                                                  |
| WEBHOOKS_UPDATE                 | ✓       | ❌      | —                                                                  |
| NOTIFICATION (Concord özel)     | —       | ✅      | —                                                                  |

## 24. Limits & Rate Limiting

| Özellik                        | Durum | Eksik                    |
| ------------------------------ | ----- | ------------------------ |
| HTTP rate limit (per endpoint) | ❌    | —                        |
| Mesaj rate limit (per user)    | ❌    | Slowmode enforcement yok |
| Login rate limit               | ❌    | Brute-force riski        |
| Upload rate limit              | ❌    | —                        |
| WebSocket connect rate limit   | ❌    | —                        |
| Per-IP rate limit              | ❌    | —                        |
| Bucket-based limits            | ❌    | —                        |

## 25. Mobil / Desktop

| Platform       | Durum | Eksik                               |
| -------------- | ----- | ----------------------------------- |
| Web            | ✅    | Çalışıyor (UI yeniden tasarlanacak) |
| iOS native     | ❌    | —                                   |
| Android native | ❌    | —                                   |
| Windows        | ❌    | (Electron)                          |
| macOS          | ❌    | —                                   |
| Linux          | ❌    | —                                   |

## 26. Compliance & Operations

| Özellik                               | Durum | Eksik                                |
| ------------------------------------- | ----- | ------------------------------------ |
| KVKK uyumu (Türkiye)                  | ❌    | Privacy policy, veri silme, anonim.  |
| 5651 sayılı kanun                     | ❌    | Log saklama 1-2 yıl gereksinimi      |
| BTK uyumu                             | ❌    | İçerik kaldırma süreci               |
| GDPR (AB)                             | ❌    | —                                    |
| Veri ihracı (kullanıcı data download) | ❌    | —                                    |
| Hesap silme + cascade                 | ❌    | —                                    |
| Data retention policy                 | ❌    | —                                    |
| Audit log retention                   | ❌    | —                                    |
| Encryption at rest                    | ⚠️    | PostgreSQL TDE konfigüre edilmemiş   |
| Encryption in transit                 | ⚠️    | HTTP üzerinde dev; prod TLS gerekli  |
| HSTS / CSP                            | ❌    | —                                    |
| Backup / restore                      | ❌    | —                                    |
| Monitoring (Prometheus/Grafana)       | ❌    | —                                    |
| Health probes (liveness/readiness)    | ⚠️    | `/health` var, k8s ayrı endpoint yok |
| Tracing (OpenTelemetry)               | ❌    | —                                    |
| Error reporting (Sentry)              | ❌    | —                                    |

## 27. Ek Discord Özellikleri (Niş)

| Özellik                        | Durum | Eksik               |
| ------------------------------ | ----- | ------------------- |
| Server Templates               | ❌    | —                   |
| Server Discovery               | ❌    | —                   |
| Hubs (eğitim)                  | ❎    | Niche               |
| Quick Switcher (Ctrl+K)        | ❎    | Client              |
| Keyboard Shortcuts             | ❎    | Client              |
| Streamer Mode                  | ❎    | Client              |
| Game Detection (Rich Presence) | ❌    | RPC SDK lazım       |
| Activity (Watch Together vb.)  | ❌    | iframe protocol     |
| Connections (Steam/Twitch/...) | ❌    | OAuth               |
| Nitro paywall                  | ❌    | Tamamen yok         |
| Server subscriptions           | ❌    | Stripe entegrasyonu |
| Soundboard                     | ❌    | —                   |
| Voice messages                 | ❌    | —                   |
| Polls                          | ❌    | —                   |
| Forum tags + filter            | ❌    | —                   |
| Member analytics               | ❌    | —                   |

---

# ÖZET — Discord Paritesi Yüzdesi

**Mevcut:** ~50 endpoint, gerçek bir chat altyapısı + voice SFU + temel moderasyon + arkadaşlık + DM + reactions + attachments + mention + bildirim + arama + pin + markdown + real-time event'lerin yarısı.

**Kategori bazında kapsam:**
| Kategori | Kapsama % |
|---|---|
| Kimlik/Auth | %30 (avatar, profil, 2FA, email verify yok) |
| Sunucular | %40 (CRUD eksik) |
| Kanallar | %40 (temel var; thread/forum/stage yok) |
| Mesajlar | %75 (reply, forward, polls, sesli mesaj yok) |
| Reactions | %80 (custom emoji yok) |
| Voice | %60 (PTT, noise sup, server mute, stage yok) |
| Roller/İzinler | %85 (en güçlü taraf) |
| Moderasyon | %50 (audit log, AutoMod yok) |
| Davetler | %85 (vanity URL yok) |
| Bildirimler | %35 (push, email, channel mute yok) |
| Arama | %55 (filter sözcükleri yok) |
| Slash/Bots | %0 |
| Webhooks | %0 |
| Embed | %0 |
| Thread/Forum/Stage | %5 |
| Real-time eventler | %35 (12/30) |
| Mobile/Desktop | %0 |
| Compliance | %5 |

**Genel ortalama: ~%40 Discord paritesi**

---

# Öncelikli Backlog (Discord paritesi için kritik)

## 🚨 P0 — Olmazsa olmaz, hemen

1. **Mesaj reply** (`replied_to_id` kolonu + endpoint + UI bağlama)
2. **Mention: `@role`, `@everyone`, `@here`** parse + bildirim
3. **Channel/Guild update endpoint'leri** (`PATCH /guilds/:id`, `PATCH /channels/:id`)
4. **Kanal silme** (`DELETE /channels/:id`)
5. **Sunucudan ayrılma** (`DELETE /guilds/:id/members/me`)
6. **Avatar yükleme** (`PATCH /users/me/avatar`)
7. **Login rate limit + bcrypt brute-force koruması**
8. **Real-time guild eventleri**: GUILD*MEMBER_ADD/REMOVE, CHANNEL_CREATE/UPDATE/DELETE, ROLE*\*
9. **Audit log** tablosu + endpoint
10. **Slowmode enforcement** (rate_limit_sec gerçekten çalışsın)

## 🔥 P1 — Önemli

11. **Threads** (parent_channel_id, thread tipi, oto-arşiv)
12. **AutoMod** (anahtar kelime + regex + aksiyon)
13. **Custom server emojis** (yükleme + listesi + reaction)
14. **Webhooks** (oluştur/sil + POST endpoint)
15. **Link preview / embed scraping** (background job)
16. **Voice: server mute/deafen/move, PTT signal, speaking indicator**
17. **Group DM** (3+ kullanıcı)
18. **Read state** (kanal başına son okunan mesaj)
19. **Channel mute / Server mute** (notification settings)
20. **Slash commands** (basic + buttons + selects + modals)

## 💡 P2 — İyi olur

21. **Forum kanalları**
22. **Stage kanalları**
23. **Polls**
24. **Voice messages**
25. **Stickers**
26. **2FA TOTP**
27. **Email doğrulama + parola sıfırlama** (SMTP)
28. **Vanity URL**
29. **Sunucu keşfi**
30. **OAuth2 third-party login**
31. **Custom status + activity**
32. **Push notification (FCM/APNs)**
33. **Email digest**
34. **Audit log filter UI**
35. **Server boost / subscription**
36. **Connections (Twitch/Steam/Spotify)**

## 🌍 P3 — Türkiye Pazarı Özel

37. **KVKK uyum sayfası + veri ihracı endpoint**
38. **5651 log saklama**
39. **BTK içerik kaldırma akışı**
40. **TC kimlik doğrulama (18+ kanal opsiyonel)**
41. **Türkçe içerik moderation modeli**

## ⚙️ Operasyonel (Faz 8+)

42. **Prometheus/Grafana metrics**
43. **OpenTelemetry tracing**
44. **Sentry error reporting**
45. **Rate limiter middleware**
46. **Backup script + restore test**
47. **TLS + HSTS + CSP**
48. **Encryption at rest**
49. **Kubernetes deploy (Türkiye DC)**
50. **CDN (Cloudflare R2 + worker)**

---

# SONUÇ

**Backend tamamlandı mı? Hayır.** Şu an sağlam bir MVP+ omurgası var (~%40 parite). Discord seviyesine ulaşmak için ~50 önemli madde daha eklenmesi lazım.

**En kritik 10 eksik:** P0 listesi. Bunlar olmadan kullanıcılar Discord'a "tam alternatif" demez.

**Ben hangi sırada gideceğim?**

1. Önce P0 (10 madde, ~2-3 gün)
2. Sonra P1 (10 madde, ~1 hafta)
3. P2 sonra (15 madde, ~2 hafta)
4. P3 + operasyonel (Faz 8+ gerçekten production)
