// Paylaşımlı TS tipleri — web/mobile/desktop/proto arasında tutarlılık için.

export type Snowflake = string;

export interface User {
  id: Snowflake;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: number;
}

export interface Guild {
  id: Snowflake;
  name: string;
  iconUrl: string | null;
  ownerId: Snowflake;
  createdAt: number;
}

export type ChannelType =
  | 'text'
  | 'voice'
  | 'category'
  | 'announcement'
  | 'forum'
  | 'stage'
  | 'dm'
  | 'group_dm';

export interface Channel {
  id: Snowflake;
  guildId: Snowflake | null;
  type: ChannelType;
  name: string;
  topic: string | null;
  position: number;
  parentId: Snowflake | null;
}

export interface Message {
  id: Snowflake;
  channelId: Snowflake;
  authorId: Snowflake;
  content: string;
  createdAt: number;
  editedAt: number | null;
  attachments: Attachment[];
  mentions: Snowflake[];
}

export interface Attachment {
  id: Snowflake;
  url: string;
  filename: string;
  size: number;
  contentType: string;
}

// Gateway event türleri (Discord'un gateway opcode'larına benzer)
export type GatewayEventType =
  | 'READY'
  | 'MESSAGE_CREATE'
  | 'MESSAGE_UPDATE'
  | 'MESSAGE_DELETE'
  | 'TYPING_START'
  | 'PRESENCE_UPDATE'
  | 'GUILD_CREATE'
  | 'GUILD_DELETE'
  | 'CHANNEL_CREATE'
  | 'CHANNEL_UPDATE'
  | 'CHANNEL_DELETE'
  | 'VOICE_STATE_UPDATE';

export interface GatewayEvent<T = unknown> {
  type: GatewayEventType;
  payload: T;
  ts: number;
}
