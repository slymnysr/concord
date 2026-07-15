import { configureStore, createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import { api, type APIUser, type APIGuild, type APIChannel, type APIMessage, type APIMember, type APIReaction, type APIReadState } from './api';
import { httpUrl } from './serverConfig';

// ===== NAVIGASYON KALICILIĞI (F5 sonrası kaldığın yerden devam) =====
interface NavSnapshot {
  mode: 'guild' | 'dm' | 'discover';
  guildId: string | null;
  channelId: string | null;
  dmChannelId: string | null;
}
function loadNav(): NavSnapshot {
  try {
    const raw = localStorage.getItem('concord_nav');
    if (raw) {
      const n = JSON.parse(raw);
      return {
        mode: n.mode === 'dm' ? 'dm' : n.mode === 'discover' ? 'discover' : 'guild',
        guildId: n.guildId ?? null,
        channelId: n.channelId ?? null,
        dmChannelId: n.dmChannelId ?? null,
      };
    }
  } catch {
    /* yoksay */
  }
  return { mode: 'guild', guildId: null, channelId: null, dmChannelId: null };
}
const NAV = loadNav();

// ===== AUTH =====
interface AuthState {
  user: APIUser | null;
  loading: boolean;
  error: string | null;
}

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (input: { email: string; password: string; totp_code?: string }, { rejectWithValue }) => {
    try {
      const r = await api.login(input);
      return r.user;
    } catch (e: any) {
      // 2FA akışı için hata kodunu olduğu gibi ilet (AuthPage yakalar)
      if (e?.code === '2fa_required' || e?.code === 'invalid_2fa') {
        return rejectWithValue(e.code);
      }
      return rejectWithValue(e.message || 'Giriş başarısız');
    }
  },
);

export const registerThunk = createAsyncThunk(
  'auth/register',
  async (
    input: { username: string; email: string; display_name: string; password: string },
    { rejectWithValue },
  ) => {
    try {
      const r = await api.register(input);
      return r.user;
    } catch (e: any) {
      return rejectWithValue(e.message || 'Kayıt başarısız');
    }
  },
);

export const fetchMe = createAsyncThunk('auth/me', async () => {
  return await api.me();
});

const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, loading: false, error: null } as AuthState,
  reducers: {
    logout(state) {
      api.logout();
      state.user = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (s) => { s.loading = true; s.error = null; })
      .addCase(loginThunk.fulfilled, (s, a) => { s.loading = false; s.user = a.payload; })
      .addCase(loginThunk.rejected, (s, a) => { s.loading = false; s.error = a.payload as string; })
      .addCase(registerThunk.pending, (s) => { s.loading = true; s.error = null; })
      .addCase(registerThunk.fulfilled, (s, a) => { s.loading = false; s.user = a.payload; })
      .addCase(registerThunk.rejected, (s, a) => { s.loading = false; s.error = a.payload as string; })
      .addCase(fetchMe.fulfilled, (s, a) => { s.user = a.payload; })
      .addCase(fetchMe.rejected, (s) => { s.user = null; });
  },
});

// ===== GUILDS =====
interface GuildsState {
  list: APIGuild[];
  selectedId: string | null;
  loading: boolean;
}

export const fetchGuilds = createAsyncThunk('guilds/list', async () => {
  return await api.guilds.list();
});

export const createGuildThunk = createAsyncThunk(
  'guilds/create',
  async (name: string) => {
    return await api.guilds.create(name);
  },
);

const guildsSlice = createSlice({
  name: 'guilds',
  initialState: { list: [], selectedId: NAV.guildId, loading: false } as GuildsState,
  reducers: {
    selectGuild(state, action: PayloadAction<string>) {
      state.selectedId = action.payload;
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchGuilds.pending, (s) => { s.loading = true; })
     .addCase(fetchGuilds.fulfilled, (s, a) => {
       s.loading = false;
       s.list = a.payload;
       // Seçili yoksa ya da kayıtlı sunucu artık yoksa (silinmiş/çıkılmış) ilk sunucuya düş
       const exists = s.selectedId && a.payload.some((g) => g.id === s.selectedId);
       if (!exists && a.payload.length > 0) {
         s.selectedId = a.payload[0].id;
       }
     })
     .addCase(createGuildThunk.fulfilled, (s, a) => {
       s.list.push(a.payload);
       s.selectedId = a.payload.id;
     });
  },
});

// ===== CHANNELS =====
interface ChannelsState {
  byGuild: Record<string, APIChannel[]>;
  selectedId: string | null;
  // Mod başına son seçili kanalı hatırla → mode değişince geri dönünce kullanıcı kaldığı yerden devam eder
  lastByMode: { guild: Record<string, string | null>; dm: string | null };
  loading: boolean;
}

export const fetchChannels = createAsyncThunk(
  'channels/list',
  async (guildId: string, { getState }) => {
    const list = await api.guilds.channels(guildId);
    // DM modundaysak ilk kanalı otomatik seçme (DM açık kalmalı)
    const mode = (getState() as RootState).ui.mode;
    return { guildId, list, mode };
  },
);

const channelsSlice = createSlice({
  name: 'channels',
  initialState: { byGuild: {}, selectedId: NAV.channelId, lastByMode: { guild: {}, dm: NAV.dmChannelId }, loading: false } as ChannelsState,
  reducers: {
    selectChannel(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    rememberGuildChannel(state, action: PayloadAction<{ guildId: string; channelId: string | null }>) {
      state.lastByMode.guild[action.payload.guildId] = action.payload.channelId;
    },
    rememberDMChannel(state, action: PayloadAction<string | null>) {
      state.lastByMode.dm = action.payload;
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchChannels.fulfilled, (s, a) => {
      s.byGuild[a.payload.guildId] = a.payload.list;
      // Otomatik ilk-kanal seçimi sadece guild modunda; DM modunda seçili DM korunur
      if (a.payload.mode !== 'dm') {
        const firstText = a.payload.list.find((c) => c.type !== 'voice');
        if (firstText && (!s.selectedId || !a.payload.list.find((c) => c.id === s.selectedId))) {
          s.selectedId = firstText.id;
        }
      }
    });
  },
});

// ===== MESSAGES =====
interface MessagesState {
  byChannel: Record<string, APIMessage[]>;
  loading: boolean;
  // İlk yüklemesi süren kanal (cache boşken iskelet göstermek için)
  loadingChannel: string | null;
}

export const fetchMessages = createAsyncThunk(
  'messages/list',
  async (channelId: string) => {
    const list = await api.channels.messages(channelId);
    return { channelId, list: list.slice().reverse() };
  },
);

export const sendMessageThunk = createAsyncThunk(
  'messages/send',
  async (input: { channelId: string; content: string }) => {
    return await api.channels.sendMessage(input.channelId, input.content);
  },
);

const messagesSlice = createSlice({
  name: 'messages',
  initialState: { byChannel: {}, loading: false, loadingChannel: null } as MessagesState,
  reducers: {
    pushMessage(state, action: PayloadAction<APIMessage>) {
      const list = state.byChannel[action.payload.channel_id] ?? [];
      if (list.some((m) => m.id === action.payload.id)) return;
      list.push(action.payload);
      state.byChannel[action.payload.channel_id] = list;
    },
    prependMessages(state, action: PayloadAction<{ channelId: string; list: APIMessage[] }>) {
      const existing = state.byChannel[action.payload.channelId] ?? [];
      const have = new Set(existing.map((m) => m.id));
      const older = action.payload.list.filter((m) => !have.has(m.id));
      state.byChannel[action.payload.channelId] = [...older, ...existing];
    },
    updateMessage(state, action: PayloadAction<APIMessage>) {
      const list = state.byChannel[action.payload.channel_id] ?? [];
      const idx = list.findIndex((m) => m.id === action.payload.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...action.payload };
      }
    },
    removeMessage(state, action: PayloadAction<{ channel_id: string; id: string }>) {
      const list = state.byChannel[action.payload.channel_id] ?? [];
      state.byChannel[action.payload.channel_id] = list.filter((m) => m.id !== action.payload.id);
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchMessages.pending, (s, a) => {
      s.loadingChannel = a.meta.arg;
    })
    .addCase(fetchMessages.rejected, (s, a) => {
      if (s.loadingChannel === a.meta.arg) s.loadingChannel = null;
    })
    .addCase(fetchMessages.fulfilled, (s, a) => {
      s.byChannel[a.payload.channelId] = a.payload.list;
      if (s.loadingChannel === a.payload.channelId) s.loadingChannel = null;
    })
     .addCase(sendMessageThunk.fulfilled, (s, a) => {
       const list = s.byChannel[a.payload.channel_id] ?? [];
       if (!list.some((m) => m.id === a.payload.id)) {
         list.push(a.payload);
         s.byChannel[a.payload.channel_id] = list;
       }
     });
  },
});

// ===== USERS CACHE =====
interface UsersState {
  byId: Record<string, APIUser>;
}

const usersSlice = createSlice({
  name: 'users',
  initialState: { byId: {} } as UsersState,
  reducers: {
    upsertUser(state, action: PayloadAction<APIUser>) {
      state.byId[action.payload.id] = action.payload;
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchMe.fulfilled, (s, a) => {
      s.byId[a.payload.id] = a.payload;
    })
     .addCase(loginThunk.fulfilled, (s, a) => {
       s.byId[a.payload.id] = a.payload;
     })
     .addCase(registerThunk.fulfilled, (s, a) => {
       s.byId[a.payload.id] = a.payload;
     });
  },
});

// ===== REACTIONS =====
interface ReactionsState {
  byMessage: Record<string, APIReaction[]>;
}

export const fetchReactions = createAsyncThunk(
  'reactions/list',
  async (messageId: string) => {
    const list = await api.reactions.list(messageId);
    return { messageId, list };
  },
);

export const toggleReactionThunk = createAsyncThunk(
  'reactions/toggle',
  async (input: { messageId: string; emoji: string; isAdding: boolean }) => {
    if (input.isAdding) await api.reactions.add(input.messageId, input.emoji);
    else await api.reactions.remove(input.messageId, input.emoji);
    const list = await api.reactions.list(input.messageId);
    return { messageId: input.messageId, list };
  },
);

const reactionsSlice = createSlice({
  name: 'reactions',
  initialState: { byMessage: {} } as ReactionsState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchReactions.fulfilled, (s, a) => {
      s.byMessage[a.payload.messageId] = a.payload.list;
    })
     .addCase(toggleReactionThunk.fulfilled, (s, a) => {
       s.byMessage[a.payload.messageId] = a.payload.list;
     });
  },
});

// ===== MEMBERS =====
interface MembersState {
  byGuild: Record<string, APIMember[]>;
}

export const fetchMembers = createAsyncThunk(
  'members/list',
  async (guildId: string) => {
    const list = await api.guilds.members(guildId);
    return { guildId, list };
  },
);

const membersSlice = createSlice({
  name: 'members',
  initialState: { byGuild: {} } as MembersState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchMembers.fulfilled, (s, a) => {
      s.byGuild[a.payload.guildId] = a.payload.list;
    });
  },
});

// ===== INVITES =====
export const acceptInviteThunk = createAsyncThunk(
  'invites/accept',
  async (code: string, { dispatch, rejectWithValue }) => {
    try {
      const guild = await api.invites.accept(code);
      // Sunucu listesini yenile, yeni katılan guild seçili gelsin
      await dispatch(fetchGuilds());
      return guild;
    } catch (e: any) {
      return rejectWithValue(e.message || 'Davet kabul edilemedi');
    }
  },
);

// ===== PRESENCE =====
interface PresenceState {
  onlineByGuild: Record<string, string[]>;
  voiceByChannel: Record<string, string[]>;
  // Ses katılımcısı userId -> görünen ad (voice presence'tan; ID→ad lookup'ı gerektirmez)
  voiceNamesByUser: Record<string, string>;
  // Rich presence: guild -> userId -> aktivite (Oynuyor/Dinliyor/...)
  activityByGuild: Record<string, Record<string, { type: string; name: string; started_at?: number }>>;
  // Canlı durum: guild -> userId -> online/idle/dnd (görünmezler presence'ta hiç yok)
  statusByGuild: Record<string, Record<string, string>>;
}

export const fetchVoicePresence = createAsyncThunk(
  'presence/voice',
  async (channelIds: string[]) => {
    if (channelIds.length === 0) return {};
    const params = new URLSearchParams({ channels: channelIds.join(',') });
    const res = await fetch(httpUrl(`/voice-api/presence?${params}`));
    // Yeni biçim: kanal -> {id,name}[]; eski biçim (string[]) de desteklenir
    return (await res.json()) as Record<string, ({ id: string; name: string } | string)[]>;
  },
);

const presenceSlice = createSlice({
  name: 'presence',
  initialState: { onlineByGuild: {}, voiceByChannel: {}, voiceNamesByUser: {}, activityByGuild: {}, statusByGuild: {} } as PresenceState,
  reducers: {
    setGuildPresence(
      state,
      action: PayloadAction<{
        guildId: string;
        userIds: string[];
        activities?: Record<string, { type: string; name: string; started_at?: number }>;
        statuses?: Record<string, string>;
      }>,
    ) {
      state.onlineByGuild[action.payload.guildId] = action.payload.userIds;
      state.activityByGuild[action.payload.guildId] = action.payload.activities ?? {};
      state.statusByGuild[action.payload.guildId] = action.payload.statuses ?? {};
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchVoicePresence.fulfilled, (s, a) => {
      for (const [cid, peers] of Object.entries(a.payload)) {
        // Kimlik listesi (id[]) — voice yönlendirme/identity için
        s.voiceByChannel[cid] = peers.map((p) => (typeof p === 'string' ? p : p.id));
        // Görünen adları eşle — eski string[] biçiminde ad yok, atlanır
        for (const p of peers) {
          if (typeof p !== 'string' && p.name) s.voiceNamesByUser[p.id] = p.name;
        }
      }
    });
  },
});

// ===== TYPING =====
interface TypingState {
  byChannel: Record<string, { userId: string; expiresAt: number }[]>;
}

const typingSlice = createSlice({
  name: 'typing',
  initialState: { byChannel: {} } as TypingState,
  reducers: {
    setTyping(state, action: PayloadAction<{ channelId: string; userId: string }>) {
      const list = state.byChannel[action.payload.channelId] ?? [];
      const filtered = list.filter((t) => t.userId !== action.payload.userId);
      filtered.push({
        userId: action.payload.userId,
        expiresAt: Date.now() + 5000,
      });
      state.byChannel[action.payload.channelId] = filtered;
    },
    pruneTyping(state) {
      const now = Date.now();
      for (const cid of Object.keys(state.byChannel)) {
        state.byChannel[cid] = (state.byChannel[cid] ?? []).filter((t) => t.expiresAt > now);
      }
    },
  },
});

// ===== GUILD ROLES =====
interface GuildRolesState {
  byGuild: Record<string, any[]>;
}
export const fetchGuildRoles = createAsyncThunk('guildRoles/fetch', async (guildId: string) => {
  const list = await api.guilds.roles(guildId);
  return { guildId, list };
});
const guildRolesSlice = createSlice({
  name: 'guildRoles',
  initialState: { byGuild: {} } as GuildRolesState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchGuildRoles.fulfilled, (s, a) => {
      s.byGuild[a.payload.guildId] = a.payload.list;
    });
  },
});

// ===== TOASTS =====
interface ToastItem {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}
interface ToastsState {
  list: ToastItem[];
}
const toastsSlice = createSlice({
  name: 'toasts',
  initialState: { list: [] } as ToastsState,
  reducers: {
    addToast: {
      reducer: (state, action: PayloadAction<ToastItem>) => {
        state.list.push(action.payload);
        if (state.list.length > 5) state.list.shift();
      },
      prepare: (input: { kind: 'success' | 'error' | 'info'; message: string }) => ({
        payload: { id: Math.random().toString(36).slice(2), ...input },
      }),
    },
    removeToast(state, action: PayloadAction<string>) {
      state.list = state.list.filter((t) => t.id !== action.payload);
    },
  },
});

// ===== READ STATES =====
interface ReadStatesState {
  byChannel: Record<string, APIReadState>;
}

export const fetchReadStates = createAsyncThunk('readStates/list', async () => {
  return await api.readStates.list();
});

export const ackChannel = createAsyncThunk(
  'readStates/ack',
  async (input: { channelId: string; lastMessageId: string }) => {
    await api.readStates.ack(input.channelId, input.lastMessageId);
    return input;
  },
);

// Mesajı (ve sonrasını) okunmadı olarak işaretle: okundu state'ini bir önceki mesaja çeker
export const markChannelUnread =
  (channelId: string, beforeMessageId: string) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const list = getState().messages.byChannel[channelId] ?? [];
    const idx = list.findIndex((m) => m.id === beforeMessageId);
    const prevId = idx > 0 ? list[idx - 1].id : '';
    dispatch(ackChannel({ channelId, lastMessageId: prevId }));
  };

const readStatesSlice = createSlice({
  name: 'readStates',
  initialState: { byChannel: {} } as ReadStatesState,
  reducers: {
    bumpRead(state, action: PayloadAction<{ channelId: string; lastMessageId: string }>) {
      const cur = state.byChannel[action.payload.channelId] ?? {
        channel_id: action.payload.channelId,
        mention_count: 0,
        last_read_at: new Date().toISOString(),
      };
      state.byChannel[action.payload.channelId] = {
        ...cur,
        last_message_id: action.payload.lastMessageId,
        mention_count: 0,
        last_read_at: new Date().toISOString(),
      };
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchReadStates.fulfilled, (s, a) => {
      const next: Record<string, APIReadState> = {};
      for (const rs of a.payload) next[rs.channel_id] = rs;
      s.byChannel = next;
    }).addCase(ackChannel.fulfilled, (s, a) => {
      const cur = s.byChannel[a.payload.channelId];
      s.byChannel[a.payload.channelId] = {
        ...(cur ?? { channel_id: a.payload.channelId, mention_count: 0, last_read_at: new Date().toISOString() }),
        last_message_id: a.payload.lastMessageId,
        mention_count: 0,
        last_read_at: new Date().toISOString(),
      };
    });
  },
});

// ===== UI =====
interface UiState {
  showMemberList: boolean;
  mobileNav: boolean;
  mode: 'guild' | 'dm' | 'discover';
  selectedDMChannelId: string | null;
  modal:
    | 'create_guild'
    | 'join_guild'
    | 'invite_link'
    | 'server_settings'
    | 'friends'
    | 'search'
    | 'create_channel'
    | 'edit_channel'
    | 'channel_perms'
    | 'channel_settings'
    | 'user_settings'
    | 'new_dm'
    | 'follow_channel'
    | null;
  editingChannelId: string | null;
  // Kanal oluştur penceresi açılırken ön-seçili tür (+ butonundan gelir)
  createChannelType: 'text' | 'voice' | null;
  profileCardUserId: string | null;
  profileCardAnchor: { top: number; left: number; right: number; bottom: number; width: number; height: number } | null;
  // Mesajsız ama açık DM (profil kartından "Mesaj" ile gelinen): sidebar'da "Yeni" rozetli pinned satır
  pendingDM: { channelId: string; partnerId: string } | null;
  // Yanıtlanan mesaj ID (input'un üstünde "Yanıtlanan: @x" gösterimi)
  replyTo: string | null;
  // Yoksayılan kullanıcı id'leri (mesajları gizlenir) — localStorage'da kalıcı
  ignoredUsers: string[];
}

function loadIgnored(): string[] {
  try {
    const raw = localStorage.getItem('concord_ignored');
    if (raw) return JSON.parse(raw);
  } catch {
    /* yoksay */
  }
  return [];
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    showMemberList: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
    mobileNav: false,
    mode: NAV.mode,
    selectedDMChannelId: NAV.dmChannelId,
    modal: null,
    editingChannelId: null,
    createChannelType: null,
    profileCardUserId: null,
    profileCardAnchor: null,
    pendingDM: null,
    replyTo: null,
    ignoredUsers: loadIgnored(),
  } as UiState,
  reducers: {
    toggleMemberList(state) {
      state.showMemberList = !state.showMemberList;
    },
    setMobileNav(state, action: PayloadAction<boolean>) {
      state.mobileNav = action.payload;
    },
    openModal(state, action: PayloadAction<UiState['modal']>) {
      state.modal = action.payload;
      state.createChannelType = null;
    },
    closeModal(state) {
      state.modal = null;
      state.createChannelType = null;
    },
    setMode(state, action: PayloadAction<'guild' | 'dm' | 'discover'>) {
      state.mode = action.payload;
    },
    selectDM(state, action: PayloadAction<string>) {
      state.mode = 'dm';
      state.selectedDMChannelId = action.payload;
    },
    setPendingDM(
      state,
      action: PayloadAction<{ channelId: string; partnerId: string } | null>,
    ) {
      state.pendingDM = action.payload;
    },
    openEditChannel(state, action: PayloadAction<string>) {
      state.modal = 'edit_channel';
      state.editingChannelId = action.payload;
    },
    openChannelPerms(state, action: PayloadAction<string>) {
      state.modal = 'channel_perms';
      state.editingChannelId = action.payload;
    },
    openChannelSettings(state, action: PayloadAction<string>) {
      state.modal = 'channel_settings';
      state.editingChannelId = action.payload;
    },
    openCreateChannel(state, action: PayloadAction<'text' | 'voice' | null>) {
      state.modal = 'create_channel';
      state.createChannelType = action.payload;
    },
    toggleIgnore(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.ignoredUsers = state.ignoredUsers.includes(id)
        ? state.ignoredUsers.filter((x) => x !== id)
        : [...state.ignoredUsers, id];
      try {
        localStorage.setItem('concord_ignored', JSON.stringify(state.ignoredUsers));
      } catch {
        /* yoksay */
      }
    },
    setReplyTo(state, action: PayloadAction<string | null>) {
      state.replyTo = action.payload;
    },
    openProfileCard(
      state,
      action: PayloadAction<{ userId: string; anchorRect?: DOMRect | null } | null>,
    ) {
      if (!action.payload) {
        state.profileCardUserId = null;
        state.profileCardAnchor = null;
        return;
      }
      state.profileCardUserId = action.payload.userId;
      const r = action.payload.anchorRect;
      state.profileCardAnchor = r
        ? { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
        : null;
    },
  },
});

export const { logout } = authSlice.actions;
export const { selectGuild } = guildsSlice.actions;
export const { selectChannel, rememberGuildChannel, rememberDMChannel } = channelsSlice.actions;
export const { pushMessage, updateMessage, removeMessage, prependMessages } = messagesSlice.actions;

// Eski mesajları yükle (sonsuz kaydırma): en eski mesajdan öncesini getirip başa ekler
export const loadOlderMessages =
  (channelId: string, beforeId: string) =>
  async (dispatch: AppDispatch) => {
    const older = await api.channels.messages(channelId, beforeId, 50).catch(() => [] as APIMessage[]);
    if (older.length) dispatch(prependMessages({ channelId, list: older.slice().reverse() }));
    return older.length;
  };
export const { upsertUser } = usersSlice.actions;
export const { setGuildPresence } = presenceSlice.actions;
export const { setTyping, pruneTyping } = typingSlice.actions;
export const { toggleMemberList, setMobileNav, openModal, closeModal, setMode, selectDM, openProfileCard, setPendingDM, openEditChannel, openChannelPerms, openChannelSettings, openCreateChannel, toggleIgnore, setReplyTo } = uiSlice.actions;
export const { bumpRead } = readStatesSlice.actions;
export const { addToast, removeToast } = toastsSlice.actions;

// === Mode switching thunks ===
// DM moduna geçince çalışan kanalı temizle/son DM'i geri yükle.
// Guild moduna geçince ilgili guild'in son aktif kanalını geri yükle.
export const switchToDM = () => (dispatch: AppDispatch, getState: () => RootState) => {
  const s = getState();
  const prevGuildId = s.guilds.selectedId;
  const prevChannelId = s.channels.selectedId;
  if (s.ui.mode === 'guild' && prevGuildId && prevChannelId) {
    dispatch(rememberGuildChannel({ guildId: prevGuildId, channelId: prevChannelId }));
  }
  dispatch(setMode('dm'));
  // DM butonuna basınca son DM yerine Arkadaşlar ekranı açılsın (F5 davranışıyla aynı).
  dispatch(selectChannel(null));
};

// Keşfet (Sunucular) görünümüne geç.
export const switchToDiscover = () => (dispatch: AppDispatch) => {
  dispatch(setMode('discover'));
  dispatch(selectChannel(null));
};

export const switchToGuild = (guildId?: string) => (dispatch: AppDispatch, getState: () => RootState) => {
  const s = getState();
  if (s.ui.mode === 'dm' && s.channels.selectedId) {
    dispatch(rememberDMChannel(s.channels.selectedId));
  }
  dispatch(setMode('guild'));
  const gid = guildId ?? s.guilds.selectedId;
  if (!gid) {
    dispatch(selectChannel(null));
    return;
  }
  if (guildId) dispatch(selectGuild(guildId));
  const remembered = s.channels.lastByMode.guild[gid];
  if (remembered && s.channels.byGuild[gid]?.some((c) => c.id === remembered)) {
    dispatch(selectChannel(remembered));
    return;
  }
  const firstText = s.channels.byGuild[gid]?.find((c) => c.type !== 'voice');
  dispatch(selectChannel(firstText?.id ?? null));
};

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    guilds: guildsSlice.reducer,
    channels: channelsSlice.reducer,
    messages: messagesSlice.reducer,
    members: membersSlice.reducer,
    reactions: reactionsSlice.reducer,
    users: usersSlice.reducer,
    presence: presenceSlice.reducer,
    typing: typingSlice.reducer,
    readStates: readStatesSlice.reducer,
    toasts: toastsSlice.reducer,
    guildRoles: guildRolesSlice.reducer,
    ui: uiSlice.reducer,
  },
});

// Navigasyon durumunu localStorage'a yaz (F5 sonrası kaldığın yerden devam).
let lastNavJSON = '';
store.subscribe(() => {
  const s = store.getState();
  const snap: NavSnapshot = {
    mode: s.ui.mode,
    guildId: s.guilds.selectedId,
    channelId: s.channels.selectedId,
    dmChannelId: s.ui.selectedDMChannelId,
  };
  const json = JSON.stringify(snap);
  if (json !== lastNavJSON) {
    lastNavJSON = json;
    try {
      localStorage.setItem('concord_nav', json);
    } catch {
      /* yoksay */
    }
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
