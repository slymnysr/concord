package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/concord/api/internal/auth"
	"github.com/concord/api/internal/handlers"
	mw "github.com/concord/api/internal/middleware"
)

func New(h *handlers.Handler, iss *auth.Issuer) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Compress(5))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "https://*.concord.com"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", h.Health)
	r.Get("/version", h.Version)

	r.Route("/api/v1", func(r chi.Router) {
		// Anonim
		r.Post("/auth/register", h.Register)
		r.Post("/auth/login", h.Login)
		r.Post("/auth/refresh", h.Refresh)
		// Şifre sıfırlama + e-posta doğrulama (mail bağlantıları, anonim)
		r.Post("/auth/forgot-password", h.ForgotPassword)
		r.Post("/auth/reset-password", h.ResetPassword)
		r.Get("/auth/verify-email", h.ConfirmEmailVerify)
		// Voice server → API (x-voice-secret ile korunur, kullanıcı JWT'si yok)
		r.Get("/voice-internal/state", h.GetPersistedVoiceStateInternal)
		r.Get("/voice-internal/can-join", h.CanJoinVoiceInternal)
		// GitHub OAuth dönüşü (tarayıcı yönlendirmesi; kullanıcı state ile eşlenir)
		r.Get("/connections/github/callback", h.GitHubCallback)

		// Auth gerekli
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireAuth(iss, h.ResolveBotToken))

			r.Get("/users/me", h.Me)
			r.Patch("/users/me/status", h.UpdateMyStatus)
			r.Get("/users/{userID}", h.GetUserPublic)

			// Hesap bağlantıları (Connections)
			r.Get("/users/me/connections", h.ListMyConnections)
			r.Post("/users/me/connections", h.CreateConnection)
			r.Patch("/users/me/connections/{connectionID}", h.UpdateConnection)
			r.Delete("/users/me/connections/{connectionID}", h.DeleteConnection)
			r.Get("/connections/github/authorize", h.GitHubAuthorize)

			r.Post("/guilds", h.CreateGuild)
			r.Get("/guilds", h.ListMyGuilds)
			r.Get("/discover/guilds", h.DiscoverGuilds)
			r.Post("/discover/guilds/{id}/join", h.JoinPublicGuild)
			r.Get("/guilds/{id}", h.GetGuild)
			r.Get("/guilds/{id}/channels", h.ListGuildChannels)
			r.Get("/guilds/{id}/members", h.ListGuildMembers)
			r.Post("/guilds/{id}/invites", h.CreateInvite)
			r.Get("/guilds/{id}/invites", h.ListGuildInvites)
			r.Get("/guilds/{id}/roles", h.ListRoles)
			r.Post("/guilds/{id}/roles", h.CreateRole)
			r.Patch("/guilds/{id}/roles/{roleID}", h.UpdateRole)
			r.Delete("/guilds/{id}/roles/{roleID}", h.DeleteRole)
			r.Patch("/guilds/{id}/members/me/profile", h.SetMyGuildProfile)
			r.Patch("/guilds/{id}/members/{userID}/nickname", h.SetMemberNickname)
			r.Put("/guilds/{id}/members/{userID}/roles/{roleID}", h.AssignRole)
			r.Delete("/guilds/{id}/members/{userID}/roles/{roleID}", h.UnassignRole)

			r.Get("/invites/{code}", h.GetInvite)
			r.Post("/invites/{code}/accept", h.AcceptInvite)
			r.Delete("/invites/{code}", h.DeleteInvite)

			r.Post("/channels", h.CreateChannel)
			r.Get("/channels/{channelID}/messages", h.ListMessages)
			r.Post("/channels/{channelID}/messages", h.CreateMessage)
			r.Patch("/messages/{messageID}", h.EditMessage)
			r.Delete("/messages/{messageID}", h.DeleteMessage)
			r.Get("/messages/{messageID}/edits", h.GetMessageEdits)
			r.Get("/channels/{channelID}/overrides", h.ListChannelOverrides)
			r.Put("/channels/{channelID}/overrides", h.UpsertChannelOverride)
			r.Delete("/channels/{channelID}/overrides/{targetType}/{targetID}", h.DeleteChannelOverride)

			r.Get("/users/me/channels", h.ListMyDMs)
			r.Post("/users/me/channels", h.OpenDM)

			r.Delete("/guilds/{id}/members/{userID}", h.KickMember)
			r.Patch("/guilds/{id}/members/{userID}/timeout", h.TimeoutMember)
			r.Patch("/guilds/{id}/members/{userID}/voice", h.SetMemberVoiceState)
			r.Get("/guilds/{id}/voice-states", h.ListGuildVoiceStates)
			r.Get("/guilds/{id}/bans", h.ListBans)
			r.Put("/guilds/{id}/bans/{userID}", h.BanMember)
			r.Delete("/guilds/{id}/bans/{userID}", h.Unban)

			r.Get("/messages/{messageID}/reactions", h.ListReactions)
			r.Get("/messages/{messageID}/reactions/{emoji}/users", h.ListReactionUsers)
			r.Put("/messages/{messageID}/reactions/{emoji}", h.AddReaction)
			r.Delete("/messages/{messageID}/reactions/{emoji}", h.RemoveReaction)

			// Anketler (Polls)
			r.Post("/channels/{channelID}/polls", h.CreatePoll)
			r.Get("/messages/{messageID}/poll", h.GetMessagePoll)
			r.Put("/polls/{pollID}/answers/{answerID}/vote", h.VotePoll)
			r.Delete("/polls/{pollID}/answers/{answerID}/vote", h.UnvotePoll)
			r.Post("/polls/{pollID}/close", h.ClosePoll)
			r.Get("/polls/{pollID}/answers/{answerID}/voters", h.ListPollVoters)

			// Kaydedilen mesajlar (yer imleri)
			r.Get("/users/me/saved-messages", h.ListSavedMessages)
			r.Put("/messages/{messageID}/save", h.SaveMessage)
			r.Delete("/messages/{messageID}/save", h.UnsaveMessage)

			// Zamanlanmış mesajlar
			r.Get("/channels/{channelID}/scheduled-messages", h.ListScheduledMessages)
			r.Post("/channels/{channelID}/scheduled-messages", h.CreateScheduledMessage)
			r.Delete("/scheduled-messages/{schedID}", h.DeleteScheduledMessage)

			// Hatırlatıcılar (Beni Hatırlat)
			r.Get("/users/me/reminders", h.ListReminders)
			r.Post("/messages/{messageID}/remind", h.CreateReminder)
			r.Delete("/reminders/{reminderID}", h.DeleteReminder)

			// İki adımlı doğrulama (2FA / TOTP)
			r.Post("/users/me/2fa/enable", h.Enable2FA)
			r.Post("/users/me/2fa/verify", h.Verify2FA)
			r.Post("/users/me/2fa/disable", h.Disable2FA)

			r.Get("/guilds/{id}/reaction-roles", h.ListReactionRoles)
			r.Post("/guilds/{id}/reaction-roles", h.CreateReactionRole)
			r.Delete("/reaction-roles/{id}", h.DeleteReactionRole)

			r.Get("/guilds/{id}/welcome", h.GetGuildWelcome)
			r.Patch("/guilds/{id}/welcome", h.UpdateGuildWelcome)
			r.Post("/guilds/{id}/onboarding/accept", h.AcceptOnboarding)

			r.Post("/uploads/presign", h.PresignUpload)

			r.Get("/notifications", h.ListNotifications)
			r.Get("/notifications/count", h.NotificationsCount)
			r.Post("/notifications/read-all", h.MarkAllNotificationsRead)

			r.Get("/friends", h.ListFriends)
			r.Post("/friends", h.SendFriendRequest)
			r.Put("/friends/{userID}/accept", h.AcceptFriend)
			r.Delete("/friends/{userID}", h.RemoveFriend)
			r.Put("/users/{userID}/block", h.BlockUser)
			r.Delete("/users/{userID}/block", h.UnblockUser)
			r.Post("/users/{userID}/report", h.ReportUser)
			r.Get("/users/{userID}/note", h.GetUserNote)
			r.Put("/users/{userID}/note", h.SetUserNote)
			r.Patch("/users/me/password", h.ChangePassword)

			r.Get("/search/messages", h.SearchMessages)

			r.Get("/channels/{channelID}/pins", h.ListPins)
			r.Put("/messages/{messageID}/pin", h.PinMessage)
			r.Delete("/messages/{messageID}/pin", h.UnpinMessage)

			// P0 yeni endpoint'ler
			r.Patch("/users/me", h.UpdateMe)
			r.Post("/users/me/verify-email", h.VerifyMyEmail)
			r.Post("/users/me/email", h.ChangeEmail)
			r.Delete("/users/me", h.DeleteMyAccount)
			// DM gizliliği
			r.Get("/users/me/privacy", h.GetMyPrivacy)
			r.Put("/users/me/privacy", h.UpdateMyPrivacy)
			// Anahtar kelime bildirimleri
			r.Get("/users/me/keywords", h.ListMyKeywords)
			r.Put("/users/me/keywords", h.SetMyKeywords)
			// Aktif oturumlar (cihazlar)
			r.Get("/users/me/sessions", h.ListMySessions)
			r.Delete("/users/me/sessions", h.RevokeOtherSessions)
			r.Delete("/users/me/sessions/{sessionID}", h.RevokeMySession)
			r.Patch("/guilds/{id}", h.UpdateGuild)
			r.Delete("/guilds/{id}", h.DeleteGuild)
			r.Post("/guilds/{id}/leave", h.LeaveGuild)
			r.Patch("/channels/{channelID}", h.UpdateChannel)
			r.Delete("/channels/{channelID}", h.DeleteChannel)
			r.Get("/guilds/{id}/audit-log", h.ListAuditLogs)
			r.Get("/guilds/{id}/insights", h.GetGuildInsights)

			// P1: Threads
			r.Post("/channels/{channelID}/threads", h.CreateThread)
			r.Get("/channels/{channelID}/threads", h.ListThreads)
			r.Put("/channels/{channelID}/thread-members/me", h.JoinThread)
			r.Delete("/channels/{channelID}/thread-members/me", h.LeaveThread)
			r.Patch("/channels/{channelID}/thread-state", h.UpdateThreadState)

			// Forum etiketleri
			r.Get("/channels/{channelID}/forum-tags", h.ListForumTags)
			r.Post("/channels/{channelID}/forum-tags", h.CreateForumTag)
			r.Delete("/forum-tags/{tagID}", h.DeleteForumTag)

			// P1: Custom emojis
			r.Get("/guilds/{id}/emojis", h.ListEmojis)
			r.Post("/guilds/{id}/emojis", h.CreateEmoji)
			r.Delete("/guilds/{id}/emojis/{emojiID}", h.DeleteEmoji)

			// P1: Webhooks
			r.Get("/channels/{channelID}/webhooks", h.ListWebhooks)
			r.Post("/channels/{channelID}/webhooks", h.CreateWebhook)
			r.Delete("/webhooks/{webhookID}", h.DeleteWebhook)

			// Duyuru kanalı takibi + mesaj yayınlama (crosspost)
			r.Post("/channels/{channelID}/followers", h.FollowChannel)
			r.Get("/guilds/{id}/follows", h.ListGuildFollows)
			r.Delete("/follows/{followID}", h.DeleteFollow)
			r.Post("/channels/{channelID}/messages/{messageID}/crosspost", h.CrosspostMessage)

			// Bot platformu (applications)
			r.Post("/applications", h.CreateApplication)
			r.Get("/applications", h.ListMyApplications)
			r.Patch("/applications/{applicationID}", h.UpdateApplication)
			r.Delete("/applications/{applicationID}", h.DeleteApplication)
			r.Post("/applications/{applicationID}/reset-token", h.ResetApplicationToken)
			r.Post("/auth/bot-session", h.CreateBotSession)
			r.Post("/guilds/{id}/bots", h.AddBotToGuild)

			// P1: Read state
			r.Get("/users/me/read-states", h.ListReadStates)
			r.Post("/channels/{channelID}/ack", h.AckChannel)

			// P1: Notification settings
			r.Get("/users/me/settings", h.GetMySettings)
			r.Put("/guilds/{id}/notif-settings", h.UpdateGuildNotifSettings)
			r.Put("/channels/{channelID}/notif-settings", h.UpdateChannelNotifSettings)

			// P1: Group DM
			r.Post("/users/me/group-channels", h.CreateGroupDM)
			r.Put("/channels/{channelID}/recipients/{userID}", h.AddGroupDMRecipient)
			r.Delete("/channels/{channelID}/recipients/{userID}", h.RemoveGroupDMRecipient)

			// P1: AutoMod
			r.Get("/guilds/{id}/automod-rules", h.ListAutomodRules)
			r.Post("/guilds/{id}/automod-rules", h.CreateAutomodRule)
			r.Patch("/guilds/{id}/automod-rules/{ruleID}", h.UpdateAutomodRule)
			r.Delete("/guilds/{id}/automod-rules/{ruleID}", h.DeleteAutomodRule)

			// P2: Stage Instances
			r.Post("/stage-instances", h.CreateStageInstance)
			r.Get("/stage-instances/{channelID}", h.GetStageInstance)
			r.Delete("/stage-instances/{channelID}", h.DeleteStageInstance)

			// P2: Scheduled Events
			r.Get("/guilds/{id}/events", h.ListGuildEvents)
			r.Post("/guilds/{id}/events", h.CreateGuildEvent)
			r.Delete("/events/{id}", h.DeleteGuildEvent)
			r.Put("/events/{id}/subscribers/me", h.SubscribeEvent)
			r.Delete("/events/{id}/subscribers/me", h.UnsubscribeEvent)

			// P2: Soundboard
			r.Get("/guilds/{id}/sounds", h.ListSounds)
			r.Post("/guilds/{id}/sounds", h.CreateSound)
			r.Delete("/sounds/{id}", h.DeleteSound)
			r.Post("/sounds/{id}/play", h.PlaySound)

			// P2: Stickers
			r.Get("/guilds/{id}/stickers", h.ListStickers)
			r.Post("/guilds/{id}/stickers", h.CreateSticker)
			r.Delete("/stickers/{id}", h.DeleteSticker)

			// P2: Push subscriptions
			r.Put("/users/me/push-subscriptions", h.SubscribePush)
			r.Delete("/users/me/push-subscriptions", h.UnsubscribePush)

			// P3: Slash Commands
			r.Get("/guilds/{id}/commands", h.ListCommands)
			r.Post("/guilds/{id}/commands", h.CreateCommand)
			r.Delete("/commands/{id}", h.DeleteCommand)
			r.Post("/channels/{channelID}/commands/run", h.RunCommand)

			// P3: Server Folders
			r.Get("/users/me/folders", h.ListFolders)
			r.Post("/users/me/folders", h.CreateFolder)
			r.Patch("/folders/{id}", h.UpdateFolder)
			r.Delete("/folders/{id}", h.DeleteFolder)

			// P3: Link embeds
			r.Get("/messages/{messageID}/embeds", h.GetMessageEmbeds)
		})

		// Webhook execute — anonim (token URL içinde doğrulanır)
		r.Post("/webhooks/{webhookID}/{token}", h.ExecuteWebhook)
	})

	return r
}
