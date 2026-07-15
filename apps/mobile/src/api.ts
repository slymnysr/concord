// Concord mobil API istemcisi — web api.ts'in tam mobil uyarlaması (namespace'li).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiBase } from './config';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadTokens() {
  try {
    accessToken = await AsyncStorage.getItem('concord_access');
    refreshToken = await AsyncStorage.getItem('concord_refresh');
  } catch {}
}

async function saveTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  try {
    await AsyncStorage.setItem('concord_access', access);
    await AsyncStorage.setItem('concord_refresh', refresh);
  } catch {}
}

export async function clearTokens() {
  accessToken = null;
  refreshToken = null;
  try {
    await AsyncStorage.multiRemove(['concord_access', 'concord_refresh']);
  } catch {}
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(apiBase() + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const d = await res.json();
    await saveTokens(d.access_token, d.refresh_token ?? refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  const res = await fetch(apiBase() + path, { ...init, headers });
  if (res.status === 401 && !retried && (await refresh())) {
    return request<T>(path, init, true);
  }
  if (!res.ok) {
    let detail = 'İstek başarısız (' + res.status + ')';
    try {
      const e = await res.json();
      detail = e.detail || e.error || detail;
    } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// === Tipler ===
export interface User {
  id: string;
  username: string;
  email?: string;
  display_name: string;
  avatar_color: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
  pronouns?: string;
  status: string;
  custom_status_text?: string;
  custom_status_emoji?: string;
  bot?: boolean;
  mfa_enabled?: boolean;
  email_verified?: boolean;
  created_at?: string;
}
export interface Guild {
  id: string;
  name: string;
  icon_text?: string;
  icon_color?: string;
  icon_url_v2?: string;
  icon_url?: string;
  banner_url?: string;
  description?: string;
  owner_id?: string;
  is_public?: boolean;
  member_count?: number;
  vanity_url_code?: string;
  afk_channel_id?: string;
  system_channel_id?: string;
  verification_level?: number;
  explicit_content_filter?: number;
  auto_role_id?: string;
}
export interface Channel {
  id: string;
  guild_id?: string;
  parent_id?: string;
  type: string;
  name: string;
  position: number;
  last_message_id?: string;
  topic?: string;
  nsfw?: boolean;
  rate_limit_sec?: number;
  user_limit?: number;
  bitrate?: number;
}
export type Thread = Channel & {
  archived?: boolean;
  message_count?: number;
  member_count?: number;
  creator_id?: string;
  tag_ids?: string[];
};
export interface Member {
  user_id: string;
  guild_id: string;
  nickname?: string;
  joined_at: string;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url?: string;
  status: string;
  bot: boolean;
  role_ids: string[];
}
export interface Role {
  id: string;
  guild_id: string;
  name: string;
  color: number;
  position: number;
  permissions: string;
  hoist: boolean;
  mentionable: boolean;
  is_everyone: boolean;
  icon?: string;
}
export interface Invite {
  code: string;
  guild_id: string;
  inviter_id: string;
  uses: number;
  max_uses?: number;
  expires_at?: string;
  created_at: string;
}
export interface InvitePreview {
  code: string;
  guild: Guild;
  inviter: User;
  member_count: number;
  online_count: number;
  uses: number;
}
export interface Ban {
  guild_id: string;
  user_id: string;
  banned_by: string;
  reason?: string;
  banned_at: string;
  username?: string;
  display_name?: string;
  avatar_color?: string;
}
export interface ReadState {
  channel_id: string;
  last_message_id?: string;
  mention_count: number;
  last_read_at?: string;
}
export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: string;
  edited_at?: string;
  system?: boolean;
  pinned?: boolean;
  replied_to_id?: string;
  webhook_username?: string;
  poll_id?: string;
  attachments?: { id: string; url: string; filename: string; content_type?: string; size_bytes?: number }[];
}
export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}
export interface DMChannel {
  id: string;
  type: 'dm' | 'group_dm';
  name: string;
  participants: string[];
  last_message_id?: string;
}
export interface Friend {
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url?: string;
  status: string;
  bot: boolean;
  friendship: 'accepted' | 'pending_sent' | 'pending_received' | 'blocked';
}
export interface PollAnswer {
  id: string;
  answer_text: string;
  emoji?: string;
  count: number;
  me_voted: boolean;
}
export interface Poll {
  id: string;
  message_id: string;
  question: string;
  allow_multiselect: boolean;
  expired: boolean;
  created_by: string;
  total_votes: number;
  answers: PollAnswer[];
}
export interface ForumTag { id: string; name: string; emoji?: string; position: number }
export interface Notification {
  id: string;
  type: string;
  title?: string;
  body?: string;
  read: boolean;
  created_at: string;
  [k: string]: any;
}
export interface AutomodRule {
  id: string;
  guild_id: string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  [k: string]: any;
}
export interface SavedMessage {
  message_id: string;
  channel_id: string;
  author_id: string;
  content: string;
  author_name: string;
  author_color: string;
  created_at: string;
  saved_at: string;
}
export interface Sticker { id: string; guild_id: string; name: string; description?: string; tags?: string; url: string; format: string; creator_id: string; created_at: string }
export interface Sound { id: string; guild_id: string; name: string; emoji?: string; file_url: string; volume: number; uploader_id: string; created_at: string }
export interface Emoji { id: string; guild_id: string; name: string; url: string; animated: boolean; creator_id: string; created_at: string }
export interface Webhook { id: string; channel_id: string; guild_id?: string; name: string; avatar_url?: string; token?: string; created_at: string }
export interface ScheduledMessage { id: string; channel_id: string; content: string; scheduled_for: string; created_at: string }
export interface Reminder { id: string; channel_id: string; message_id?: string; remind_at: string; created_at: string }
export interface Embed { id: string; url: string; title?: string; description?: string; image_url?: string; site_name?: string; embed_type: string }

async function auth<T extends { access_token: string; refresh_token: string }>(path: string, body: any): Promise<T> {
  const d = await request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  await saveTokens(d.access_token, d.refresh_token);
  return d;
}

export const api = {
  // --- Kimlik ---
  login: (email: string, password: string, totpCode?: string) =>
    auth<{ access_token: string; refresh_token: string; user: User }>('/auth/login', { email, password, totp_code: totpCode || undefined }),
  register: (email: string, password: string, username: string, displayName: string) =>
    auth<{ access_token: string; refresh_token: string; user: User }>('/auth/register', {
      email, password, username, display_name: displayName,
    }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password: newPassword }) }),

  // --- Ben / kullanıcı ---
  me: () => request<User>('/users/me'),
  user: (id: string) => request<User>('/users/' + id),
  settings: () => request<Record<string, any>>('/users/me/settings'),
  updateProfile: (patch: Partial<{ display_name: string; avatar_url: string | null; banner_url: string | null; bio: string | null; pronouns: string; avatar_color: string }>) =>
    request<User>('/users/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  updateStatus: (status: 'online' | 'idle' | 'dnd' | 'offline') =>
    request<void>('/users/me/status', { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateCustomStatus: (input: { custom_status_text?: string | null; custom_status_emoji?: string | null; clear_after_seconds?: number | null }) =>
    request<void>('/users/me/status', { method: 'PATCH', body: JSON.stringify(input) }),
  changePassword: (current: string, next: string) =>
    request<void>('/users/me/password', { method: 'PATCH', body: JSON.stringify({ current_password: current, new_password: next }) }),
  changeEmail: (newEmail: string, password: string) =>
    request<{ sent: boolean; pending_email: string }>('/users/me/email', { method: 'POST', body: JSON.stringify({ new_email: newEmail, password }) }),
  verifyEmail: () => request<{ sent: boolean; already_verified?: boolean }>('/users/me/verify-email', { method: 'POST' }),
  deleteAccount: (password: string) =>
    request<void>('/users/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
  report: (userId: string, reason?: string) =>
    request<void>(`/users/${userId}/report`, { method: 'POST', body: JSON.stringify({ reason: reason ?? '' }) }),
  getNote: (userId: string) => request<{ note: string }>(`/users/${userId}/note`),
  setNote: (userId: string, note: string) =>
    request<void>(`/users/${userId}/note`, { method: 'PUT', body: JSON.stringify({ note }) }),
  block: (userId: string) => request<void>(`/users/${userId}/block`, { method: 'PUT' }),
  unblock: (userId: string) => request<void>(`/users/${userId}/block`, { method: 'DELETE' }),

  keywords: {
    list: () => request<string[]>('/users/me/keywords'),
    set: (keywords: string[]) => request<string[]>('/users/me/keywords', { method: 'PUT', body: JSON.stringify({ keywords }) }),
  },
  privacy: {
    get: () => request<{ allow_dms_from: 'everyone' | 'friends' }>('/users/me/privacy'),
    set: (allowDmsFrom: 'everyone' | 'friends') =>
      request<{ allow_dms_from: string }>('/users/me/privacy', { method: 'PUT', body: JSON.stringify({ allow_dms_from: allowDmsFrom }) }),
  },
  sessions: {
    list: () => request<Array<{ id: string; user_agent: string; created_at: string; expires_at: string }>>('/users/me/sessions'),
    revoke: (sessionId: string) => request<void>(`/users/me/sessions/${sessionId}`, { method: 'DELETE' }),
    revokeOthers: () => request<void>('/users/me/sessions', { method: 'DELETE' }),
  },
  twofa: {
    enable: () => request<{ secret: string; otpauth_url: string }>('/users/me/2fa/enable', { method: 'POST' }),
    verify: (code: string) => request<void>('/users/me/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
    disable: (code: string) => request<void>('/users/me/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) }),
  },
  connections: {
    list: () => request<Array<{ id: string; type: string; name: string; verified: boolean; visible: boolean }>>('/users/me/connections'),
    create: (type: string, name: string) => request<any>('/users/me/connections', { method: 'POST', body: JSON.stringify({ type, name }) }),
    setVisible: (connectionId: string, visible: boolean) =>
      request<void>(`/users/me/connections/${connectionId}`, { method: 'PATCH', body: JSON.stringify({ visible }) }),
    remove: (connectionId: string) => request<void>(`/users/me/connections/${connectionId}`, { method: 'DELETE' }),
    githubAuthorize: () => request<{ url: string }>('/connections/github/authorize'),
  },
  folders: {
    list: () => request<Array<{ id: string; name: string; color: number; position: number; guild_ids: string[] }>>('/users/me/folders'),
    create: (input: { name: string; color?: number; guild_ids?: string[] }) =>
      request<{ id: string }>('/users/me/folders', { method: 'POST', body: JSON.stringify(input) }),
    update: (folderId: string, input: { name?: string; color?: number; guild_ids?: string[] }) =>
      request<void>(`/folders/${folderId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    delete: (folderId: string) => request<void>(`/folders/${folderId}`, { method: 'DELETE' }),
  },
  notifications: {
    count: () => request<{ unread: number }>('/notifications/count'),
    list: () => request<Notification[]>('/notifications'),
    markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
  },

  // --- Sunucular ---
  guilds: {
    list: () => request<Guild[]>('/guilds'),
    get: (guildId: string) => request<Guild>(`/guilds/${guildId}`),
    create: (name: string, iconText?: string, iconColor?: string) =>
      request<Guild>('/guilds', { method: 'POST', body: JSON.stringify({ name, icon_text: iconText, icon_color: iconColor }) }),
    update: (guildId: string, patch: Partial<Guild>) =>
      request<Guild>(`/guilds/${guildId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteGuild: (guildId: string) => request<void>(`/guilds/${guildId}`, { method: 'DELETE' }),
    leave: (guildId: string) => request<void>(`/guilds/${guildId}/leave`, { method: 'POST' }),
    channels: (guildId: string) => request<Channel[]>(`/guilds/${guildId}/channels`),
    members: (guildId: string) => request<Member[]>(`/guilds/${guildId}/members`),
    insights: (guildId: string) => request<any>(`/guilds/${guildId}/insights`),
    auditLog: (guildId: string) =>
      request<Array<{ id: string; actor_id: string; action: string; target_id?: string; reason?: string; created_at: string }>>(`/guilds/${guildId}/audit-log`),
    invites: (guildId: string) => request<Invite[]>(`/guilds/${guildId}/invites`),
    createInvite: (guildId: string, opts: { max_uses?: number; expires_in_sec?: number } = {}) =>
      request<Invite>(`/guilds/${guildId}/invites`, { method: 'POST', body: JSON.stringify(opts) }),
    notifSettings: (guildId: string, notifLevel: 'all' | 'mentions' | 'nothing', muteUntilSec?: number) =>
      request<void>(`/guilds/${guildId}/notif-settings`, { method: 'PUT', body: JSON.stringify({ notif_level: notifLevel, mute_until_sec: muteUntilSec ?? 0 }) }),
    // Roller
    roles: (guildId: string) => request<Role[]>(`/guilds/${guildId}/roles`),
    createRole: (guildId: string, input: { name: string; color?: number; permissions?: string; hoist?: boolean; mentionable?: boolean }) =>
      request<Role>(`/guilds/${guildId}/roles`, { method: 'POST', body: JSON.stringify(input) }),
    updateRole: (guildId: string, roleId: string, input: Partial<{ name: string; color: number; permissions: string; hoist: boolean; mentionable: boolean; position: number }>) =>
      request<Role>(`/guilds/${guildId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    deleteRole: (guildId: string, roleId: string) => request<void>(`/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' }),
    assignRole: (guildId: string, userId: string, roleId: string) =>
      request<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' }),
    unassignRole: (guildId: string, userId: string, roleId: string) =>
      request<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' }),
    // Üye/moderasyon
    setNickname: (guildId: string, userId: string, nickname: string) =>
      request<void>(`/guilds/${guildId}/members/${userId}/nickname`, { method: 'PATCH', body: JSON.stringify({ nickname }) }),
    setMyProfile: (guildId: string, input: { nickname?: string; guild_avatar_url?: string | null; guild_bio?: string | null }) =>
      request<void>(`/guilds/${guildId}/members/me/profile`, { method: 'PATCH', body: JSON.stringify(input) }),
    setVoiceState: (guildId: string, userId: string, state: { mute?: boolean; deafen?: boolean }) =>
      request<void>(`/guilds/${guildId}/members/${userId}/voice`, { method: 'PATCH', body: JSON.stringify(state) }),
    kick: (guildId: string, userId: string) => request<void>(`/guilds/${guildId}/members/${userId}`, { method: 'DELETE' }),
    ban: (guildId: string, userId: string, reason?: string, deleteMessageHours?: number) =>
      request<void>(`/guilds/${guildId}/bans/${userId}`, { method: 'PUT', body: JSON.stringify({ reason: reason ?? '', delete_message_hours: deleteMessageHours ?? 0 }) }),
    unban: (guildId: string, userId: string) => request<void>(`/guilds/${guildId}/bans/${userId}`, { method: 'DELETE' }),
    bans: (guildId: string) => request<Ban[]>(`/guilds/${guildId}/bans`),
    timeout: (guildId: string, userId: string, durationSec: number) =>
      request<{ timeout_until: string | null }>(`/guilds/${guildId}/members/${userId}/timeout`, { method: 'PATCH', body: JSON.stringify({ duration_sec: durationSec }) }),
    // AutoMod
    automodRules: (guildId: string) => request<AutomodRule[]>(`/guilds/${guildId}/automod-rules`),
    createAutomodRule: (guildId: string, input: { name: string; trigger_type: string; trigger_data?: any; actions?: any; enabled?: boolean }) =>
      request<AutomodRule>(`/guilds/${guildId}/automod-rules`, { method: 'POST', body: JSON.stringify(input) }),
    updateAutomodRule: (guildId: string, ruleId: string, enabled: boolean) =>
      request<void>(`/guilds/${guildId}/automod-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    deleteAutomodRule: (guildId: string, ruleId: string) => request<void>(`/guilds/${guildId}/automod-rules/${ruleId}`, { method: 'DELETE' }),
  },

  discover: {
    list: () => request<Array<{ id: string; name: string; icon_text: string; icon_color: string; description: string; member_count: number; joined: boolean }>>('/discover/guilds'),
    join: (guildId: string) => request<Guild>(`/discover/guilds/${guildId}/join`, { method: 'POST' }),
  },

  invites: {
    preview: (code: string) => request<InvitePreview>(`/invites/${encodeURIComponent(code.trim())}`),
    accept: (code: string) => request<Guild>(`/invites/${encodeURIComponent(code.trim())}/accept`, { method: 'POST' }),
    delete: (code: string) => request<void>(`/invites/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  },

  // --- DM & arkadaşlar ---
  dms: {
    list: () => request<DMChannel[]>('/users/me/channels'),
    open: (userId: string) => request<{ channel_id: string }>('/users/me/channels', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
    createGroup: (userIds: string[], name?: string) =>
      request<{ channel_id: string; name: string }>('/users/me/group-channels', { method: 'POST', body: JSON.stringify({ user_ids: userIds, name }) }),
    addRecipient: (channelId: string, userId: string) => request<void>(`/channels/${channelId}/recipients/${userId}`, { method: 'PUT' }),
    removeRecipient: (channelId: string, userId: string) => request<void>(`/channels/${channelId}/recipients/${userId}`, { method: 'DELETE' }),
  },
  friends: {
    list: () => request<Friend[]>('/friends'),
    send: (input: { username?: string; user_id?: string }) => request<void>('/friends', { method: 'POST', body: JSON.stringify(input) }),
    accept: (userId: string) => request<void>(`/friends/${userId}/accept`, { method: 'PUT' }),
    remove: (userId: string) => request<void>(`/friends/${userId}`, { method: 'DELETE' }),
  },

  // --- Kanallar & mesajlar ---
  channels: {
    create: (guildId: string, name: string, type = 'text', parentId?: string | null, topic?: string) =>
      request<Channel>('/channels', { method: 'POST', body: JSON.stringify({ guild_id: guildId, name, type, parent_id: parentId ?? undefined, topic: topic || undefined }) }),
    update: (channelId: string, patch: Partial<{ name: string; topic: string; nsfw: boolean; rate_limit_sec: number; parent_id: string | null; position: number; user_limit: number; bitrate: number }>) =>
      request<Channel>(`/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    delete: (channelId: string) => request<void>(`/channels/${channelId}`, { method: 'DELETE' }),
    messages: (channelId: string, before?: string, limit = 50) =>
      request<Message[]>(`/channels/${channelId}/messages?limit=${limit}` + (before ? `&before=${before}` : '')),
    sendMessage: (channelId: string, content: string, repliedToId?: string, attachments?: { url: string; filename: string; content_type: string; size_bytes: number }[]) =>
      request<Message>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, replied_to_id: repliedToId || undefined, attachments: attachments && attachments.length ? attachments : undefined }),
      }),
    ack: (channelId: string, lastMessageId?: string) =>
      request<void>(`/channels/${channelId}/ack`, { method: 'POST', body: JSON.stringify(lastMessageId ? { last_message_id: lastMessageId } : {}) }),
    pins: (channelId: string) => request<Message[]>(`/channels/${channelId}/pins`),
    muteSettings: (channelId: string, input: { notif_level?: 'all' | 'mentions' | 'nothing'; mute_until_sec?: number }) =>
      request<void>(`/channels/${channelId}/notif-settings`, { method: 'PUT', body: JSON.stringify(input) }),
    listOverrides: (channelId: string) =>
      request<Array<{ channel_id: string; target_type: 'role' | 'user'; target_id: string; allow: string; deny: string }>>(`/channels/${channelId}/overrides`),
    upsertOverride: (channelId: string, input: { target_type: 'role' | 'user'; target_id: string; allow: string; deny: string }) =>
      request<void>(`/channels/${channelId}/overrides`, { method: 'PUT', body: JSON.stringify(input) }),
    deleteOverride: (channelId: string, targetType: 'role' | 'user', targetId: string) =>
      request<void>(`/channels/${channelId}/overrides/${targetType}/${targetId}`, { method: 'DELETE' }),
    webhooks: (channelId: string) => request<Webhook[]>(`/channels/${channelId}/webhooks`),
    createWebhook: (channelId: string, name: string) =>
      request<Webhook>(`/channels/${channelId}/webhooks`, { method: 'POST', body: JSON.stringify({ name }) }),
    deleteWebhook: (webhookId: string) => request<void>(`/webhooks/${webhookId}`, { method: 'DELETE' }),
  },
  messages: {
    edit: (messageId: string, content: string) =>
      request<Message>(`/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ content }) }),
    delete: (messageId: string) => request<void>(`/messages/${messageId}`, { method: 'DELETE' }),
    pin: (messageId: string) => request<void>(`/messages/${messageId}/pin`, { method: 'PUT' }),
    unpin: (messageId: string) => request<void>(`/messages/${messageId}/pin`, { method: 'DELETE' }),
    edits: (messageId: string) => request<Array<{ id: string; old_content: string; edited_at: string }>>(`/messages/${messageId}/edits`),
    embeds: (messageId: string) => request<Embed[]>(`/messages/${messageId}/embeds`),
    crosspost: (channelId: string, messageId: string) =>
      request<{ published: boolean; delivered_to: number }>(`/channels/${channelId}/messages/${messageId}/crosspost`, { method: 'POST' }),
  },
  reactions: {
    list: (messageId: string) => request<Reaction[]>(`/messages/${messageId}/reactions`),
    users: (messageId: string, emoji: string) =>
      request<Array<{ id: string; display_name: string; avatar_color: string }>>(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/users`),
    add: (messageId: string, emoji: string) =>
      request<void>(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: 'PUT' }),
    remove: (messageId: string, emoji: string) =>
      request<void>(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' }),
  },
  readStates: {
    list: () => request<ReadState[]>('/users/me/read-states'),
    ack: (channelId: string, lastMessageId?: string) =>
      request<void>(`/channels/${channelId}/ack`, { method: 'POST', body: JSON.stringify(lastMessageId ? { last_message_id: lastMessageId } : {}) }),
  },
  savedMessages: {
    list: () => request<SavedMessage[]>('/users/me/saved-messages'),
    save: (messageId: string) => request<void>(`/messages/${messageId}/save`, { method: 'PUT' }),
    unsave: (messageId: string) => request<void>(`/messages/${messageId}/save`, { method: 'DELETE' }),
  },
  reminders: {
    list: () => request<Reminder[]>('/users/me/reminders'),
    create: (messageId: string, remindAt: string) =>
      request<Reminder>(`/messages/${messageId}/remind`, { method: 'POST', body: JSON.stringify({ remind_at: remindAt }) }),
    delete: (reminderId: string) => request<void>(`/reminders/${reminderId}`, { method: 'DELETE' }),
  },
  scheduledMessages: {
    list: (channelId: string) => request<ScheduledMessage[]>(`/channels/${channelId}/scheduled-messages`),
    create: (channelId: string, content: string, scheduledFor: string) =>
      request<ScheduledMessage>(`/channels/${channelId}/scheduled-messages`, { method: 'POST', body: JSON.stringify({ content, scheduled_for: scheduledFor }) }),
    delete: (schedId: string) => request<void>(`/scheduled-messages/${schedId}`, { method: 'DELETE' }),
  },

  // --- Zengin içerik ---
  search: {
    messages: (q: string, opts: { guildId?: string; channelId?: string; authorId?: string; pinned?: boolean; has?: string[]; limit?: number } = {}) => {
      const p = new URLSearchParams({ q });
      if (opts.guildId) p.set('guild_id', opts.guildId);
      if (opts.channelId) p.set('channel_id', opts.channelId);
      if (opts.authorId) p.set('author_id', opts.authorId);
      if (opts.pinned) p.set('pinned', 'true');
      (opts.has ?? []).forEach((h) => p.append('has', h));
      if (opts.limit) p.set('limit', String(opts.limit));
      return request<Array<{ message: Message; channel: Channel }>>(`/search/messages?${p}`);
    },
  },
  polls: {
    create: (channelId: string, input: { question: string; answers: { text: string; emoji?: string }[]; allow_multiselect?: boolean; anonymous?: boolean; duration_hours?: number }) =>
      request<Message>(`/channels/${channelId}/polls`, { method: 'POST', body: JSON.stringify(input) }),
    forMessage: (messageId: string) => request<Poll>(`/messages/${messageId}/poll`),
    vote: (pollId: string, answerId: string) => request<void>(`/polls/${pollId}/answers/${answerId}/vote`, { method: 'PUT' }),
    unvote: (pollId: string, answerId: string) => request<void>(`/polls/${pollId}/answers/${answerId}/vote`, { method: 'DELETE' }),
    close: (pollId: string) => request<void>(`/polls/${pollId}/close`, { method: 'POST' }),
    voters: (pollId: string, answerId: string) =>
      request<Array<{ id: string; display_name: string; avatar_color: string; avatar_url?: string }>>(`/polls/${pollId}/answers/${answerId}/voters`),
  },
  stickers: {
    list: (guildId: string) => request<Sticker[]>(`/guilds/${guildId}/stickers`),
    create: (guildId: string, input: { name: string; description?: string; tags?: string; url: string; format?: string }) =>
      request<{ id: string }>(`/guilds/${guildId}/stickers`, { method: 'POST', body: JSON.stringify(input) }),
    delete: (stickerId: string) => request<void>(`/stickers/${stickerId}`, { method: 'DELETE' }),
  },
  emojis: {
    list: (guildId: string) => request<Emoji[]>(`/guilds/${guildId}/emojis`),
    create: (guildId: string, input: { name: string; url: string; animated?: boolean }) =>
      request<{ id: string }>(`/guilds/${guildId}/emojis`, { method: 'POST', body: JSON.stringify(input) }),
    delete: (guildId: string, emojiId: string) => request<void>(`/guilds/${guildId}/emojis/${emojiId}`, { method: 'DELETE' }),
  },
  sounds: {
    list: (guildId: string) => request<Sound[]>(`/guilds/${guildId}/sounds`),
    create: (guildId: string, input: { name: string; emoji?: string; file_url: string; volume?: number }) =>
      request<{ id: string; file_url: string }>(`/guilds/${guildId}/sounds`, { method: 'POST', body: JSON.stringify(input) }),
    delete: (soundId: string) => request<void>(`/sounds/${soundId}`, { method: 'DELETE' }),
    play: (soundId: string, channelId: string) =>
      request<void>(`/sounds/${soundId}/play`, { method: 'POST', body: JSON.stringify({ channel_id: channelId }) }),
  },
  commands: {
    list: (guildId: string) => request<Array<{ id: string; guild_id: string; name: string; description: string; response: string; creator_id: string; created_at: string }>>(`/guilds/${guildId}/commands`),
    create: (guildId: string, input: { name: string; description: string; response: string }) =>
      request<{ id: string }>(`/guilds/${guildId}/commands`, { method: 'POST', body: JSON.stringify(input) }),
    delete: (commandId: string) => request<void>(`/commands/${commandId}`, { method: 'DELETE' }),
    run: (channelId: string, name: string, args?: Record<string, string>) =>
      request<Message>(`/channels/${channelId}/commands/run?name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify({ args: args ?? {} }) }),
  },

  // --- Thread & forum ---
  threads: {
    create: (channelId: string, input: { name: string; type?: 'public_thread' | 'private_thread'; starter_message_id?: string; tag_ids?: string[] }) =>
      request<Channel>(`/channels/${channelId}/threads`, { method: 'POST', body: JSON.stringify(input) }),
    list: (channelId: string, archived = false) =>
      request<Thread[]>(`/channels/${channelId}/threads${archived ? '?archived=true' : ''}`),
    join: (channelId: string) => request<void>(`/channels/${channelId}/thread-members/me`, { method: 'PUT' }),
    leave: (channelId: string) => request<void>(`/channels/${channelId}/thread-members/me`, { method: 'DELETE' }),
    setState: (channelId: string, state: { archived?: boolean; locked?: boolean }) =>
      request<void>(`/channels/${channelId}/thread-state`, { method: 'PATCH', body: JSON.stringify(state) }),
  },
  forumTags: {
    list: (channelId: string) => request<ForumTag[]>(`/channels/${channelId}/forum-tags`),
    create: (channelId: string, input: { name: string; emoji?: string }) =>
      request<ForumTag>(`/channels/${channelId}/forum-tags`, { method: 'POST', body: JSON.stringify(input) }),
    delete: (tagId: string) => request<void>(`/forum-tags/${tagId}`, { method: 'DELETE' }),
  },

  // --- Sahne & etkinlik & takip & karşılama ---
  stageInstances: {
    create: (input: { channel_id: string; topic: string; privacy_level?: 'guild_only' | 'public' }) =>
      request<{ channel_id: string; topic: string }>('/stage-instances', { method: 'POST', body: JSON.stringify(input) }),
    get: (channelId: string) => request<{ channel_id: string; topic: string; started_by: string; started_at: string }>(`/stage-instances/${channelId}`),
    delete: (channelId: string) => request<void>(`/stage-instances/${channelId}`, { method: 'DELETE' }),
  },
  events: {
    list: (guildId: string) => request<Array<any>>(`/guilds/${guildId}/events`),
    create: (guildId: string, input: { name: string; description?: string; scheduled_start_at: string; scheduled_end_at?: string; entity_type: 'voice' | 'stage_instance' | 'external'; channel_id?: string; entity_location?: string; image_url?: string }) =>
      request<{ id: string }>(`/guilds/${guildId}/events`, { method: 'POST', body: JSON.stringify(input) }),
    delete: (eventId: string) => request<void>(`/events/${eventId}`, { method: 'DELETE' }),
    subscribe: (eventId: string) => request<void>(`/events/${eventId}/subscribers/me`, { method: 'PUT' }),
    unsubscribe: (eventId: string) => request<void>(`/events/${eventId}/subscribers/me`, { method: 'DELETE' }),
  },
  follows: {
    follow: (channelId: string, targetChannelId: string) =>
      request<any>(`/channels/${channelId}/followers`, { method: 'POST', body: JSON.stringify({ target_channel_id: targetChannelId }) }),
    listForGuild: (guildId: string) => request<Array<any>>(`/guilds/${guildId}/follows`),
    remove: (followId: string) => request<void>(`/follows/${followId}`, { method: 'DELETE' }),
  },
  reactionRoles: {
    list: (guildId: string) => request<Array<any>>(`/guilds/${guildId}/reaction-roles`),
    create: (guildId: string, input: { channel_id: string; message_id: string; emoji: string; role_id: string }) =>
      request<any>(`/guilds/${guildId}/reaction-roles`, { method: 'POST', body: JSON.stringify(input) }),
    delete: (bindingId: string) => request<void>(`/reaction-roles/${bindingId}`, { method: 'DELETE' }),
  },
  welcome: {
    get: (guildId: string) => request<any>(`/guilds/${guildId}/welcome`),
    update: (guildId: string, input: any) => request<any>(`/guilds/${guildId}/welcome`, { method: 'PATCH', body: JSON.stringify(input) }),
    acceptOnboarding: (guildId: string, selectedOptionIds?: string[]) =>
      request<void>(`/guilds/${guildId}/onboarding/accept`, { method: 'POST', body: JSON.stringify({ selected_option_ids: selectedOptionIds ?? [] }) }),
  },
  applications: {
    list: () => request<Array<{ id: string; name: string; bot_user_id: string; bot_username: string; public: boolean; created_at: string }>>('/applications'),
    create: (name: string, description?: string) =>
      request<any>('/applications', { method: 'POST', body: JSON.stringify({ name, description: description || undefined }) }),
    update: (applicationId: string, patch: Partial<{ name: string; description: string; public: boolean }>) =>
      request<void>(`/applications/${applicationId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    remove: (applicationId: string) => request<void>(`/applications/${applicationId}`, { method: 'DELETE' }),
    resetToken: (applicationId: string) => request<{ token: string }>(`/applications/${applicationId}/reset-token`, { method: 'POST' }),
    addToGuild: (guildId: string, applicationId: string) =>
      request<{ added: boolean; bot_user_id: string }>(`/guilds/${guildId}/bots`, { method: 'POST', body: JSON.stringify({ application_id: applicationId }) }),
  },
  uploads: {
    presign: (input: { filename: string; content_type: string; size_bytes: number }) =>
      request<{ upload_url: string; public_url: string; key: string; filename: string }>('/uploads/presign', { method: 'POST', body: JSON.stringify(input) }),
  },
  push: {
    subscribe: (input: { endpoint: string; p256dh: string; auth: string }) =>
      request<void>('/users/me/push-subscriptions', { method: 'PUT', body: JSON.stringify(input) }),
    unsubscribeAll: () => request<void>('/users/me/push-subscriptions', { method: 'DELETE' }),
  },
};

// Yerel dosyayı presign ile yükler, herkese açık URL döner. (emoji/çıkartma/ses/ek için ortak)
export async function uploadFile(uri: string, filename: string, contentType: string, size: number) {
  const pre = await api.uploads.presign({ filename, content_type: contentType, size_bytes: size });
  const blob = await (await fetch(uri)).blob();
  const put = await fetch(pre.upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
  if (!put.ok) throw new Error('Dosya yüklenemedi');
  return { url: pre.public_url, filename, content_type: contentType, size_bytes: size };
}
