// Concord API istemcisi — fetch tabanlı, auth header + token refresh
export type Snowflake = string;

import { httpUrl } from './serverConfig';

const API_BASE = httpUrl('/api/v1');
const TOKEN_KEY = 'concord_access';
const REFRESH_KEY = 'concord_refresh';
const SESSION_KEY = 'concord_session_id';

export interface APIUser {
  id: Snowflake;
  username: string;
  email: string;
  display_name: string;
  avatar_color: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
  pronouns?: string;
  accent_color?: string;
  avatar_decoration?: string;
  custom_status_text?: string;
  custom_status_emoji?: string;
  email_verified?: boolean;
  totp_enabled?: boolean;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  bot: boolean;
  created_at: string;
}

export interface APIGuild {
  id: Snowflake;
  name: string;
  icon_text: string;
  icon_color: string;
  icon_url_v2?: string;
  banner_url?: string;
  owner_id: Snowflake;
  description?: string;
  is_public: boolean;
  vanity_url_code?: string;
  afk_channel_id?: Snowflake;
  afk_timeout_sec?: number;
  system_channel_id?: Snowflake;
  verification_level?: number;
  created_at: string;
}

export interface APIChannel {
  id: Snowflake;
  guild_id: Snowflake;
  parent_id?: Snowflake;
  type:
    | 'text'
    | 'voice'
    | 'announcement'
    | 'forum'
    | 'stage'
    | 'category'
    | 'media'
    | 'public_thread'
    | 'private_thread'
    | 'news_thread';
  name: string;
  topic?: string;
  position: number;
  nsfw: boolean;
  rate_limit_sec: number;
  auto_archive_minutes?: number;
  last_message_id?: Snowflake;
  user_limit?: number;
  bitrate?: number;
  created_at: string;
}

export interface APIReadState {
  channel_id: Snowflake;
  last_message_id?: Snowflake;
  mention_count: number;
  last_read_at: string;
}

export interface APIAttachment {
  id: Snowflake;
  message_id: Snowflake;
  filename: string;
  url: string;
  // Sunucunun nesneden TESPİT ETTİĞİ metadata (istemci beyanı değil) — bkz. API-KONTRAT
  content_type?: string;
  size_bytes: number;
  width?: number; // yalnızca görüntülerde
  height?: number; // yalnızca görüntülerde
  thumb_url?: string; // EXIF'siz JPEG thumbnail (uzun kenar 400px), yalnızca görüntülerde
  created_at: string;
}

export interface RichEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number; // 0xRRGGBB
  author_name?: string;
  author_icon?: string;
  author_url?: string;
  thumbnail_url?: string;
  image_url?: string;
  footer_text?: string;
  footer_icon?: string;
  timestamp?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface APIMessage {
  id: Snowflake;
  channel_id: Snowflake;
  author_id: Snowflake;
  content: string;
  edited_at?: string;
  created_at: string;
  attachments?: APIAttachment[];
  embeds?: RichEmbed[];
  webhook_username?: string;
  webhook_avatar?: string;
  replied_to_id?: Snowflake;
  mention_everyone?: boolean;
  system?: boolean;
  published_at?: string;
  reactions?: APIReaction[];
}

export interface APIMember {
  user_id: Snowflake;
  guild_id: Snowflake;
  nickname?: string;
  guild_avatar_url?: string;
  guild_bio?: string;
  joined_at: string;
  timeout_until?: string;
  username: string;
  display_name: string;
  avatar_color: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  bot: boolean;
  role_ids: Snowflake[];
}

export interface APIInvite {
  code: string;
  guild_id: Snowflake;
  inviter_id: Snowflake;
  max_uses?: number;
  uses: number;
  expires_at?: string;
  created_at: string;
}

export interface APIInvitePreview {
  code: string;
  guild: APIGuild;
  inviter: APIUser;
  channel?: { id: Snowflake; name: string; type: string };
  member_count: number;
  online_count: number;
  uses: number;
  max_uses?: number;
  expires_at?: string;
}

export interface APIRole {
  id: Snowflake;
  guild_id: Snowflake;
  name: string;
  color: number;
  position: number;
  permissions: string;
  hoist: boolean;
  mentionable: boolean;
  icon?: string;
  is_everyone: boolean;
  created_at: string;
}

export interface APIAutomodRule {
  id: Snowflake;
  guild_id: Snowflake;
  name: string;
  enabled: boolean;
  trigger_type: string;
  trigger_data?: any;
  actions?: any;
  exempt_role_ids?: string[];
  exempt_channel_ids?: string[];
  creator_id?: Snowflake;
  created_at?: string;
}

export interface APIBan {
  guild_id: Snowflake;
  user_id: Snowflake;
  banned_by: Snowflake;
  reason?: string;
  banned_at: string;
}

export interface APIPublicUser {
  id: Snowflake;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
  pronouns?: string;
  accent_color?: string;
  avatar_decoration?: string;
  custom_status_text?: string;
  custom_status_emoji?: string;
  email_verified?: boolean;
  totp_enabled?: boolean;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  bot: boolean;
  created_at: string;
  friendship_state?: 'self' | 'accepted' | 'pending_sent' | 'pending_received' | 'blocked';
  dm_channel_id?: Snowflake;
  mutual_guilds?: Array<{ id: Snowflake; name: string; icon_color: string; icon_text: string }>;
  mutual_friends?: Array<{ user_id: Snowflake; display_name: string; avatar_color: string }>;
  connections?: APIConnection[];
}

export interface APIConnection {
  id: Snowflake;
  type: string;
  name: string;
  verified: boolean;
  visible: boolean;
}

export interface APIApplication {
  id: Snowflake;
  name: string;
  description?: string;
  bot_user_id: Snowflake;
  bot_username: string;
  public: boolean;
  token?: string; // sadece create/reset yanıtında dolu
  created_at: string;
}

export interface APIPollAnswer {
  id: Snowflake;
  answer_text: string;
  emoji?: string;
  count: number;
  me_voted: boolean;
}

export interface APIPoll {
  id: Snowflake;
  message_id: Snowflake;
  question: string;
  allow_multiselect: boolean;
  expires_at?: string;
  expired: boolean;
  anonymous?: boolean;
  created_by: Snowflake;
  total_votes: number;
  answers: APIPollAnswer[];
}

export interface APIScheduledMessage {
  id: Snowflake;
  channel_id: Snowflake;
  content: string;
  scheduled_for: string;
  created_at: string;
}

export interface APIReminder {
  id: Snowflake;
  channel_id: Snowflake;
  message_id?: Snowflake;
  remind_at: string;
  created_at: string;
}

export interface APISavedMessage {
  message_id: Snowflake;
  channel_id: Snowflake;
  author_id: Snowflake;
  content: string;
  author_name: string;
  author_color: string;
  author_avatar?: string;
  guild_id?: Snowflake;
  channel_name?: string;
  created_at: string;
  saved_at: string;
}

export interface APIDMChannel {
  id: Snowflake;
  type: 'dm' | 'group_dm';
  name: string;
  owner_id?: Snowflake;
  participants: Snowflake[];
  last_message_id?: Snowflake;
  created_at: string;
}

export interface APIReaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface APISearchResult {
  message: APIMessage;
  channel: APIChannel;
  author?: APIUser;
}

export interface APIReactionRole {
  id: Snowflake;
  guild_id: Snowflake;
  channel_id: Snowflake;
  message_id: Snowflake;
  emoji: string;
  role_id: Snowflake;
  created_at: string;
}

export interface APIWelcomeChannel {
  channel_id: Snowflake;
  description?: string;
  emoji?: string;
}

export interface APIOnboardingOption {
  id: string;
  label: string;
  emoji?: string;
  role_ids: string[];
}
export interface APIOnboardingPrompt {
  id: string;
  title: string;
  options: APIOnboardingOption[];
}

export interface APIGuildWelcome {
  guild_id: Snowflake;
  enabled: boolean;
  description: string;
  welcome_channels: APIWelcomeChannel[];
  rules_text: string;
  require_accept: boolean;
  onboarding_prompts: APIOnboardingPrompt[];
  accepted: boolean;
}

export interface APINotification {
  id: Snowflake;
  type: string;
  channel_id?: Snowflake;
  channel_name?: string;
  guild_id?: Snowflake;
  guild_name?: string;
  message_id?: Snowflake;
  message_preview?: string;
  actor_id?: Snowflake;
  actor_username?: string;
  actor_display_name?: string;
  actor_avatar_color?: string;
  read_at?: string;
  created_at: string;
}

export interface APICommandOption {
  name: string;
  description: string;
  required: boolean;
}

export interface APICommand {
  id: Snowflake;
  guild_id: Snowflake;
  name: string;
  description: string;
  response: string;
  options: APICommandOption[];
  creator_id: Snowflake;
  created_at: string;
}

export interface AuthResponse {
  user: APIUser;
  access_token: string;
  refresh_token: string;
  session_id?: string;
  expires_at: string;
}

export class APIError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}

export const tokenStore = {
  access(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  session(): string | null {
    return localStorage.getItem(SESSION_KEY);
  },
  set(access: string, refresh: string, sessionId?: string) {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    if (sessionId) localStorage.setItem(SESSION_KEY, sessionId);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(SESSION_KEY);
  },
};

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = tokenStore.access();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && !retried) {
    const ok = await tryRefresh();
    if (ok) return request<T>(path, init, true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new APIError(res.status, body.error || 'unknown', body.detail || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const rt = tokenStore.refresh();
  if (!rt) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) {
      tokenStore.clear();
      return false;
    }
    const data: AuthResponse = await res.json();
    tokenStore.set(data.access_token, data.refresh_token, data.session_id);
    return true;
  } catch {
    tokenStore.clear();
    return false;
  }
}

export const api = {
  async register(input: {
    username: string;
    email: string;
    display_name: string;
    password: string;
  }): Promise<AuthResponse> {
    const r = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    tokenStore.set(r.access_token, r.refresh_token, r.session_id);
    return r;
  },

  async login(input: {
    email: string;
    password: string;
    totp_code?: string;
  }): Promise<AuthResponse> {
    const r = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    tokenStore.set(r.access_token, r.refresh_token, r.session_id);
    return r;
  },

  logout() {
    tokenStore.clear();
  },

  forgotPassword: (email: string) =>
    request<{ ok: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  me: () => request<APIUser>('/users/me'),
  user: (userId: string) => request<APIPublicUser>(`/users/${userId}`),
  users: {
    user: (userId: string) => request<APIPublicUser>(`/users/${userId}`),
    report: (userId: string, reason?: string) =>
      request<void>(`/users/${userId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason ?? '' }),
      }),
    verifyEmail: () =>
      request<{ sent: boolean; already_verified?: boolean }>(`/users/me/verify-email`, {
        method: 'POST',
      }),
    changeEmail: (newEmail: string, password: string) =>
      request<{ sent: boolean; pending_email: string }>(`/users/me/email`, {
        method: 'POST',
        body: JSON.stringify({ new_email: newEmail, password }),
      }),
    getNote: (userId: string) => request<{ note: string }>(`/users/${userId}/note`),
    setNote: (userId: string, note: string) =>
      request<void>(`/users/${userId}/note`, { method: 'PUT', body: JSON.stringify({ note }) }),
  },
  updateStatus: (status: 'online' | 'idle' | 'dnd' | 'offline') =>
    request<void>('/users/me/status', {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  updateCustomStatus: (input: {
    custom_status_text?: string | null;
    custom_status_emoji?: string | null;
    clear_after_seconds?: number | null;
  }) =>
    request<void>('/users/me/status', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  changePassword: (current: string, next: string) =>
    request<void>('/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password: current, new_password: next }),
    }),
  deleteAccount: (password: string) =>
    request<void>('/users/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
  keywords: {
    list: () => request<string[]>('/users/me/keywords'),
    set: (keywords: string[]) =>
      request<string[]>('/users/me/keywords', {
        method: 'PUT',
        body: JSON.stringify({ keywords }),
      }),
  },
  privacy: {
    get: () => request<{ allow_dms_from: 'everyone' | 'friends' }>('/users/me/privacy'),
    set: (allowDmsFrom: 'everyone' | 'friends') =>
      request<{ allow_dms_from: string }>('/users/me/privacy', {
        method: 'PUT',
        body: JSON.stringify({ allow_dms_from: allowDmsFrom }),
      }),
  },
  block: (userId: string) => request<void>(`/users/${userId}/block`, { method: 'PUT' }),
  unblock: (userId: string) => request<void>(`/users/${userId}/block`, { method: 'DELETE' }),

  sessions: {
    list: () =>
      request<Array<{ id: Snowflake; user_agent: string; created_at: string; expires_at: string }>>(
        '/users/me/sessions',
      ),
    revoke: (sessionId: string) =>
      request<void>(`/users/me/sessions/${sessionId}`, { method: 'DELETE' }),
    revokeOthers: (exceptId: string) =>
      request<void>(`/users/me/sessions?except=${encodeURIComponent(exceptId)}`, {
        method: 'DELETE',
      }),
    current: () => tokenStore.session(),
  },

  guilds: {
    list: () => request<APIGuild[]>('/guilds'),
    create: (name: string, iconText?: string, iconColor?: string) =>
      request<APIGuild>('/guilds', {
        method: 'POST',
        body: JSON.stringify({ name, icon_text: iconText, icon_color: iconColor }),
      }),
    update: (
      guildId: string,
      patch: Partial<{
        name: string;
        icon_url: string;
        banner_url: string;
        description: string;
        is_public: boolean;
        icon_text: string;
        icon_color: string;
        owner_id: string;
        vanity_url_code: string;
        afk_channel_id: string;
        system_channel_id: string;
        verification_level: number;
        explicit_content_filter: number;
        auto_role_id: string;
      }>,
    ) => request<APIGuild>(`/guilds/${guildId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    auditLog: (guildId: string) =>
      request<
        Array<{
          id: Snowflake;
          actor_id: Snowflake;
          action: string;
          target_id?: Snowflake;
          reason?: string;
          created_at: string;
        }>
      >(`/guilds/${guildId}/audit-log`),
    deleteGuild: (guildId: string) => request<void>(`/guilds/${guildId}`, { method: 'DELETE' }),
    insights: (guildId: string) =>
      request<{
        member_count: number;
        new_members_7d: number;
        new_members_30d: number;
        messages_7d: number;
        messages_30d: number;
        top_channels: Array<{ id: string; name: string; count: number }>;
        top_members: Array<{ id: string; name: string; count: number }>;
        member_growth: Array<{ date: string; count: number }>;
        message_activity: Array<{ date: string; count: number }>;
      }>(`/guilds/${guildId}/insights`),
    channels: (guildId: string) => request<APIChannel[]>(`/guilds/${guildId}/channels`),
    createChannel: (
      guildId: string,
      name: string,
      type: 'text' | 'voice' | 'announcement' | 'forum' | 'stage' | 'category' | 'media' = 'text',
      parentId?: string | null,
    ) =>
      request<APIChannel>('/channels', {
        method: 'POST',
        body: JSON.stringify({ guild_id: guildId, name, type, parent_id: parentId ?? undefined }),
      }),
    members: (guildId: string) => request<APIMember[]>(`/guilds/${guildId}/members`),
    createInvite: (guildId: string, opts: { max_uses?: number; expires_in_sec?: number } = {}) =>
      request<APIInvite>(`/guilds/${guildId}/invites`, {
        method: 'POST',
        body: JSON.stringify(opts),
      }),
    invites: (guildId: string) => request<APIInvite[]>(`/guilds/${guildId}/invites`),

    discover: () =>
      request<
        Array<{
          id: Snowflake;
          name: string;
          icon_text: string;
          icon_color: string;
          description: string;
          member_count: number;
          joined: boolean;
        }>
      >('/discover/guilds'),
    joinPublic: (guildId: string) =>
      request<APIGuild>(`/discover/guilds/${guildId}/join`, { method: 'POST' }),
    leave: (guildId: string) => request<void>(`/guilds/${guildId}/leave`, { method: 'POST' }),
    notifSettings: (
      guildId: string,
      notifLevel: 'all' | 'mentions' | 'nothing',
      muteUntilSec?: number,
    ) =>
      request<void>(`/guilds/${guildId}/notif-settings`, {
        method: 'PUT',
        body: JSON.stringify({ notif_level: notifLevel, mute_until_sec: muteUntilSec ?? 0 }),
      }),

    automodRules: (guildId: string) =>
      request<APIAutomodRule[]>(`/guilds/${guildId}/automod-rules`),
    createAutomodRule: (
      guildId: string,
      input: {
        name: string;
        trigger_type: string;
        trigger_data?: any;
        actions?: any;
        enabled?: boolean;
      },
    ) =>
      request<APIAutomodRule>(`/guilds/${guildId}/automod-rules`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    updateAutomodRule: (guildId: string, ruleId: string, enabled: boolean) =>
      request<void>(`/guilds/${guildId}/automod-rules/${ruleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    deleteAutomodRule: (guildId: string, ruleId: string) =>
      request<void>(`/guilds/${guildId}/automod-rules/${ruleId}`, { method: 'DELETE' }),

    roles: (guildId: string) => request<APIRole[]>(`/guilds/${guildId}/roles`),
    createRole: (
      guildId: string,
      input: {
        name: string;
        color?: number;
        permissions?: string;
        hoist?: boolean;
        mentionable?: boolean;
        icon?: string;
      },
    ) =>
      request<APIRole>(`/guilds/${guildId}/roles`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    updateRole: (
      guildId: string,
      roleId: string,
      input: Partial<{
        name: string;
        color: number;
        permissions: string;
        hoist: boolean;
        mentionable: boolean;
        position: number;
        icon: string;
      }>,
    ) =>
      request<APIRole>(`/guilds/${guildId}/roles/${roleId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    deleteRole: (guildId: string, roleId: string) =>
      request<void>(`/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' }),
    setVoiceState: (guildId: string, userId: string, state: { mute?: boolean; deafen?: boolean }) =>
      request<void>(`/guilds/${guildId}/members/${userId}/voice`, {
        method: 'PATCH',
        body: JSON.stringify(state),
      }),
    setNickname: (guildId: string, userId: string, nickname: string) =>
      request<void>(`/guilds/${guildId}/members/${userId}/nickname`, {
        method: 'PATCH',
        body: JSON.stringify({ nickname }),
      }),
    setMyProfile: (
      guildId: string,
      input: { nickname?: string; guild_avatar_url?: string | null; guild_bio?: string | null },
    ) =>
      request<void>(`/guilds/${guildId}/members/me/profile`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    assignRole: (guildId: string, userId: string, roleId: string) =>
      request<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' }),
    unassignRole: (guildId: string, userId: string, roleId: string) =>
      request<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' }),

    kick: (guildId: string, userId: string) =>
      request<void>(`/guilds/${guildId}/members/${userId}`, { method: 'DELETE' }),
    ban: (guildId: string, userId: string, reason?: string, deleteMessageHours?: number) =>
      request<void>(`/guilds/${guildId}/bans/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          reason: reason ?? '',
          delete_message_hours: deleteMessageHours ?? 0,
        }),
      }),
    unban: (guildId: string, userId: string) =>
      request<void>(`/guilds/${guildId}/bans/${userId}`, { method: 'DELETE' }),
    bans: (guildId: string) => request<APIBan[]>(`/guilds/${guildId}/bans`),
    timeout: (guildId: string, userId: string, durationSec: number) =>
      request<{ timeout_until: string | null }>(`/guilds/${guildId}/members/${userId}/timeout`, {
        method: 'PATCH',
        body: JSON.stringify({ duration_sec: durationSec }),
      }),
  },

  invites: {
    preview: (code: string) => request<APIInvitePreview>(`/invites/${code}`),
    accept: (code: string) => request<APIGuild>(`/invites/${code}/accept`, { method: 'POST' }),
    delete: (code: string) => request<void>(`/invites/${code}`, { method: 'DELETE' }),
  },

  dms: {
    list: () => request<APIDMChannel[]>('/users/me/channels'),
    open: (userId: string) =>
      request<{ channel_id: string }>('/users/me/channels', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),
    createGroup: (userIds: string[], name?: string) =>
      request<{ channel_id: string; name: string }>('/users/me/group-channels', {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds, name }),
      }),
    addRecipient: (channelId: string, userId: string) =>
      request<void>(`/channels/${channelId}/recipients/${userId}`, { method: 'PUT' }),
    removeRecipient: (channelId: string, userId: string) =>
      request<void>(`/channels/${channelId}/recipients/${userId}`, { method: 'DELETE' }),
  },

  reactions: {
    list: (messageId: string) => request<APIReaction[]>(`/messages/${messageId}/reactions`),
    users: (messageId: string, emoji: string) =>
      request<Array<{ id: Snowflake; display_name: string; avatar_color: string }>>(
        `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/users`,
      ),
    add: (messageId: string, emoji: string) =>
      request<void>(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
        method: 'PUT',
      }),
    remove: (messageId: string, emoji: string) =>
      request<void>(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
        method: 'DELETE',
      }),
  },

  reactionRoles: {
    list: (guildId: string) => request<APIReactionRole[]>(`/guilds/${guildId}/reaction-roles`),
    create: (
      guildId: string,
      input: { channel_id: string; message_id: string; emoji: string; role_id: string },
    ) =>
      request<APIReactionRole>(`/guilds/${guildId}/reaction-roles`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    delete: (bindingId: string) =>
      request<void>(`/reaction-roles/${bindingId}`, { method: 'DELETE' }),
  },

  welcome: {
    get: (guildId: string) => request<APIGuildWelcome>(`/guilds/${guildId}/welcome`),
    update: (
      guildId: string,
      input: Partial<{
        enabled: boolean;
        description: string;
        welcome_channels: APIWelcomeChannel[];
        rules_text: string;
        require_accept: boolean;
        onboarding_prompts: APIOnboardingPrompt[];
      }>,
    ) =>
      request<APIGuildWelcome>(`/guilds/${guildId}/welcome`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    acceptOnboarding: (guildId: string, selectedOptionIds?: string[]) =>
      request<void>(`/guilds/${guildId}/onboarding/accept`, {
        method: 'POST',
        body: JSON.stringify({ selected_option_ids: selectedOptionIds ?? [] }),
      }),
  },

  webhooks: {
    list: (channelId: string) =>
      request<
        Array<{
          id: Snowflake;
          channel_id: Snowflake;
          guild_id: Snowflake;
          name: string;
          avatar_url?: string;
          created_at: string;
        }>
      >(`/channels/${channelId}/webhooks`),
    create: (channelId: string, name: string) =>
      request<{
        id: Snowflake;
        channel_id: Snowflake;
        name: string;
        token: string;
        created_at: string;
      }>(`/channels/${channelId}/webhooks`, { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (webhookId: string) => request<void>(`/webhooks/${webhookId}`, { method: 'DELETE' }),
  },

  applications: {
    list: () => request<APIApplication[]>('/applications'),
    create: (name: string, description?: string) =>
      request<APIApplication>('/applications', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || undefined }),
      }),
    update: (
      applicationId: string,
      patch: Partial<{ name: string; description: string; public: boolean }>,
    ) =>
      request<void>(`/applications/${applicationId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    remove: (applicationId: string) =>
      request<void>(`/applications/${applicationId}`, { method: 'DELETE' }),
    resetToken: (applicationId: string) =>
      request<{ token: string }>(`/applications/${applicationId}/reset-token`, { method: 'POST' }),
    addToGuild: (guildId: string, applicationId: string) =>
      request<{ added: boolean; bot_user_id: string }>(`/guilds/${guildId}/bots`, {
        method: 'POST',
        body: JSON.stringify({ application_id: applicationId }),
      }),
  },

  connections: {
    list: () => request<APIConnection[]>('/users/me/connections'),
    create: (type: string, name: string) =>
      request<APIConnection>('/users/me/connections', {
        method: 'POST',
        body: JSON.stringify({ type, name }),
      }),
    setVisible: (connectionId: string, visible: boolean) =>
      request<void>(`/users/me/connections/${connectionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ visible }),
      }),
    remove: (connectionId: string) =>
      request<void>(`/users/me/connections/${connectionId}`, { method: 'DELETE' }),
    githubAuthorize: () => request<{ url: string }>('/connections/github/authorize'),
  },

  follows: {
    follow: (channelId: string, targetChannelId: string) =>
      request<{ id: Snowflake; source_channel_id: Snowflake; target_channel_id: Snowflake }>(
        `/channels/${channelId}/followers`,
        { method: 'POST', body: JSON.stringify({ target_channel_id: targetChannelId }) },
      ),
    listForGuild: (guildId: string) =>
      request<
        Array<{
          id: Snowflake;
          source_channel_id: Snowflake;
          source_channel: string;
          source_guild: string;
          target_channel_id: Snowflake;
          target_channel: string;
          created_at: string;
        }>
      >(`/guilds/${guildId}/follows`),
    remove: (followId: string) => request<void>(`/follows/${followId}`, { method: 'DELETE' }),
    crosspost: (channelId: string, messageId: string) =>
      request<{ published: boolean; delivered_to: number }>(
        `/channels/${channelId}/messages/${messageId}/crosspost`,
        { method: 'POST' },
      ),
  },

  uploads: {
    presign: (input: { filename: string; content_type: string; size_bytes: number }) =>
      request<{ upload_url: string; public_url: string; key: string; filename: string }>(
        '/uploads/presign',
        { method: 'POST', body: JSON.stringify(input) },
      ),
  },

  notifications: {
    count: () => request<{ unread: number }>('/notifications/count'),
    list: () => request<APINotification[]>('/notifications'),
    markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
  },

  search: {
    messages: (
      q: string,
      opts: {
        guildId?: string;
        channelId?: string;
        authorId?: string;
        mentions?: string;
        pinned?: boolean;
        has?: string[];
        before?: string;
        after?: string;
        during?: string;
        limit?: number;
      } = {},
    ) => {
      const p = new URLSearchParams({ q });
      if (opts.guildId) p.set('guild_id', opts.guildId);
      if (opts.channelId) p.set('channel_id', opts.channelId);
      if (opts.authorId) p.set('author_id', opts.authorId);
      if (opts.mentions) p.set('mentions', opts.mentions);
      if (opts.pinned) p.set('pinned', 'true');
      if (opts.before) p.set('before', opts.before);
      if (opts.after) p.set('after', opts.after);
      if (opts.during) p.set('during', opts.during);
      (opts.has ?? []).forEach((h) => p.append('has', h));
      if (opts.limit) p.set('limit', String(opts.limit));
      return request<APISearchResult[]>(`/search/messages?${p}`);
    },
  },

  messages: {
    edit: (messageId: string, content: string) =>
      request<APIMessage>(`/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    delete: (messageId: string) => request<void>(`/messages/${messageId}`, { method: 'DELETE' }),
    pin: (messageId: string) => request<void>(`/messages/${messageId}/pin`, { method: 'PUT' }),
    unpin: (messageId: string) => request<void>(`/messages/${messageId}/pin`, { method: 'DELETE' }),
    edits: (messageId: string) =>
      request<Array<{ id: string; old_content: string; edited_at: string }>>(
        `/messages/${messageId}/edits`,
      ),
  },

  events: {
    list: (guildId: string) =>
      request<
        Array<{
          id: Snowflake;
          guild_id: Snowflake;
          channel_id?: Snowflake;
          creator_id: Snowflake;
          name: string;
          description?: string;
          scheduled_start_at: string;
          scheduled_end_at?: string;
          entity_type: 'voice' | 'stage_instance' | 'external';
          entity_location?: string;
          status: 'scheduled' | 'active' | 'completed' | 'canceled';
          image_url?: string;
          subscriber_count: number;
          subscribed: boolean;
        }>
      >(`/guilds/${guildId}/events`),
    create: (
      guildId: string,
      input: {
        name: string;
        description?: string;
        scheduled_start_at: string;
        scheduled_end_at?: string;
        entity_type: 'voice' | 'stage_instance' | 'external';
        channel_id?: string;
        entity_location?: string;
        image_url?: string;
      },
    ) =>
      request<{ id: Snowflake }>(`/guilds/${guildId}/events`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    delete: (eventId: string) => request<void>(`/events/${eventId}`, { method: 'DELETE' }),
    subscribe: (eventId: string) =>
      request<void>(`/events/${eventId}/subscribers/me`, { method: 'PUT' }),
    unsubscribe: (eventId: string) =>
      request<void>(`/events/${eventId}/subscribers/me`, { method: 'DELETE' }),
  },

  stickers: {
    list: (guildId: string) =>
      request<
        Array<{
          id: Snowflake;
          guild_id: Snowflake;
          name: string;
          description?: string;
          tags?: string;
          url: string;
          format: 'png' | 'apng' | 'lottie';
          creator_id: Snowflake;
          created_at: string;
        }>
      >(`/guilds/${guildId}/stickers`),
    create: (
      guildId: string,
      input: { name: string; description?: string; tags?: string; url: string; format?: string },
    ) =>
      request<{ id: Snowflake }>(`/guilds/${guildId}/stickers`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    delete: (stickerId: string) => request<void>(`/stickers/${stickerId}`, { method: 'DELETE' }),
  },

  push: {
    subscribe: (input: { endpoint: string; p256dh: string; auth: string }) =>
      request<void>('/users/me/push-subscriptions', { method: 'PUT', body: JSON.stringify(input) }),
    unsubscribeAll: () => request<void>('/users/me/push-subscriptions', { method: 'DELETE' }),
  },

  sounds: {
    list: (guildId: string) =>
      request<
        Array<{
          id: Snowflake;
          guild_id: Snowflake;
          name: string;
          emoji?: string;
          file_url: string;
          volume: number;
          uploader_id: Snowflake;
          created_at: string;
        }>
      >(`/guilds/${guildId}/sounds`),
    create: (
      guildId: string,
      input: { name: string; emoji?: string; file_url: string; volume?: number },
    ) =>
      request<{ id: Snowflake; file_url: string }>(`/guilds/${guildId}/sounds`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    delete: (soundId: string) => request<void>(`/sounds/${soundId}`, { method: 'DELETE' }),
    play: (soundId: string, channelId: string) =>
      request<void>(`/sounds/${soundId}/play`, {
        method: 'POST',
        body: JSON.stringify({ channel_id: channelId }),
      }),
  },

  stageInstances: {
    create: (input: {
      channel_id: string;
      topic: string;
      privacy_level?: 'guild_only' | 'public';
    }) =>
      request<{ channel_id: Snowflake; topic: string }>(`/stage-instances`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    get: (channelId: string) =>
      request<{ channel_id: Snowflake; topic: string; started_by: Snowflake; started_at: string }>(
        `/stage-instances/${channelId}`,
      ),
    delete: (channelId: string) =>
      request<void>(`/stage-instances/${channelId}`, { method: 'DELETE' }),
  },

  readStates: {
    list: () => request<APIReadState[]>('/users/me/read-states'),
    ack: (channelId: string, lastMessageId: string) =>
      request<void>(`/channels/${channelId}/ack`, {
        method: 'POST',
        body: JSON.stringify({ last_message_id: lastMessageId }),
      }),
  },

  friends: {
    list: () =>
      request<
        Array<{
          user_id: Snowflake;
          username: string;
          display_name: string;
          avatar_color: string;
          status: 'online' | 'idle' | 'dnd' | 'offline';
          bot: boolean;
          friendship: 'accepted' | 'pending_sent' | 'pending_received' | 'blocked';
        }>
      >('/friends'),
    send: (input: { username?: string; user_id?: string }) =>
      request<void>('/friends', { method: 'POST', body: JSON.stringify(input) }),
    accept: (userId: string) => request<void>(`/friends/${userId}/accept`, { method: 'PUT' }),
    remove: (userId: string) => request<void>(`/friends/${userId}`, { method: 'DELETE' }),
  },

  commands: {
    list: (guildId: string) => request<APICommand[]>(`/guilds/${guildId}/commands`),
    create: (
      guildId: string,
      input: { name: string; description: string; response: string; options?: APICommandOption[] },
    ) =>
      request<{ id: Snowflake }>(`/guilds/${guildId}/commands`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    delete: (commandId: string) => request<void>(`/commands/${commandId}`, { method: 'DELETE' }),
    run: (channelId: string, name: string, args?: Record<string, string>) =>
      request<APIMessage>(`/channels/${channelId}/commands/run?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify({ args: args ?? {} }),
      }),
  },

  folders: {
    list: () =>
      request<
        Array<{
          id: Snowflake;
          name: string;
          color: number;
          position: number;
          guild_ids: Snowflake[];
        }>
      >('/users/me/folders'),
    create: (input: { name: string; color?: number; guild_ids?: string[] }) =>
      request<{ id: Snowflake }>('/users/me/folders', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (folderId: string, input: { name?: string; color?: number; guild_ids?: string[] }) =>
      request<void>(`/folders/${folderId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    delete: (folderId: string) => request<void>(`/folders/${folderId}`, { method: 'DELETE' }),
  },

  embeds: {
    forMessage: (messageId: string) =>
      request<
        Array<{
          id: Snowflake;
          url: string;
          title?: string;
          description?: string;
          image_url?: string;
          site_name?: string;
          embed_type: 'link' | 'image' | 'video' | 'article';
        }>
      >(`/messages/${messageId}/embeds`),
  },

  polls: {
    create: (
      channelId: string,
      input: {
        question: string;
        answers: { text: string; emoji?: string }[];
        allow_multiselect?: boolean;
        anonymous?: boolean;
        duration_hours?: number;
      },
    ) =>
      request<APIMessage>(`/channels/${channelId}/polls`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    forMessage: (messageId: string) => request<APIPoll>(`/messages/${messageId}/poll`),
    vote: (pollId: string, answerId: string) =>
      request<void>(`/polls/${pollId}/answers/${answerId}/vote`, { method: 'PUT' }),
    unvote: (pollId: string, answerId: string) =>
      request<void>(`/polls/${pollId}/answers/${answerId}/vote`, { method: 'DELETE' }),
    close: (pollId: string) => request<void>(`/polls/${pollId}/close`, { method: 'POST' }),
    voters: (pollId: string, answerId: string) =>
      request<
        Array<{ id: Snowflake; display_name: string; avatar_color: string; avatar_url?: string }>
      >(`/polls/${pollId}/answers/${answerId}/voters`),
  },

  savedMessages: {
    list: () => request<APISavedMessage[]>(`/users/me/saved-messages`),
    save: (messageId: string) => request<void>(`/messages/${messageId}/save`, { method: 'PUT' }),
    unsave: (messageId: string) =>
      request<void>(`/messages/${messageId}/save`, { method: 'DELETE' }),
  },

  twofa: {
    enable: () =>
      request<{ secret: string; otpauth_url: string }>(`/users/me/2fa/enable`, { method: 'POST' }),
    verify: (code: string) =>
      request<void>(`/users/me/2fa/verify`, { method: 'POST', body: JSON.stringify({ code }) }),
    disable: (code: string) =>
      request<void>(`/users/me/2fa/disable`, { method: 'POST', body: JSON.stringify({ code }) }),
  },

  reminders: {
    list: () => request<APIReminder[]>(`/users/me/reminders`),
    create: (messageId: string, remindAt: string) =>
      request<APIReminder>(`/messages/${messageId}/remind`, {
        method: 'POST',
        body: JSON.stringify({ remind_at: remindAt }),
      }),
    delete: (reminderId: string) => request<void>(`/reminders/${reminderId}`, { method: 'DELETE' }),
  },

  scheduledMessages: {
    list: (channelId: string) =>
      request<APIScheduledMessage[]>(`/channels/${channelId}/scheduled-messages`),
    create: (channelId: string, content: string, scheduledFor: string) =>
      request<APIScheduledMessage>(`/channels/${channelId}/scheduled-messages`, {
        method: 'POST',
        body: JSON.stringify({ content, scheduled_for: scheduledFor }),
      }),
    delete: (schedId: string) =>
      request<void>(`/scheduled-messages/${schedId}`, { method: 'DELETE' }),
  },

  emojis: {
    list: (guildId: string) =>
      request<
        Array<{
          id: Snowflake;
          guild_id: Snowflake;
          name: string;
          url: string;
          animated: boolean;
          creator_id: Snowflake;
          created_at: string;
        }>
      >(`/guilds/${guildId}/emojis`),
    create: (guildId: string, input: { name: string; url: string; animated?: boolean }) =>
      request<{ id: Snowflake }>(`/guilds/${guildId}/emojis`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    delete: (guildId: string, emojiId: string) =>
      request<void>(`/guilds/${guildId}/emojis/${emojiId}`, { method: 'DELETE' }),
  },

  threads: {
    create: (
      channelId: string,
      input: {
        name: string;
        type?: 'public_thread' | 'private_thread';
        starter_message_id?: string;
        tag_ids?: string[];
      },
    ) =>
      request<APIChannel>(`/channels/${channelId}/threads`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    list: (channelId: string, archived = false) =>
      request<
        Array<
          APIChannel & {
            archived?: boolean;
            message_count?: number;
            member_count?: number;
            creator_id?: string;
            tag_ids?: string[];
          }
        >
      >(`/channels/${channelId}/threads${archived ? '?archived=true' : ''}`),
    join: (channelId: string) =>
      request<void>(`/channels/${channelId}/thread-members/me`, { method: 'PUT' }),
    leave: (channelId: string) =>
      request<void>(`/channels/${channelId}/thread-members/me`, { method: 'DELETE' }),
    setState: (channelId: string, state: { archived?: boolean; locked?: boolean }) =>
      request<void>(`/channels/${channelId}/thread-state`, {
        method: 'PATCH',
        body: JSON.stringify(state),
      }),
  },

  forumTags: {
    list: (channelId: string) =>
      request<Array<{ id: string; name: string; emoji?: string; position: number }>>(
        `/channels/${channelId}/forum-tags`,
      ),
    create: (channelId: string, input: { name: string; emoji?: string }) =>
      request<{ id: string; name: string; emoji?: string; position: number }>(
        `/channels/${channelId}/forum-tags`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ),
    delete: (tagId: string) => request<void>(`/forum-tags/${tagId}`, { method: 'DELETE' }),
  },

  channels: {
    create: (
      guildId: string,
      name: string,
      type = 'text',
      parentId?: string | null,
      topic?: string,
    ) =>
      request<APIChannel>('/channels', {
        method: 'POST',
        body: JSON.stringify({
          guild_id: guildId,
          name,
          type,
          parent_id: parentId ?? undefined,
          topic: topic || undefined,
        }),
      }),
    update: (
      channelId: string,
      patch: {
        name?: string;
        topic?: string;
        nsfw?: boolean;
        rate_limit_sec?: number;
        auto_archive_minutes?: number;
        parent_id?: string | null;
        position?: number;
        user_limit?: number;
        bitrate?: number;
      },
    ) =>
      request<APIChannel>(`/channels/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    delete: (channelId: string) => request<void>(`/channels/${channelId}`, { method: 'DELETE' }),
    muteSettings: (
      channelId: string,
      input: {
        notif_level?: 'all' | 'mentions' | 'nothing';
        mute_until_sec?: number;
      },
    ) =>
      request<void>(`/channels/${channelId}/notif-settings`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    upsertOverride: (
      channelId: string,
      input: { target_type: 'role' | 'user'; target_id: string; allow: string; deny: string },
    ) =>
      request<void>(`/channels/${channelId}/overrides`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    listOverrides: (channelId: string) =>
      request<
        Array<{
          channel_id: string;
          target_type: 'role' | 'user';
          target_id: string;
          allow: string;
          deny: string;
        }>
      >(`/channels/${channelId}/overrides`),
    deleteOverride: (channelId: string, targetType: 'role' | 'user', targetId: string) =>
      request<void>(`/channels/${channelId}/overrides/${targetType}/${targetId}`, {
        method: 'DELETE',
      }),
    pins: (channelId: string) => request<APIMessage[]>(`/channels/${channelId}/pins`),
    messages: (channelId: string, before?: string, limit = 50) => {
      const q = new URLSearchParams();
      if (before) q.set('before', before);
      q.set('limit', String(limit));
      return request<APIMessage[]>(`/channels/${channelId}/messages?${q}`);
    },
    sendMessage: (
      channelId: string,
      content: string,
      attachments?: { url: string; filename: string; content_type: string; size_bytes: number }[],
      opts?: { replied_to_id?: string; forwarded_from_message_id?: string; embeds?: RichEmbed[] },
    ) =>
      request<APIMessage>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, attachments, ...opts }),
      }),
  },
};
