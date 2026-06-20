// Hafif ekran-yığını navigasyon tipleri (react-navigation yerine sade stack).
export type OpenChannel = { id: string; name: string; guildId?: string; type?: string; participants?: string[] };

export type Screen =
  | { kind: 'home' }
  | { kind: 'chat'; channel: OpenChannel }
  | { kind: 'forum'; channel: OpenChannel }
  | { kind: 'friends' }
  | { kind: 'discover' }
  | { kind: 'notifications' }
  | { kind: 'userSettings' }
  | { kind: 'serverSettings'; guildId: string; guildName: string }
  | { kind: 'serverContent'; guildId: string; guildName: string }
  | { kind: 'channelSettings'; channelId: string; channelName: string; guildId?: string }
  | { kind: 'savedMessages' }
  | { kind: 'developer' }
  | { kind: 'quickSwitch' }
  | { kind: 'members'; guildId: string; guildName: string }
  | { kind: 'search'; guildId?: string; channelId?: string };

export interface Nav {
  push: (s: Screen) => void;
  pop: () => void;
  reset: (s: Screen) => void;
}
