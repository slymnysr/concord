# Concord ↔ Discord — Eksik Özellik & Yol Haritası

> **Amaç:** Concord'u Discord'a karşı işlevsel paritede tutmak. Bu dosya, kodun tamamı taranarak (33 migration, ~40 handler, ~130 route, ~40 frontend bileşeni) çıkarılmıştır.
> **Tarih:** 2026-06 · **Son migration:** 0033 · **Kural:** Görsel kopya değil, işlevsel parite. Concord kendi marka kimliğine sahip.
> **Nasıl kullanılır:** Bölüm 2'deki tabloları önceliğe göre sırayla işleyeceğiz. Bir madde bitince ✅ işaretle.

---

## 1. ✅ Concord'da ZATEN VAR OLANLAR (tekrar yapma!)

**Mesajlaşma:** metin/resim/dosya/ses-mesajı, markdown (bold/italic/underline/strike/code/spoiler/blockquote/`>>>`/heading/list/iç-içe-liste/timestamp `<t:>`/rol-mention/maskelink/subtext/jumbo-emoji/www-link), tepkiler + kimler-verdi + süper-tepki patlaması, yanıt + yanıt-ping toggle, düzenle + (düzenlendi), sil, sabitle + pin paneli, **ilet (kanal seçici)**, **kaydet (yer imi)**, **zamanlanmış mesaj**, **hatırlatıcı**, okunmadı işaretle, mention-highlight, spoiler ek, çoklu-resim grid, link embed (OG unfurl), davet kartı, çift-tık 👍, **@silent**, metin makroları (/shrug /me /tableflip /spoiler), arama (+`from:` operatörü), yazıyor göstergesi (avatarlı), tarih ayraçları, sonsuz kaydırma.

**Ses/Görüntü:** mediasoup SFU, mikrofon/PTT/cihaz seçimi/ses-işleme toggle, kamera, ekran paylaşımı + **"İzle" gate (sadece ekran)**, **kullanıcı-bazlı ses (0-200%)**, **lokal sustur**, **ENFORCED sunucu sustur/sağırlaştır** (mod, voice server seviyesinde) + kendi-kilit UX, **kanala tıkla=katıl**, canlı katılımcı, soundboard + durdurma, konuşma göstergesi, **tam ekran video**, kamera lokal-gizle.

**Sunucu/Moderasyon:** sunucu oluştur (şablon), roller (renk/izin/hoist/mentionable/**ikon**/sürükle-sırala/üye-sayısı), 40+ izin, kanal izin override, kick/ban/timeout (sağ-tık menü), **AutoMod** (7 tetikleyici + aç/kapa), denetim günlüğü (+filtre), davetler (yönetim), emoji/sticker/soundboard yükleme, **slash komut** (oluştur/sil/çalıştır), **reaction roles**, **karşılama/onboarding** (kabul kapısı), vanity URL, doğrulama seviyesi, AFK/sistem kanalı, hassas-içerik-filtresi, sunucu sil, takma ad (kendi + başkası).

**Kanallar:** metin/ses/**forum**/**sahne**/**duyuru**/kategori (oluşturulabilir), **thread** (oluştur/listele/katıl/arşivle), yavaş mod, NSFW, konu, kategori katla, sürükle-sırala, kanal mute.

**Profil/Kullanıcı:** avatar (renk+URL), banner, bio, zamirler, vurgu rengi, **özel durum** (metin+emoji), **profil rozetleri** (bot/doğrulanmış/2FA/erken-üye), **avatar süslemesi**, durum (online/idle/dnd/görünmez), ortak sunucu/arkadaş, arkadaşlık (ekle/kabul/sil/engelle/yoksay/not/şikayet), **2FA/TOTP**, e-posta doğrula, şifre değiştir.

**DM:** 1-1 + grup DM (kişi ekle/çıkar), okunmamış rozeti, davet kartı.

**Platform:** **bildirim gelen-kutusu** (bell, gerçek-zamanlı + jump), masaüstü/ses bildirimi + önizleme + toggle, web-push, gateway (Phoenix WS) + **yeniden bağlanma banner'ı**, **zoom düzeyi**, density (cozy/compact), AMOLED tema, klavye kısayolları (Ctrl+K/Quick Switcher vb.), keşfet (public sunucular), sunucu klasörleri (sürükle), **etkinlikler/scheduled events** (+RSVP), **anketler** (oy/sonuç/anonim/erken-kapat/oy-verenler/gerçek-zamanlı), webhook yönetimi, çoklu-cihaz, F5 kalıcılık.

---


## ➕ EK ÖZELLİKLER (2026-06 yeni tarama — ilk 51 dışı)
İlk 51 gözden geçirildi; çoğu zaten vardı (sunucu klasörleri, `<t:unix>` timestamp markdown vb. mevcut). Bulunan gerçek gaplar:
- **EK-1 Per-user ses seviyesi slider'ı** ✅ BİTTİ: voice.ts altyapısı (GainNode %0-200) vardı ama UI sadece binary mute idi. VoiceConnectedRow sağ-tık menüsüne 0-200% slider eklendi (changeVolume→setUserVolume).
- **EK-2 Mesaja git (jump-to-message)** ✅ BİTTİ: SearchModal sadece kanala zıplıyordu. `concord:jump-to-message` CustomEvent + MessageList dinleyici (elemana kaydır + flash vurgu + yüklü değilse loadOlderMessages fallback); arama/sabit/kayıtlı mesaj hepsi bu ortak handler'ı kullanır.
- **EK-3 Per-kanal bildirim seviyesi** ✅ BİTTİ: kanal sağ-tık menüsüne 'Bildirim Ayarları' alt-menüsü (Tüm Mesajlar / Sadece @bahsetmeler / Hiçbiri); backend notif_level zaten destekliyordu. E2E ✓.
- **EK-4 Yanıt önizleme zıplaması** ✅ BİTTİ: yanıt önizlemesine tıklayınca artık ortak concord:jump-to-message handler'ı (load-older fallback'li) kullanılır; eskiden yüklü olmayan orijinale gidemiyordu.
- **EK-7 GÜVENLİK DENETİMİ: moderasyon/ban/blok — 5 bug** ✅ (2026-06): ban/kick/blok akışları uçtan-uca test edildi, bulunan gerçek bug'lar:
  1. **Moderasyon hiyerarşisi yoktu** → düşük rollü mod, kendinden YÜKSEK rollü üyeyi kick/ban/timeout/voice-mute edebiliyordu. `canModerateTarget` helper'ı eklendi (actor en yüksek rol > target; owner muaf), Ban/Kick/Timeout/SetMemberVoiceState'e uygulandı.
  2. **Banlanan kullanıcı tekrar katılabiliyordu** → AcceptAndJoin ve JoinPublicGuild ban kontrolü yapmıyordu; eklendi (davet+public → 403).
  3. **BlockUser TAMAMEN BOZUK** → her çağrı 500 (`LEAST/GREATEST($1,$2)` tip-çıkarımı bigint kolona text); `::bigint` cast ile düzeltildi.
  4. **UnblockUser sessizce bozuk** → aynı cast bug'ı + `_,_=` hatayı yutuyordu → engel hiç kalkmıyordu; düzeltildi.
  5. **Blok DM'i engellemiyordu** → OpenDM'e blok kontrolü eklendi (her iki yön → 403).
  E2E: ban-hiyerarşi, ban-rejoin, blok/unblock/DM senaryoları geçti. go vet temiz.
- **EK-6 KRİTİK GÜVENLİK: Rol yetki-yükseltme açığı kapatıldı** ✅ (2026-06): İzin sistemi uçtan-uca test edilirken bulundu → **ManageRoles izni olan herhangi bir üye kendine Administrator atayıp sunucuyu ele geçirebiliyordu** (AssignRole sadece ManageRoles kontrol ediyordu, hiyerarşi/yetki kontrolü yoktu). Düzeltmeler: (1) AssignRole/UnassignRole/UpdateRole/DeleteRole'a rol-hiyerarşi kontrolü (kendi en yüksek rolünden düşük olmalı, owner hariç); (2) AssignRole'a "sahip olmadığın izni içeren rolü atayamazsın" alt-küme kontrolü (yanlış sıralamaya karşı savunma); (3) CreateRole/UpdateRole'a yetki-yükseltme engeli (sahip olmadığın izinle rol oluşturma/düzenleme yasak); (4) CreateRole artımlı position atıyor (eskiden hepsi 0 → hiyerarşi anlamsızdı). E2E: 13 güvenlik+meşru-yönetim senaryosu geçti. İzin sisteminin geri kalanı (kanal override'ları, VIEW/SEND deny, admin bypass, kick/ban gating) zaten DOĞRU çalışıyordu (10/10).
- **EK-5 AutoMod derinleştirme + kritik bug-fix** ✅ BİTTİ (2026-06): (1) message_spam trigger'ı backend'de hiç enforce edilmiyordu → Engine.Inspect'e userID + checkMessageSpam (son mesaj sayısı/tekrar) eklendi; artık 7/7 trigger çalışıyor. (2) KRİTİK: frontend action tipi 'block_message' gönderiyordu ama backend 'block' bekliyordu → hiçbir kural engellemiyordu; düzeltildi. (3) mention_spam threshold→max_mentions, caps yüzde→0-1 oran, timeout duration→duration_sec eşleşmeleri düzeltildi. E2E ✓ (kelime+spam engelleme doğrulandı).


## 2. ❌ DISCORD'DA OLAN, SİDCORD'DA EKSİK OLANLAR (öncelikli yol haritası)

> Öncelik: 🔴 Yüksek · 🟡 Orta · 🟢 Düşük/Niş. Efor: S (küçük, <1 saat) · M (orta) · L (büyük, çok-servis).

### 2.1 — Mesajlaşma & İçerik
| # | Özellik | Öncelik | Efor | Not |
|---|---------|---------|------|-----|
| 1 | **GIF seçici (Tenor/Giphy)** | 🔴 | M | ✅ BİTTİ (2026-06): GifPicker (Giphy trending+arama, debounce), MessageInput'a GIF butonu+popover. Seçilen GIF image/gif eki olarak gönderilir (inline render). Key: GIPHY_KEY (localStorage `concord_giphy_key` ile override). |
| 2 | **Forum etiketleri (tags)** | 🟡 | M | ✅ BİTTİ (2026-06): `forum_tags`+`thread_tags` (mig 0035); /channels/:id/forum-tags GET/POST, /forum-tags/:id DELETE; CreateThread `tag_ids`, ListThreads `tag_ids` döndürür; ChannelSettings etiket yöneticisi; ForumView filtre çipleri+post etiketleri+oluştururken seçim. E2E ✓. |
| 3 | **Slash komut argümanları/seçenekleri** | 🟡 | M | ✅ BİTTİ (2026-06): guild_commands.options JSONB (mig 0039); CreateCommand options[], RunCommand args ikamesi ({ad}+{user}, zorunlu kontrol); MentionPicker '/' ipucu (<zorunlu>/[ops]); MessageInput pozisyonel argüman parse; ServerSettings argüman builder. E2E ✓. |
| 4 | **Mesaj düzenleme geçmişi** | 🟢 | M | ✅ BİTTİ (2026-06): message_edits tablosu (mig 0042); EditMessage eski içeriği saklar; GET /messages/:id/edits; MessageList'te (düzenlendi) tıklanır → geçmiş popover'ı (eski sürümler, üstü çizili). E2E ✓.|
| 5 | **Uzun metni .txt dosyası olarak gönder** | 🟢 | S | ✅ BİTTİ (2026-06): MessageInput'ta 2000+ karakter metin otomatik .txt dosyasına çevrilir (Discord davranışı).|
| 6 | **Mesaj çevirisi (translate)** | 🟢 | M | ✅ BİTTİ (2026-06): MessageList sağ-tık '🌐 Çevir' (ücretsiz Google translate endpoint, kaynak otomatik, hedef=arayüz dili); çeviri mesaj altında inline (gizle butonu).|
| 7 | **Toplu mesaj silme (admin bulk-delete)** | 🟡 | S | Moderatör için N mesajı tek seferde sil. |
| 8 | **Arama operatörleri genişlet** (`has:`, `before:`, `after:`, `in:`, `mentions:`) | 🟡 | M | ✅ BİTTİ (2026-06): search.go `has`(link/image/video/sound/file)/`mentions`/`pinned`/`before`/`after`/`during` + metinsiz operatör-only arama; SearchModal tüm operatörleri parse eder (from/mentions/in/has/before/after/pinned) + tıklanır ipucu çipleri. E2E ✓. |
| 9 | **Mesaj forward çoklu hedef + önizleme** | 🟢 | S | ✅ BİTTİ (2026-06): ForwardModal çoklu-seç (checkbox) + iletilen mesaj önizleme kartı + opsiyonel yorum + tek 'İlet (N)' butonu (Promise.all forwarded_from_message_id ile).|
| 10 | **Sticker/emoji otomatik öneri** (yazarken) | 🟢 | M | ✅ BİTTİ (2026-06): MessageInput'ta kısa tek kelime yazılınca eşleşen sunucu sticker'ları öneri şeridinde gösterilir (tıkla→gönder+temizle); sticker'lar artık guildId değişince yüklenir (sadece picker açıkken değil).|

### 2.2 — Ses & Görüntü
| # | Özellik | Öncelik | Efor | Not |
|---|---------|---------|------|-----|
| 11 | **Sahne (Stage) konuşmacı yönetimi** | 🔴 | L | ✅ BİTTİ (2026-06): StageView (konuşmacı grid + dinleyici listesi + topic), "🖐 Konuşma İste" (el kaldır), mod "Konuşmacı yap/Dinleyiciye al", "Konuşmaya başla", dinleyici oto-mute. Voice server room.stageSpeakers/stageHands + signaling (stageHand/stageSpeaker broadcast + join sync). Enforcement client-cooperative (follow-up: voice-server zorla). |
| 12 | **Video grid düzeni / "odak" (kişiyi büyüt)** | 🟡 | M | Tek tıkla bir yayını ana ekran yap, diğerleri küçük. Grid/focus toggle. |
| 13 | **Ekran paylaşım kalitesi seçimi** (720p/1080p/kaynak/fps) | 🟡 | S | getDisplayMedia constraint'leri ayarlanabilir olsun. |
| 14 | **Ses aktivite eşiği (sensitivity) slider** | 🟡 | M | PTT var; ses-aktivitesi modunda eşik ayarı yok (analyser ile). |
| 15 | **"Kullanıcıyı taşı" (başka ses kanalına)** | 🟡 | S | MOVE_MEMBERS izni var; UI/endpoint yok. |
| 16 | **Sunucu-mute DB kalıcılığı** | 🟡 | M | ✅ BİTTİ (2026-06): `guild_voice_states` (mig 0036); SetMemberVoiceState DB'ye UPSERT (kısmi koru, ikisi de false→sil); GET /guilds/:id/voice-states (üye rozetleri) + GET /voice-internal/state (secret'lı, voice server join'de çeker→restart durabilitesi). E2E ✓. |
| 17 | **Video arka plan bulanıklaştırma/efekt** | 🟢 | L | ✅ BİTTİ (2026-06-10): @mediapipe/tasks-vision selfie segmentation; videoEffects.ts canvas composite (kişi keskin + blur(14px)) → captureStream → producer; voice.setVideoBlur canlı replaceTrack; "✨ Blur" butonu + VoiceTab toggle. |
| 18 | **Çağrı (DM voice/video call)** | 🟡 | M | DM'de "Ara" butonu — ses kanalı mantığı DM'e taşınır. |

### 2.3 — Kanallar
| # | Özellik | Öncelik | Efor | Not |
|---|---------|---------|------|-----|
| 19 | **Thread yan paneli** | 🟡 | M | Thread şu an tam kanal olarak açılıyor; Discord'da ana kanalın yanında panel olarak. |
| 20 | **Duyuru kanalı "yayınla" + takip** (cross-post) | 🟢 | L | ✅ BİTTİ (2026-06-10): mig 0048 channel_follows + published_at; follow/crosspost/follows/delete endpoint'leri; webhook-görünümlü iletim; "Takip Et" + "📣 Yayınla" + rozet + ServerSettings sekmesi. E2E ✓. |
| 21 | **Kanal oluştururken konu (topic) + özel izin** | 🟢 | S | ✅ BİTTİ (2026-06): CreateChannelModal'a Konu (topic) alanı (kategori/ses hariç); backend CreateChannel zaten topic kabul ediyordu, api.channels.create topic parametresi eklendi.|
| 22 | **Media kanalı** (galeri görünümü) | 🟢 | M | ✅ BİTTİ (2026-06): MediaView (galeri grid + lightbox, mesaj eklerinden görsel/video toplar); App.tsx media branch; CreateChannelModal'a Medya tipi; backend validChannelType+media. E2E ✓.|
| 23 | **Kanal bildirim override** (kanal-bazlı seviye) | 🟡 | S | Notif-settings var; UI'da kanal-bazlı "tümü/mention/hiç" net değil. |

### 2.4 — Sunucu Yönetimi & Moderasyon
| # | Özellik | Öncelik | Efor | Not |
|---|---------|---------|------|-----|
| 24 | **Üyelik tarama / onboarding soruları** | 🟡 | L | ✅ BİTTİ (2026-06): guild_welcome.onboarding_prompts JSONB (mig 0047, [{id,title,options:[{id,label,emoji,role_ids}]}]); AcceptOnboarding selected_option_ids→rol atama; OnboardingGate ilgi seçim UI; WelcomeTab prompt+seçenek+rol builder. E2E ✓. |
| 25 | **Doğrulama: kural kabul kapısı (rules screening)** | 🟡 | M | ✅ KAPSANDI (2026-06-10 doğrulandı): rules_text + require_accept + OnboardingGate tam ekran kabul akışı + WelcomeTab editörü mevcut. |
| 26 | **Server insights / analizler** | 🟢 | L | ✅ BİTTİ (2026-06): GET /guilds/:id/insights (ManageGuild) — mevcut veriden üye/mesaj sayıları, 7g/30g, en-aktif kanal/üye (30g), 14-günlük üye-büyüme + mesaj-aktivite serileri; ServerSettings 'İstatistikler' sekmesi (kartlar+çubuk grafik+top listeler). E2E ✓. |
| 27 | **Otomatik rol** (katılınca rol ver) | 🟡 | S | ✅ BİTTİ (2026-06): `guilds.auto_role_id` (mig 0034) + ServerSettings>Genel'de rol seçici; AcceptInvite & JoinPublicGuild'de `applyAutoRole` (AssignToMember + GUILD_MEMBER_UPDATE). |
| 28 | **Zamanlı etkinlik bildirimleri / hatırlatma** | 🟢 | S | ✅ BİTTİ (2026-06): guild_events.reminder_sent (mig 0040); ticker DispatchDueEventReminders (15dk kala abonelere bir kez NOTIFICATION yayar). E2E ✓.|
| 29 | **Ban listesi: arama + toplu** | 🟢 | S | ✅ BİTTİ (2026-06): BansTab arama (ID/sebep) + çoklu-seç checkbox + toplu banı kaldır (Promise.all unban).|
| 30 | **Denetim günlüğü: ses-mod aksiyonları** | 🟢 | S | ✅ BİTTİ (2026-06): audit_action enum'a voice_mute/voice_deafen (mig 0041); SetMemberVoiceState logAudit çağrısı. E2E ✓.|

### 2.5 — Profil & Kullanıcı
| # | Özellik | Öncelik | Efor | Not |
|---|---------|---------|------|-----|
| 31 | **Özel durum süre sonu** (30dk/1sa/bugün/özel) | 🟡 | S | ✅ BİTTİ (2026-06): status PATCH `clear_after_seconds`; CustomStatusTab süre dropdown (bugün/30dk/1sa/4sa/24sa/süresiz); ticker `ClearExpiredCustomStatuses`; repo+me `custom_status_expires_at` döndürür. E2E ✓. |
| 32 | **Per-sunucu profil** (sunucu-bazlı avatar/banner/bio) | 🟡 | M | ✅ BİTTİ (2026-06): guild_members'a `guild_avatar_url`+`guild_bio` (mig 0037); PATCH /guilds/:id/members/me/profile (nick+avatar+bio, kısmi); members listesi alanları döndürür; GuildProfileModal (avatar yükleme+nick+bio); üye listesinde guild avatar render. E2E ✓. |
| 33 | **Bağlı hesaplar (connections)** | 🟢 | M | ✅ BİTTİ (2026-06-10): mig 0049 user_connections; CRUD + görünürlük + GitHub OAuth (env ile); profil çipleri (UserProfileCard+DMUserPanel); UserSettings "Bağlantılar". E2E ✓. |
| 34 | **Profil "etkinlik/oynuyor" (rich presence)** | 🟢 | L | ✅ BİTTİ (2026-06-10): Presence meta.activity (gateway handle_in); setActivity + localStorage; üye listesi "🎮 X oynuyor" + profil aktivite kartı + ActivitySection UI. WS E2E ✓. |
| 35 | **Avatar GIF/animasyon** | 🟢 | S | ✅ BİTTİ (2026-06): Mesaj avatarı artık avatar_url'i <img> ile render eder (GIF avatarlar otomatik animasyonlu); yoksa renk+baş harf. Avatar upload zaten image/* (gif) kabul ediyordu.|
| 36 | **Hesabı devre dışı bırak / sil** | 🟡 | S | ✅ BİTTİ (2026-06): DELETE /users/me (parola onayı, sahip-sunucu engeli); anonimleştirme (PII temizle, deleted_at, login engelle), tüm oturumları iptal; AccountTab Tehlikeli Bölge + parola onayı. mig 0043. E2E ✓.|
| 37 | **Aktif oturumlar / cihaz yönetimi** | 🟡 | M | ✅ BİTTİ (2026-06): GET/DELETE `/users/me/sessions(/:id)`; authResp `session_id` (istemci localStorage'da saklar→"BU CİHAZ"); AccountTab oturum listesi (UA→cihaz/tarayıcı), tekil+"diğerlerini kapat". E2E ✓. |

### 2.6 — Bildirimler & DM
| # | Özellik | Öncelik | Efor | Not |
|---|---------|---------|------|-----|
| 38 | **Sessize alma süreleri** (15dk/1sa/8sa/24sa/açana kadar) | 🟡 | S | ✅ BİTTİ (2026-06): backend `mute_until_sec`→`muted_until` zaten vardı; kanal+sunucu sağ-tık menüsüne süre alt-menüsü (15dk/1sa/3sa/8sa/24sa/açana kadar) + unmute. |
| 39 | **Bildirim: anahtar-kelime / role mention ayarı** | 🟢 | M | ✅ BİTTİ (2026-06): user_keywords tablosu (mig 0044); notifyKeywords (mesajda kelime geçince üyeye 'keyword' bildirimi, case-insensitive); GET/PUT /users/me/keywords; NotificationsTab anahtar-kelime yöneticisi. E2E ✓.|
| 40 | **DM istekleri / mesaj filtreleme** | 🟡 | M | ✅ BİTTİ (2026-06): users.allow_dms_from (mig 0046, everyone|friends); OpenDM'de 'friends' ise arkadaş+mevcut-DM kontrolü (403 dm_restricted); GET/PUT /users/me/privacy; AccountTab Gizlilik bölümü; MemberList/UserProfileCard 403 toast. E2E ✓.|
| 41 | **Okundu işaretleyiciler / "yazıyor" DM'de** | 🟢 | S | ✅ BİTTİ (2026-06): dm_channel.ex handle_in('typing')→broadcast TYPING_START; gateway.ts joinDMChannel/leaveDMChannel/sendDMTyping; App.tsx DM kanalına katıl→setTyping; MessageInput DM modunda sendDMTyping. Guild typing yolunu birebir izler (compile+tsc temiz).|

### 2.7 — Platform, Erişilebilirlik & Tema
| # | Özellik | Öncelik | Efor | Not |
|---|---------|---------|------|-----|
| 42 | **MOBİL RESPONSIVE** | 🔴 | L | 🟢 ÇEKİRDEK BİTTİ (2026-06): sol kolonlar mobilde çekmece (hamburger+backdrop), üye listesi sağ çekmece (mobilde kapalı default), tam-ekran modaller + ikon-only ayar menüsü, kanal değişince çekmece kapanır, viewport meta var. Kalan polish: DM sidebar geçişi, ses kontrolleri mobil, dokunmatik jestler. |
| 43 | **Çoklu dil / i18n** | 🟡 | L | ✅ ALTYAPI BİTTİ (2026-06): i18n.ts (tr varsayılan + en sözlükler, `t(key,params)`, getLocale/setLocale-reload, LOCALES); AppearanceTab dil seçici (🇹🇷/🇬🇧) + tema/yoğunluk/dil başlıkları t()'ye taşındı; ayar sekme etiketleri t(). Kalan ~40 bileşenin metinleri kademeli olarak t() ile sarmalanacak (altyapı hazır). |
| 44 | **Açık (Light) tema** + tema renkleri | 🟡 | M | ✅ BİTTİ (2026-06): Tailwind renk token'ları CSS değişkenine çevrildi (`rgb(var(--c-*) / <alpha>)`); styles.css `:root`/light/amoled var setleri; AppearanceTab ☀️ Aydınlık seçeneği (3 sütun); main.tsx açılışta uygular. |
| 45 | **Erişilebilirlik (a11y)** | 🟡 | M | ✅ TEMEL BİTTİ (2026-06): ~76 icon-buton'a aria-label (title'lardan); styles.css global :focus-visible halkası + prefers-reduced-motion + .sr-only; Modal role=dialog/aria-modal. (Tam WCAG denetimi artımlı sürer.) |
| 46 | **Masaüstü uygulaması paketleme** (Electron/Tauri) | 🟢 | L | `apps/desktop` var; tam paketleme/oto-güncelleme. |
| 47 | **Mobil uygulama** (`apps/mobile`) | 🟢 | L | RN iskeleti var; tamamlama. |
| 48 | **Klavye kısayolları genişlet** (kanal nav, mark-read, vb.) | 🟢 | S | ✅ BİTTİ (2026-06): App.tsx Ctrl/Cmd+Alt+↑/↓ sunucu navigasyonu + Esc ile kanalı okundu işaretle (input/modal yokken); Alt+↑/↓ kanal nav ctrl/meta guard'ı eklendi.|

### 2.8 — Bot / Geliştirici / İçerik
| # | Özellik | Öncelik | Efor | Not |
|---|---------|---------|------|-----|
| 49 | **Zengin embed (rich embed) builder** | 🟡 | M | ✅ BİTTİ (2026-06): message_embeds.payload JSONB (mig 0038); CreateMessage+ExecuteWebhook `embeds[]`→storeRichEmbeds; ListByChannel inline embeds döndürür (batch); RichEmbeds renderer (renk şeridi/author/alanlar/footer/görsel); EmbedBuilderModal (MessageInput'ta canlı önizlemeli builder). E2E ✓. |
| 50 | **Bot hesapları / OAuth uygulamaları** | 🟢 | L | ✅ BİTTİ (2026-06-10): mig 0050 applications; Bot token auth (RequireAuth "Bot " prefix); app CRUD + reset + sunucuya ekleme + bot-session JWT (gateway); "Geliştirici" sekmesi; docs/BOT_API.md. E2E ✓. |
| 51 | **Webhook: avatar/isim override + embed** | 🟢 | S | ✅ BİTTİ (2026-06): message_webhook tablosu (mig 0045); ExecuteWebhook isim/avatar override kalıcı + mesajda inline; ListByChannel batch yükler; MessageList webhook isim/avatar render + WEBHOOK rozeti. E2E ✓.|

### 2.9 — Düşük öncelik / Discord'a özgü (muhtemelen atlanır)
- Nitro/abonelik, sunucu takviye (boost), boost seviyeleri/avantajları
- Mağaza/uygulama dizini, oyun kütüphanesi
- AutoMod ML (akıllı spam), topluluk büyüme araçları
- Süper-tepki (paid), profil temaları (paid), animasyonlu emoji (Nitro)
- Sesli kanal etkinlikleri/aktiviteler (YouTube birlikte izle vb.)

---

## 3. 🎯 ÖNERİLEN SIRA (planlı ilerleme)

**Faz 1 — Olmazsa olmaz (🔴):**
1. **Mobil responsive** (#42) — en büyük etki, app'i her cihazda kullanılır yapar.
2. **Stage konuşmacı yönetimi** (#11) — sahne kanalları yarım.
3. **GIF seçici** (#1) — günlük kullanım.

**Faz 2 — Yüksek değer (🟡):**
4. Light tema (#44) + i18n altyapısı (#43)
5. Özel durum süre sonu (#31) + sessize-alma süreleri (#38) + otomatik rol (#27)
6. Forum etiketleri (#2) + slash argümanları (#3)
7. Sunucu-mute DB kalıcılığı (#16) + ses kalite/eşik (#13, #14) + kullanıcı taşı (#15)
8. Per-sunucu profil (#32) + aktif oturumlar (#37) + hesap sil (#36)
9. Zengin embed (#49) + arama operatörleri (#8) + bulk-delete (#7)
10. DM çağrı (#18) + thread paneli (#19)

**Faz 3 — Tamamlayıcı (🟢):**
- Mesaj düzenleme geçmişi, .txt gönderim, media kanalı, onboarding soruları, server insights, mesaj çevirisi, erişilebilirlik, masaüstü/mobil paketleme.

**Atlanacaklar:** Nitro/boost/mağaza/bot-API gibi ticari/devasa Discord'a özgü şeyler (işlevsel parite hedefi dışında).

---

## 4. Notlar
- **Tekrarlayan backend bug paterni:** struct'a json alanı eklenip SELECT'e eklenmezse asla dönmez. Yeni alan = mutlaka ilgili SELECT + Scan güncelle.
- **JWT_SECRET:** API ve gateway aynı olmalı (config default'lar eşitlendi).
- **VOICE_CONTROL_SECRET:** API↔voice server arası (default `dev_voice_control_secret_change_me`).
- **Migration:** psql ile uygula + `INSERT INTO schema_migrations (version,dirty) VALUES (N,false)`.
- **Servisler:** API:8080 · Gateway:4000 · Voice WS:4443 / HTTP:4444 · Web:3000 · PG:5433.

---

## 3. GERÇEK-KOD DENETİMİ (2026-06-10) — "işlevsiz ayar" taraması

MD'lerden bağımsız tam kod denetimi yapıldı; aşağıdaki eksikler bulunup **tamamlandı**:

| Eksik | Durum |
|---|---|
| Şifre sıfırlama + e-posta altyapısı (SMTP yoktu, VerifyMyEmail sahteydi) | ✅ MailHog+mailer+mig 0051; forgot/reset/verify/değiştir akışları, AuthPage+AccountTab UI |
| Görünmez durum (gateway "online" hardcode'luydu) | ✅ Presence join params + status handler; idle/dnd canlı renkler bonus |
| Vanity URL (kolon vardı, çözümleme yoktu) | ✅ GetInvite/AcceptInvite vanity fallback |
| Verification level (enforce yoktu) | ✅ content_gate.go L1-L4 (e-posta/hesap yaşı/üyelik/2FA), sahip+rollü muaf |
| Explicit content filter (enforce yoktu) | ✅ Token bazlı TR/EN filtre, NSFW muaf, L1/L2 kapsam |
| Katılım sistem mesajı (system_channel boştaydı) | ✅ mig 0052 messages.system + 4 katılım noktası + UI render |
| Ban'de mesaj silme | ✅ delete_message_hours (≤7 gün) |
| Ses kanalı limiti/bitrate (kolon vardı, davranış+UI yoktu) | ✅ can-join endpoint + voice reject + opus bitrate + ChannelEdit UI + N/limit rozeti |
| Ekran paylaşımı sesi | ✅ screen-audio producer + izleme kapısına bağlı |
| Yayın kalitesi seçici | ✅ 480/720/1080 × 15/30/60 + maxBitrate (simulcast değil, bilinçli) |
| AFK kanalı (kolon vardı, davranış yoktu) | ✅ mig 0053 afk_timeout_sec + istemci tarafı taşıma + ayar UI |
| Grup DM yönetimi (backend vardı, UI eksikti) | ✅ yeniden adlandır + sahip çıkarma + 👑; owner_id listede |
| DM araması (backend vardı, UI bağlı değildi) | ✅ SearchModal DM modu |

**Bilinçli kapsam dışı (niş):** TTS mesajları, sunucu şablonları, üye prune, OAuth2 provider ("Concord ile giriş"), otomatik oyun algılama (masaüstü uygulamasına), video simulcast.

## 4. KALİTE TURU (2026-06-11) — motorların tam kapasitesi

| İş | Durum |
|---|---|
| mediasoup çoklu worker (CPU başına; önceden tek çekirdek) | ✅ |
| AV1/VP9 codec'leri + cihaza göre otomatik seçim | ✅ |
| Simulcast/SVC (zayıf ağda otomatik katman düşürme) | ✅ |
| Opus FEC (paket kaybı direnci) | ✅ |
| 🎵 Müzik modu (stereo, 128k+, işleme kapalı) | ✅ |
| 🤖 RNNoise gelişmiş gürültü engelleme (WASM) | ✅ |
