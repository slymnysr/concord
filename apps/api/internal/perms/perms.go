// Concord permission bitmask sistemi (Discord modeline yakın)
package perms

// Permission bitleri — 64-bit bitmask
const (
	// Genel
	CreateInvite    uint64 = 1 << 0
	KickMembers     uint64 = 1 << 1
	BanMembers      uint64 = 1 << 2
	Administrator   uint64 = 1 << 3 // her şeyi yapabilir
	ManageChannels  uint64 = 1 << 4
	ManageGuild     uint64 = 1 << 5
	AddReactions    uint64 = 1 << 6
	ViewAuditLog    uint64 = 1 << 7
	PrioritySpeaker uint64 = 1 << 8
	Stream          uint64 = 1 << 9

	// Metin
	ViewChannel        uint64 = 1 << 10
	SendMessages       uint64 = 1 << 11
	SendTTSMessages    uint64 = 1 << 12
	ManageMessages     uint64 = 1 << 13
	EmbedLinks         uint64 = 1 << 14
	AttachFiles        uint64 = 1 << 15
	ReadMessageHistory uint64 = 1 << 16
	MentionEveryone    uint64 = 1 << 17
	UseExternalEmojis  uint64 = 1 << 18
	ViewGuildInsights  uint64 = 1 << 19

	// Sesli
	Connect       uint64 = 1 << 20
	Speak         uint64 = 1 << 21
	MuteMembers   uint64 = 1 << 22
	DeafenMembers uint64 = 1 << 23
	MoveMembers   uint64 = 1 << 24
	UseVAD        uint64 = 1 << 25 // voice activity detection

	// Diğer
	ChangeNickname         uint64 = 1 << 26
	ManageNicknames        uint64 = 1 << 27
	ManageRoles            uint64 = 1 << 28
	ManageWebhooks         uint64 = 1 << 29
	ManageEmojis           uint64 = 1 << 30
	UseApplicationCommands uint64 = 1 << 31
	RequestToSpeak         uint64 = 1 << 32
	ManageThreads          uint64 = 1 << 33
	CreatePublicThreads    uint64 = 1 << 34
	CreatePrivateThreads   uint64 = 1 << 35
	UseExternalStickers    uint64 = 1 << 36
	SendMessagesInThreads  uint64 = 1 << 37
	UseEmbeddedActivities  uint64 = 1 << 38
	ModerateMembers        uint64 = 1 << 39 // timeout
)

// Has — verilen permission'ı içeriyor mu (Administrator her şeyi geçer)
func Has(have, want uint64) bool {
	if have&Administrator != 0 {
		return true
	}
	return have&want == want
}

// Combine — birden fazla rolün bitmask'lerini birleştirir
func Combine(masks ...uint64) uint64 {
	var out uint64
	for _, m := range masks {
		out |= m
	}
	return out
}

// Tüm permission'lar (admin) — ayar kolaylığı için
const All = 0xFFFFFFFFFF

// Names — debug + UI için
var Names = map[uint64]string{
	CreateInvite:           "DAVET_OLUŞTUR",
	KickMembers:            "ÜYE_AT",
	BanMembers:             "ÜYE_BANLA",
	Administrator:          "YÖNETİCİ",
	ManageChannels:         "KANALLARI_YÖNET",
	ManageGuild:            "SUNUCUYU_YÖNET",
	AddReactions:           "TEPKİ_EKLE",
	ViewAuditLog:           "DENETİM_KAYDI_GÖR",
	PrioritySpeaker:        "ÖNCELİKLİ_KONUŞMACI",
	Stream:                 "YAYIN_AÇ",
	ViewChannel:            "KANAL_GÖR",
	SendMessages:           "MESAJ_GÖNDER",
	ManageMessages:         "MESAJ_YÖNET",
	EmbedLinks:             "BAĞLANTI_GÖMME",
	AttachFiles:            "DOSYA_EKLE",
	ReadMessageHistory:     "MESAJ_GEÇMİŞİ_OKU",
	MentionEveryone:        "EVERYONE_BAHSET",
	Connect:                "SESLİ_KATIL",
	Speak:                  "KONUŞ",
	MuteMembers:            "ÜYELERİ_SUSTUR",
	DeafenMembers:          "ÜYELERİ_SAĞIRLAŞTIR",
	MoveMembers:            "ÜYELERİ_TAŞI",
	UseVAD:                 "SES_AKTİVASYONU",
	ChangeNickname:         "TAKMA_AD_DEĞİŞTİR",
	ManageNicknames:        "TAKMA_ADLARI_YÖNET",
	ManageRoles:            "ROLLERİ_YÖNET",
	ManageWebhooks:         "WEBHOOK'LARI_YÖNET",
	ManageEmojis:           "EMOJİLERİ_YÖNET",
	UseApplicationCommands: "SLASH_KOMUTU_KULLAN",
	ModerateMembers:        "MODERATION_TIMEOUT",
}
