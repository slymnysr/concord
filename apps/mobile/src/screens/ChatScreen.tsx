// Sohbet ekranı — gerçek zamanlı mesajlar (Phoenix WS), tepkiler, yanıtlar,
// markdown, uzun-basma menüsü, eskiyi yükleme (sayfalama), yazıyor göstergesi,
// profil kartı, resim büyütme (lightbox), çevrimiçi durum noktaları.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Image, Modal, Pressable, Alert,
  ActivityIndicator, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme';
import { api, type Message, type Reaction, type User, type Member, type Friend } from '../api';
import { joinGuild, joinUser, sendTyping, onConnection } from '../gateway';
import { MarkdownText } from '../MarkdownText';
import { EmojiPicker } from '../EmojiPicker';
import { GifPicker } from '../GifPicker';
import { EmbedView } from '../EmbedView';
import { PollCard } from '../PollCard';
import { PollComposer } from '../PollComposer';
import { InputModal } from '../ui';
import { tap, impact } from '../haptics';
import type { Nav } from '../nav';

interface Props {
  channel: { id: string; name: string; guildId?: string; type?: string; participants?: string[] };
  me: User;
  nav: Nav;
  onBack: () => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '🎉'];

function statusColor(status?: string) {
  return status === 'online' ? colors.online
    : status === 'idle' ? colors.idle
    : status === 'dnd' ? colors.dnd
    : colors.inkTertiary;
}

export function ChatScreen({ channel, me, nav, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [text, setText] = useState('');
  const [users, setUsers] = useState<Record<string, User>>({ [me.id]: me });
  const [sending, setSending] = useState(false);
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editFor, setEditFor] = useState<Message | null>(null);
  const [profileFor, setProfileFor] = useState<User | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [pins, setPins] = useState<Message[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<'compose' | Message | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [mentionMembers, setMentionMembers] = useState<Member[]>([]);
  const [mentionChannels, setMentionChannels] = useState<{ id: string; name: string; type: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionKind, setMentionKind] = useState<'user' | 'channel' | null>(null);
  const [slashCmds, setSlashCmds] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<User | null>(null);
  const [threadFor, setThreadFor] = useState<Message | null>(null);
  const [recipOpen, setRecipOpen] = useState(false);
  const [removeRecipOpen, setRemoveRecipOpen] = useState(false);
  const [friendList, setFriendList] = useState<Friend[]>([]);
  const hasMoreRef = useRef(true);
  const atBottomRef = useRef(true);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const usersRef = useRef(users);
  usersRef.current = users;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const resolveUser = useCallback((id: string) => {
    if (usersRef.current[id]) return;
    setUsers((u) => ({ ...u, [id]: { id, username: '', display_name: '…', avatar_color: colors.surface3, status: 'offline' } }));
    api.user(id).then((u) => setUsers((prev) => ({ ...prev, [id]: u }))).catch(() => {});
  }, []);

  // İlk yükleme (en yeni 50; en eski üstte) + son 30 mesajın tepkileri
  useEffect(() => {
    let cancelled = false;
    hasMoreRef.current = true;
    atBottomRef.current = true;
    api.channels.messages(channel.id)
      .then(async (list) => {
        if (cancelled) return;
        if (list.length < 50) hasMoreRef.current = false;
        const ordered = list.slice().reverse();
        setMessages(ordered);
        for (const m of ordered) resolveUser(m.author_id);
        const tail = ordered.slice(-30);
        const results = await Promise.all(
          tail.map((m) => api.reactions.list(m.id).then((r) => [m.id, r] as const).catch(() => null)),
        );
        if (cancelled) return;
        const map: Record<string, Reaction[]> = {};
        for (const r of results) if (r && r[1].length > 0) map[r[0]] = r[1];
        setReactions((prev) => ({ ...map, ...prev }));
      })
      .catch(() => {});
    api.channels.ack(channel.id).catch(() => {});
    AsyncStorage.getItem(`sidcord_draft_${channel.id}`).then((d) => { if (d) setText(d); }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channel.id, resolveUser]);

  // Eski mesajları yükle (yukarı kaydırınca) — konum maintainVisibleContentPosition ile korunur
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const older = await api.channels.messages(channel.id, oldest.id);
      if (older.length < 50) hasMoreRef.current = false;
      if (older.length > 0) {
        const ordered = older.slice().reverse();
        for (const m of ordered) resolveUser(m.author_id);
        setMessages((prev) => [...ordered, ...prev]);
      }
    } catch {} finally {
      setLoadingOlder(false);
    }
  }, [channel.id, loadingOlder, resolveUser]);

  // Tepki sayacını yerel güncelle (canlı event + optimistic ortak yolu)
  const bumpReaction = useCallback((messageId: string, emoji: string, delta: 1 | -1, byMe: boolean) => {
    setReactions((prev) => {
      const list = prev[messageId] ? [...prev[messageId]] : [];
      const idx = list.findIndex((r) => r.emoji === emoji);
      if (idx >= 0) {
        const r = { ...list[idx] };
        r.count += delta;
        if (byMe) r.me = delta > 0;
        if (r.count <= 0) list.splice(idx, 1);
        else list[idx] = r;
      } else if (delta > 0) {
        list.push({ emoji, count: 1, me: byMe });
      }
      return { ...prev, [messageId]: list };
    });
  }, []);

  // "yazıyor…" göstergesi — TYPING_START olayında kullanıcıyı 5 sn listede tut
  const noteTyping = useCallback((userId: string) => {
    if (!userId || userId === me.id) return;
    resolveUser(userId);
    const name = usersRef.current[userId]?.display_name || '…';
    setTypingNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
    clearTimeout(typingTimers.current[userId]);
    typingTimers.current[userId] = setTimeout(() => {
      setTypingNames((prev) => prev.filter((n) => n !== name));
    }, 5000);
  }, [me.id, resolveUser]);

  // Gerçek zamanlı: guild kanalı; DM'de kişisel kanal (user:<id>)
  useEffect(() => {
    const onMsg = (ev: string, payload: any) => {
      if (ev === 'TYPING_START') {
        if (payload?.channel_id === channel.id) noteTyping(String(payload.user_id));
        return;
      }
      if (ev === 'PRESENCE_UPDATE') {
        const uid = String(payload?.user_id ?? '');
        const st = payload?.status;
        if (uid && st) setUsers((prev) => (prev[uid] ? { ...prev, [uid]: { ...prev[uid], status: st } } : prev));
        return;
      }
      if (ev === 'REACTION_ADD' || ev === 'REACTION_REMOVE') {
        if (payload?.channel_id !== channel.id) return;
        if (String(payload.user_id) === me.id) return; // kendi tepkim optimistic
        bumpReaction(String(payload.message_id), payload.emoji, ev === 'REACTION_ADD' ? 1 : -1, false);
        return;
      }
      const msg: Message | undefined = payload?.message;
      if (!msg || msg.channel_id !== channel.id) return;
      if (ev === 'MESSAGE_CREATE') {
        setTypingNames([]);
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        resolveUser(msg.author_id);
      } else if (ev === 'MESSAGE_UPDATE') {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      } else if (ev === 'MESSAGE_DELETE') {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      }
    };
    const off = channel.guildId ? joinGuild(channel.guildId, onMsg) : joinUser(me.id, onMsg);
    return off;
  }, [channel.id, channel.guildId, me.id, resolveUser, bumpReaction, noteTyping]);

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    AsyncStorage.removeItem(`sidcord_draft_${channel.id}`).catch(() => {});
    const reply = replyTo;
    setReplyTo(null);
    try {
      const m = await api.channels.sendMessage(channel.id, content, reply?.id);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch {
      setText(content);
      setReplyTo(reply);
    } finally {
      setSending(false);
    }
  }

  async function sendWithAttachment(uri: string, filename: string, contentType: string, size: number) {
    setSending(true);
    try {
      const pre = await api.uploads.presign({ filename, content_type: contentType, size_bytes: size });
      const blob = await (await fetch(uri)).blob();
      const put = await fetch(pre.upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
      if (!put.ok) throw new Error('Dosya yüklenemedi');
      const content = text.trim();
      setText('');
      const reply = replyTo;
      setReplyTo(null);
      const m = await api.channels.sendMessage(channel.id, content, reply?.id, [
        { url: pre.public_url, filename, content_type: contentType, size_bytes: size },
      ]);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (e: any) {
      Alert.alert('Sidcord', e?.message ?? 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  }

  async function attachImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    await sendWithAttachment(a.uri, a.fileName || `gorsel_${Date.now()}.jpg`, a.mimeType || 'image/jpeg', a.fileSize || 0);
  }
  async function attachDocument() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    await sendWithAttachment(a.uri, a.name, a.mimeType || 'application/octet-stream', a.size || 0);
  }
  function attachMenu() {
    Alert.alert('Ekle', undefined, [
      { text: 'Fotoğraf / Video', onPress: attachImage },
      { text: 'Dosya', onPress: attachDocument },
      { text: 'GIF', onPress: () => setGifOpen(true) },
      { text: 'Anket oluştur', onPress: () => setPollOpen(true) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  async function createPoll(question: string, answers: string[]) {
    setPollOpen(false);
    try {
      const m = await api.polls.create(channel.id, { question, answers: answers.map((text) => ({ text })) });
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Anket oluşturulamadı'); }
  }

  async function profileDM(u: User) {
    setProfileFor(null);
    try { const r = await api.dms.open(u.id); nav.push({ kind: 'chat', channel: { id: r.channel_id, name: u.display_name } }); }
    catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'DM açılamadı'); }
  }
  function profileMore(u: User) {
    Alert.alert(u.display_name, `@${u.username}`, [
      { text: 'Arkadaş ekle', onPress: () => api.friends.send({ user_id: u.id }).then(() => Alert.alert('Sidcord', 'İstek gönderildi')).catch((e) => Alert.alert('Sidcord', e?.message ?? 'Olmadı')) },
      { text: 'Not ekle', onPress: () => setNoteFor(u) },
      { text: 'Engelle', style: 'destructive', onPress: () => api.block(u.id).then(() => { setProfileFor(null); Alert.alert('Sidcord', 'Engellendi'); }).catch(() => {}) },
      { text: 'Şikayet et', style: 'destructive', onPress: () => api.report(u.id).then(() => Alert.alert('Sidcord', 'Şikayet alındı')).catch(() => {}) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }
  async function showReactors(m: Message, emoji: string) {
    try { const us = await api.reactions.users(m.id, emoji); Alert.alert(`${emoji} tepkisi`, us.length ? us.map((u) => u.display_name).join('\n') : 'Kimse yok'); } catch {}
  }

  // Bahsetme için üye + kanal listesi yükle (guild kanalları)
  useEffect(() => {
    if (channel.guildId) {
      api.guilds.members(channel.guildId).then(setMentionMembers).catch(() => {});
      api.guilds.channels(channel.guildId)
        .then((cs) => setMentionChannels(cs.filter((c) => ['text', 'announcement', 'forum', 'voice'].includes(c.type))))
        .catch(() => {});
      api.commands.list(channel.guildId).then(setSlashCmds).catch(() => {});
    }
  }, [channel.guildId]);

  const slashMatches = text.startsWith('/')
    ? slashCmds.filter((c) => c.name.toLowerCase().startsWith(text.slice(1).split(' ')[0].toLowerCase())).slice(0, 6)
    : [];
  async function runSlash(cmd: { name: string }) {
    setText('');
    try {
      const m = await api.commands.run(channel.id, cmd.name);
      if (m && m.id) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Komut çalıştırılamadı'); }
  }

  const mentionUserMatches = mentionQuery !== null && mentionKind === 'user'
    ? mentionMembers.filter((mb) => (mb.nickname || mb.display_name || mb.username).toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];
  const mentionChannelMatches = mentionQuery !== null && mentionKind === 'channel'
    ? mentionChannels.filter((c) => c.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  function insertMention(mb: Member) {
    const name = mb.nickname || mb.display_name;
    setText((p) => p.replace(/@(\w{0,20})$/, `@${name} `));
    setMentionQuery(null); setMentionKind(null);
  }
  function insertChannelMention(name: string) {
    setText((p) => p.replace(/#(\w{0,20})$/, `#${name} `));
    setMentionQuery(null); setMentionKind(null);
  }
  async function sendGif(url: string) {
    setGifOpen(false);
    try {
      const m = await api.channels.sendMessage(channel.id, '', undefined, [{ url, filename: 'gif.gif', content_type: 'image/gif', size_bytes: 0 }]);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'GIF gönderilemedi'); }
  }

  function onEmojiPick(e: string) {
    const t = emojiTarget;
    setEmojiTarget(null);
    if (t === 'compose') setText((p) => p + e);
    else if (t) toggleReaction(t, e);
  }

  async function toggleReaction(msg: Message, emoji: string) {
    tap();
    const cur = reactions[msg.id]?.find((r) => r.emoji === emoji);
    const adding = !cur?.me;
    bumpReaction(msg.id, emoji, adding ? 1 : -1, true);
    try {
      if (adding) await api.reactions.add(msg.id, emoji);
      else await api.reactions.remove(msg.id, emoji);
    } catch {
      bumpReaction(msg.id, emoji, adding ? -1 : 1, true); // geri al
    }
  }

  function deleteMessage(msg: Message) {
    Alert.alert('Mesajı sil', 'Bu mesaj kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.messages.delete(msg.id);
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
          } catch {}
        },
      },
    ]);
  }

  async function submitEdit(value: string) {
    const m = editFor;
    setEditFor(null);
    if (!m || !value.trim()) return;
    try {
      const updated = await api.messages.edit(m.id, value.trim());
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...updated } : x)));
    } catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Düzenlenemedi'); }
  }

  async function togglePin(m: Message) {
    try {
      if (m.pinned) await api.messages.unpin(m.id); else await api.messages.pin(m.id);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned: !m.pinned } : x)));
    } catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Olmadı'); }
  }

  function remindMenu(m: Message) {
    const at = (sec: number) => new Date(Date.now() + sec * 1000).toISOString();
    Alert.alert('Hatırlat', 'Bu mesajı ne zaman hatırlatayım?', [
      { text: '20 dakika', onPress: () => api.reminders.create(m.id, at(1200)).catch(() => {}) },
      { text: '1 saat', onPress: () => api.reminders.create(m.id, at(3600)).catch(() => {}) },
      { text: 'Yarın', onPress: () => api.reminders.create(m.id, at(86400)).catch(() => {}) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  async function openPins() {
    try { setPins(await api.channels.pins(channel.id)); setPinsOpen(true); } catch {}
  }

  function headerMenu() {
    const opts: any[] = [
      { text: 'Ara', onPress: () => nav.push({ kind: 'search', guildId: channel.guildId, channelId: channel.id }) },
      { text: 'Sabitlenenler', onPress: openPins },
    ];
    if (channel.guildId) {
      opts.push({ text: "Thread'ler", onPress: () => nav.push({ kind: 'forum', channel }) });
      opts.push({ text: 'Üyeler', onPress: () => nav.push({ kind: 'members', guildId: channel.guildId!, guildName: channel.name }) });
      opts.push({ text: 'Kanal ayarları', onPress: () => nav.push({ kind: 'channelSettings', channelId: channel.id, channelName: channel.name, guildId: channel.guildId }) });
      opts.push({ text: 'Sunucu ayarları', onPress: () => nav.push({ kind: 'serverSettings', guildId: channel.guildId!, guildName: channel.name }) });
      opts.push({ text: 'Kanalı sustur', onPress: () => api.channels.muteSettings(channel.id, { notif_level: 'nothing' }).then(() => Alert.alert('Sidcord', 'Susturuldu')).catch(() => {}) });
    }
    if (!channel.guildId && channel.type === 'group_dm') {
      opts.push({ text: 'Kişi ekle', onPress: () => { api.friends.list().then((f) => setFriendList(f.filter((x) => x.friendship === 'accepted'))).catch(() => {}); setRecipOpen(true); } });
      opts.push({ text: 'Kişi çıkar', onPress: () => { (channel.participants ?? []).forEach(resolveUser); setRemoveRecipOpen(true); } });
    }
    opts.push({ text: 'Vazgeç', style: 'cancel' });
    Alert.alert(channel.name, undefined, opts);
  }

  const listRef = useRef<FlatList>(null);
  const findMessage = (id?: string) => (id ? messagesRef.current.find((m) => m.id === id) : undefined);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const bottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 60;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (contentOffset.y < 80) loadOlder();
  };

  function jumpToMessage(id?: string) {
    if (!id) return;
    const idx = messagesRef.current.findIndex((m) => m.id === id);
    if (idx < 0) return;
    try { listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5, animated: true }); } catch {}
    setHighlightId(id);
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1400);
  }

  // Yeniden bağlanınca mevcut kanalı tazele (kaçan mesajları yakala)
  useEffect(() => onConnection((st) => {
    if (st === 'connected' && messagesRef.current.length) {
      api.channels.messages(channel.id).then((list) => setMessages(list.slice().reverse())).catch(() => {});
    }
  }), [channel.id]);

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.back}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerIcon}>{channel.guildId ? '#' : '@'}</Text>
        <Text style={s.headerName} numberOfLines={1}>{channel.name}</Text>
        <TouchableOpacity onPress={headerMenu} style={s.back} hitSlop={10}>
          <Text style={s.menuDots}>⋯</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        onContentSizeChange={() => {
          if (atBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
        }}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => { try { listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }); } catch {} }, 300);
        }}
        ListHeaderComponent={
          loadingOlder ? <ActivityIndicator color={colors.brand} style={{ marginVertical: 12 }} /> : null
        }
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item, index }) => {
          const prevAny = messages[index - 1];
          const newDay =
            !prevAny ||
            new Date(prevAny.created_at).toDateString() !== new Date(item.created_at).toDateString();
          const dayDivider = newDay ? (
            <View style={s.dayRow}>
              <View style={s.dayLine} />
              <Text style={s.dayText}>
                {new Date(item.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
              <View style={s.dayLine} />
            </View>
          ) : null;
          if (item.system) {
            return (
              <View>
                {dayDivider}
                <Text style={s.system}>→ {item.content}</Text>
              </View>
            );
          }
          const prev = messages[index - 1];
          const grouped =
            !!prev && !prev.system && prev.author_id === item.author_id && !item.replied_to_id &&
            new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
          const author = users[item.author_id];
          const name = item.webhook_username || author?.display_name || '…';
          const replied = findMessage(item.replied_to_id);
          const msgReactions = reactions[item.id] ?? [];
          return (
            <Pressable onLongPress={() => { impact(); setMenuFor(item); }} delayLongPress={250}>
              {dayDivider}
              {item.replied_to_id && (
                <Pressable style={s.replyPreviewRow} onPress={() => jumpToMessage(item.replied_to_id)}>
                  <Text style={s.replyPreviewText} numberOfLines={1}>
                    ↪ {replied ? `${users[replied.author_id]?.display_name ?? '…'}: ${replied.content}` : 'bir mesaja yanıt'}
                  </Text>
                </Pressable>
              )}
              <View style={[s.msgRow, grouped && s.msgRowGrouped, highlightId === item.id && s.msgHighlight]}>
                {grouped ? (
                  <View style={s.avatarSpacer} />
                ) : (
                  <Pressable onPress={() => author && setProfileFor(author)}>
                    <View style={[s.avatar, { backgroundColor: author?.avatar_color || colors.surface3 }]}>
                      {author?.avatar_url ? (
                        <Image source={{ uri: author.avatar_url }} style={s.avatarImg} />
                      ) : (
                        <Text style={s.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
                      )}
                    </View>
                    {!item.webhook_username && (
                      <View style={[s.statusDot, { backgroundColor: statusColor(author?.status) }]} />
                    )}
                  </Pressable>
                )}
                <View style={s.msgBody}>
                  {!grouped && (
                    <View style={s.msgHead}>
                      <Text style={s.msgAuthor} onPress={() => author && setProfileFor(author)}>{name}</Text>
                      <Text style={s.msgTime}>
                        {new Date(item.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  )}
                  {!!item.content && <MarkdownText style={s.msgText}>{item.content}</MarkdownText>}
                  {!!item.poll_id && <PollCard messageId={item.id} meId={me.id} />}
                  {!item.poll_id && /https?:\/\//.test(item.content) && <EmbedView messageId={item.id} />}
                  {item.attachments?.map((a: NonNullable<Message['attachments']>[number]) =>
                    (a.content_type ?? '').startsWith('image/') ? (
                      <Pressable key={a.id} onPress={() => setLightbox(a.url)}>
                        <Image source={{ uri: a.url }} style={s.attachment} resizeMode="cover" />
                      </Pressable>
                    ) : (
                      <Text key={a.id} style={s.file}>📎 {a.filename}</Text>
                    ),
                  )}
                  {msgReactions.length > 0 && (
                    <View style={s.reactionRow}>
                      {msgReactions.map((r) => (
                        <TouchableOpacity
                          key={r.emoji}
                          style={[s.reactionChip, r.me && s.reactionChipMine]}
                          onPress={() => toggleReaction(item, r.emoji)}
                          onLongPress={() => showReactors(item, r.emoji)}
                        >
                          <Text style={s.reactionEmoji}>{r.emoji}</Text>
                          <Text style={[s.reactionCount, r.me && { color: colors.brand }]}>{r.count}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      {!atBottom && (
        <TouchableOpacity style={s.jumpFab} onPress={() => listRef.current?.scrollToEnd({ animated: true })}>
          <Text style={s.jumpFabText}>↓ En alta in</Text>
        </TouchableOpacity>
      )}

      {typingNames.length > 0 && (
        <Text style={s.typing} numberOfLines={1}>
          {typingNames.join(', ')} yazıyor…
        </Text>
      )}

      {replyTo && (
        <View style={s.replyBar}>
          <Text style={s.replyBarText} numberOfLines={1}>
            ↪ {users[replyTo.author_id]?.display_name ?? '…'} kullanıcısına yanıt
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Text style={s.replyBarClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {text.startsWith('/') && slashMatches.length > 0 && (
        <View style={s.mentionBar}>
          {slashMatches.map((c) => (
            <TouchableOpacity key={c.id} style={s.slashItem} onPress={() => runSlash(c)}>
              <Text style={s.slashName}>/{c.name}</Text>
              {!!c.description && <Text style={s.slashDesc} numberOfLines={1}>{c.description}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {(mentionUserMatches.length > 0 || mentionChannelMatches.length > 0) && (
        <View style={s.mentionBar}>
          {mentionUserMatches.map((mb) => (
            <TouchableOpacity key={mb.user_id} style={s.mentionItem} onPress={() => insertMention(mb)}>
              <View style={[s.mentionDot, { backgroundColor: mb.avatar_color || colors.surface3 }]} />
              <Text style={s.mentionName} numberOfLines={1}>{mb.nickname || mb.display_name}</Text>
            </TouchableOpacity>
          ))}
          {mentionChannelMatches.map((c) => (
            <TouchableOpacity key={c.id} style={s.mentionItem} onPress={() => insertChannelMention(c.name)}>
              <Text style={s.mentionName} numberOfLines={1}>#{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={s.inputRow}>
        <TouchableOpacity style={s.attachBtn} onPress={attachMenu} disabled={sending}>
          <Text style={s.attachIcon}>＋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.attachBtn} onPress={() => setEmojiTarget('compose')}>
          <Text style={s.attachIcon}>😀</Text>
        </TouchableOpacity>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={(t) => {
            setText(t);
            AsyncStorage.setItem(`sidcord_draft_${channel.id}`, t).catch(() => {});
            if (channel.guildId) {
              sendTyping(channel.guildId, channel.id);
              const mm = /(?:^|\s)([@#])(\w{0,20})$/.exec(t);
              setMentionKind(mm ? (mm[1] === '#' ? 'channel' : 'user') : null);
              setMentionQuery(mm ? mm[2] : null);
            }
          }}
          placeholder={`${channel.guildId ? '#' : '@'}${channel.name} kanalına mesaj`}
          placeholderTextColor={colors.inkTertiary}
          multiline
        />
        <TouchableOpacity style={[s.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]} onPress={send} disabled={!text.trim() || sending}>
          <Text style={s.sendText}>➤</Text>
        </TouchableOpacity>
      </View>

      {/* Uzun-basma menüsü */}
      <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setMenuFor(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.quickRow}>
              {QUICK_EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={s.quickEmoji}
                  onPress={() => {
                    if (menuFor) toggleReaction(menuFor, e);
                    setMenuFor(null);
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.quickEmoji} onPress={() => { const mm = menuFor; setMenuFor(null); setEmojiTarget(mm); }}>
                <Text style={{ fontSize: 22 }}>➕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={s.sheetItem}
              onPress={() => {
                setReplyTo(menuFor);
                setMenuFor(null);
              }}
            >
              <Text style={s.sheetItemText}>↩️  Yanıtla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.sheetItem}
              onPress={async () => {
                if (menuFor?.content) await Clipboard.setStringAsync(menuFor.content);
                setMenuFor(null);
              }}
            >
              <Text style={s.sheetItemText}>📋  Metni Kopyala</Text>
            </TouchableOpacity>
            {!!channel.guildId && (
              <TouchableOpacity style={s.sheetItem} onPress={() => { const m = menuFor; setMenuFor(null); setThreadFor(m); }}>
                <Text style={s.sheetItemText}>🧵  Thread başlat</Text>
              </TouchableOpacity>
            )}
            {menuFor?.author_id === me.id && !menuFor?.system && (
              <TouchableOpacity style={s.sheetItem} onPress={() => { const m = menuFor; setMenuFor(null); setEditFor(m); }}>
                <Text style={s.sheetItemText}>✏️  Düzenle</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.sheetItem} onPress={() => { const m = menuFor; setMenuFor(null); if (m) togglePin(m); }}>
              <Text style={s.sheetItemText}>📌  {menuFor?.pinned ? 'Sabiti Kaldır' : 'Sabitle'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetItem} onPress={() => { const m = menuFor; setMenuFor(null); if (m) api.savedMessages.save(m.id).then(() => Alert.alert('Sidcord', 'Kaydedildi')).catch(() => {}); }}>
              <Text style={s.sheetItemText}>🔖  Kaydet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetItem} onPress={() => { const m = menuFor; setMenuFor(null); if (m) remindMenu(m); }}>
              <Text style={s.sheetItemText}>⏰  Hatırlat</Text>
            </TouchableOpacity>
            {!!menuFor?.edited_at && (
              <TouchableOpacity style={s.sheetItem} onPress={async () => { const m = menuFor; setMenuFor(null); if (m) { try { const h = await api.messages.edits(m.id); Alert.alert('Düzenleme geçmişi', h.length ? h.map((x) => '• ' + x.old_content).join('\n\n') : 'Geçmiş yok'); } catch {} } }}>
                <Text style={s.sheetItemText}>🕘  Düzenleme geçmişi</Text>
              </TouchableOpacity>
            )}
            {channel.type === 'announcement' && (
              <TouchableOpacity style={s.sheetItem} onPress={() => { const m = menuFor; setMenuFor(null); if (m) api.messages.crosspost(channel.id, m.id).then(() => Alert.alert('Sidcord', 'Yayınlandı')).catch((e) => Alert.alert('Sidcord', e?.message ?? 'Olmadı')); }}>
                <Text style={s.sheetItemText}>📣  Yayınla</Text>
              </TouchableOpacity>
            )}
            {menuFor?.author_id === me.id && (
              <TouchableOpacity
                style={s.sheetItem}
                onPress={() => {
                  const m = menuFor;
                  setMenuFor(null);
                  if (m) deleteMessage(m);
                }}
              >
                <Text style={[s.sheetItemText, { color: colors.accent }]}>🗑️  Mesajı Sil</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Profil kartı */}
      <Modal visible={!!profileFor} transparent animationType="fade" onRequestClose={() => setProfileFor(null)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setProfileFor(null)}>
          <Pressable style={s.profileCard} onPress={() => {}}>
            {profileFor?.banner_url ? (
              <Image source={{ uri: profileFor.banner_url }} style={s.profileBanner} resizeMode="cover" />
            ) : (
              <View style={[s.profileBanner, { backgroundColor: profileFor?.avatar_color || colors.surface3 }]} />
            )}
            <View style={[s.profileAvatar, { backgroundColor: profileFor?.avatar_color || colors.surface3 }]}>
              {profileFor?.avatar_url ? (
                <Image source={{ uri: profileFor.avatar_url }} style={s.avatarImg} />
              ) : (
                <Text style={s.profileAvatarText}>{(profileFor?.display_name || '?').slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <ScrollView style={s.profileBody}>
              <View style={s.profileNameRow}>
                <Text style={s.profileName}>{profileFor?.display_name}</Text>
                <View style={[s.statusDotInline, { backgroundColor: statusColor(profileFor?.status) }]} />
              </View>
              {!!profileFor?.username && <Text style={s.profileHandle}>@{profileFor.username}</Text>}
              {!!profileFor?.bio && <Text style={s.profileBio}>{profileFor.bio}</Text>}
            </ScrollView>
            {profileFor && profileFor.id !== me.id && (
              <View style={s.profileActions}>
                <TouchableOpacity style={s.profileBtn} onPress={() => profileDM(profileFor)}>
                  <Text style={s.profileBtnText}>Mesaj Gönder</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.profileMore} onPress={() => profileMore(profileFor)}>
                  <Text style={s.profileMoreText}>⋯</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={s.profileClose} onPress={() => setProfileFor(null)}>
              <Text style={s.profileCloseText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Resim büyütme (lightbox) */}
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable style={s.lightboxBackdrop} onPress={() => setLightbox(null)}>
          {!!lightbox && <Image source={{ uri: lightbox }} style={s.lightboxImg} resizeMode="contain" />}
        </Pressable>
      </Modal>

      {/* Mesaj düzenleme */}
      <InputModal
        visible={!!editFor}
        title="Mesajı düzenle"
        initial={editFor?.content}
        multiline
        submitLabel="Kaydet"
        onCancel={() => setEditFor(null)}
        onSubmit={submitEdit}
      />

      {/* Sabitlenen mesajlar */}
      <Modal visible={pinsOpen} transparent animationType="slide" onRequestClose={() => setPinsOpen(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setPinsOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.pinsTitle}>📌 Sabitlenen Mesajlar</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {pins.length === 0 ? (
                <Text style={s.pinsEmpty}>Sabitlenmiş mesaj yok.</Text>
              ) : pins.map((p) => (
                <View key={p.id} style={s.pinRow}>
                  <Text style={s.pinAuthor}>{users[p.author_id]?.display_name ?? p.webhook_username ?? '…'}</Text>
                  <Text style={s.pinContent}>{p.content}</Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <EmojiPicker visible={!!emojiTarget} onPick={onEmojiPick} onClose={() => setEmojiTarget(null)} />
      <GifPicker visible={gifOpen} onPick={sendGif} onClose={() => setGifOpen(false)} />

      {/* Grup DM'e kişi ekle */}
      <Modal visible={recipOpen} transparent animationType="slide" onRequestClose={() => setRecipOpen(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setRecipOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.pinsTitle}>Kişi ekle</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {friendList.length === 0 ? (
                <Text style={s.pinsEmpty}>Eklenecek arkadaş yok.</Text>
              ) : friendList.map((f) => (
                <TouchableOpacity key={f.user_id} style={s.sheetItem} onPress={() => api.dms.addRecipient(channel.id, f.user_id).then(() => { setRecipOpen(false); Alert.alert('Sidcord', 'Eklendi'); }).catch((e) => Alert.alert('Sidcord', e?.message ?? 'Olmadı'))}>
                  <Text style={s.sheetItemText}>{f.display_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Grup DM'den kişi çıkar */}
      <Modal visible={removeRecipOpen} transparent animationType="slide" onRequestClose={() => setRemoveRecipOpen(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setRemoveRecipOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.pinsTitle}>Kişi çıkar</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {(channel.participants ?? []).filter((id) => id !== me.id).length === 0 ? (
                <Text style={s.pinsEmpty}>Çıkarılacak kişi yok.</Text>
              ) : (channel.participants ?? []).filter((id) => id !== me.id).map((id) => (
                <TouchableOpacity key={id} style={s.sheetItem} onPress={() => api.dms.removeRecipient(channel.id, id).then(() => { setRemoveRecipOpen(false); Alert.alert('Sidcord', 'Çıkarıldı'); }).catch((e) => Alert.alert('Sidcord', e?.message ?? 'Olmadı'))}>
                  <Text style={s.sheetItemText}>{users[id]?.display_name ?? id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <PollComposer visible={pollOpen} onCancel={() => setPollOpen(false)} onCreate={createPoll} />
      <InputModal
        visible={!!noteFor}
        title={`Not — ${noteFor?.display_name ?? ''}`}
        placeholder="Bu kişi hakkında not (sadece sen görürsün)"
        onCancel={() => setNoteFor(null)}
        onSubmit={(v) => { const u = noteFor; setNoteFor(null); if (u) api.setNote(u.id, v).then(() => Alert.alert('Sidcord', 'Not kaydedildi')).catch(() => {}); }}
      />
      <InputModal
        visible={!!threadFor}
        title="Thread başlat"
        placeholder="Thread adı"
        submitLabel="Başlat"
        onCancel={() => setThreadFor(null)}
        onSubmit={async (v) => {
          const m = threadFor; setThreadFor(null);
          if (m && v.trim()) {
            try { const t = await api.threads.create(channel.id, { name: v.trim(), starter_message_id: m.id }); nav.push({ kind: 'chat', channel: { id: t.id, name: t.name, guildId: channel.guildId } }); }
            catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Thread oluşturulamadı'); }
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: colors.line, gap: 8 },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.ink, fontSize: 28, lineHeight: 30 },
  headerIcon: { color: colors.inkTertiary, fontSize: 18, fontWeight: '800' },
  headerName: { color: colors.ink, fontSize: 17, fontWeight: '800', flex: 1 },
  system: { color: colors.inkTertiary, fontSize: 13, paddingHorizontal: 16, paddingVertical: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginTop: 14, marginBottom: 2 },
  dayLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dayText: { color: colors.inkTertiary, fontSize: 11, fontWeight: '700' },
  msgRow: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 12, gap: 10 },
  msgRowGrouped: { marginTop: 2 },
  msgHighlight: { backgroundColor: colors.brand + '22', borderLeftWidth: 3, borderLeftColor: colors.brand },
  jumpFab: { position: 'absolute', right: 14, bottom: 70, backgroundColor: colors.surface3, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, zIndex: 5 },
  jumpFabText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarSpacer: { width: 38 },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  statusDot: {
    position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7,
    borderWidth: 3, borderColor: colors.bg,
  },
  msgBody: { flex: 1 },
  msgHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  msgAuthor: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  msgTime: { color: colors.inkTertiary, fontSize: 11 },
  msgText: { color: colors.ink, fontSize: 15, lineHeight: 21, marginTop: 1 },
  attachment: { width: 220, height: 150, borderRadius: 10, marginTop: 6, backgroundColor: colors.surface2 },
  file: { color: colors.brand, marginTop: 4 },
  replyPreviewRow: { paddingLeft: 60, paddingRight: 12, marginTop: 10 },
  replyPreviewText: { color: colors.inkTertiary, fontSize: 12 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface2,
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.line,
  },
  reactionChipMine: { borderColor: colors.brand, backgroundColor: colors.brand + '22' },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { color: colors.inkSecondary, fontSize: 12, fontWeight: '700' },
  typing: { color: colors.inkSecondary, fontSize: 12, fontStyle: 'italic', paddingHorizontal: 16, paddingBottom: 4 },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.surface1, borderTopWidth: 1, borderColor: colors.line, gap: 8,
  },
  replyBarText: { color: colors.inkSecondary, flex: 1, fontSize: 13 },
  replyBarClose: { color: colors.inkTertiary, fontSize: 16, padding: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8, borderTopWidth: 1, borderColor: colors.line },
  input: {
    flex: 1, backgroundColor: colors.surface2, borderRadius: 22, paddingHorizontal: 16,
    paddingTop: 10, paddingBottom: 10, color: colors.ink, fontSize: 15, maxHeight: 110,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#06281F', fontSize: 18, fontWeight: '800' },
  attachBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  attachIcon: { color: colors.inkSecondary, fontSize: 22, fontWeight: '700' },
  mentionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface1, borderTopWidth: 1, borderColor: colors.line },
  mentionItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface2, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  mentionDot: { width: 18, height: 18, borderRadius: 9 },
  mentionName: { color: colors.ink, fontSize: 13, fontWeight: '600', maxWidth: 120 },
  slashItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, width: '100%' },
  slashName: { color: colors.brand, fontWeight: '800', fontSize: 14 },
  slashDesc: { color: colors.inkSecondary, fontSize: 12, flex: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface1, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 28, gap: 4,
  },
  quickRow: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 8 },
  quickEmoji: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  sheetItem: { paddingVertical: 13, paddingHorizontal: 8 },
  sheetItemText: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  profileCard: { backgroundColor: colors.surface1, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20, maxHeight: '70%' },
  profileBanner: { height: 90, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  profileAvatar: {
    width: 76, height: 76, borderRadius: 38, marginTop: -38, marginLeft: 18,
    borderWidth: 5, borderColor: colors.surface1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  profileAvatarText: { color: '#fff', fontWeight: '800', fontSize: 30 },
  profileBody: { paddingHorizontal: 18, paddingTop: 8 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileName: { color: colors.ink, fontWeight: '800', fontSize: 20 },
  statusDotInline: { width: 12, height: 12, borderRadius: 6 },
  profileHandle: { color: colors.inkSecondary, fontSize: 14, marginTop: 2 },
  profileBio: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 12 },
  profileActions: { flexDirection: 'row', gap: 8, marginHorizontal: 18, marginTop: 14 },
  profileBtn: { flex: 1, backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 11 },
  profileBtnText: { color: '#06281F', textAlign: 'center', fontWeight: '800' },
  profileMore: { width: 48, backgroundColor: colors.surface2, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  profileMoreText: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  profileClose: { marginHorizontal: 18, marginTop: 10, backgroundColor: colors.surface2, borderRadius: 12, paddingVertical: 11 },
  profileCloseText: { color: colors.ink, textAlign: 'center', fontWeight: '700' },
  lightboxBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  lightboxImg: { width: '100%', height: '100%' },
  menuDots: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  pinsTitle: { color: colors.ink, fontWeight: '800', fontSize: 16, marginBottom: 12 },
  pinsEmpty: { color: colors.inkTertiary, paddingVertical: 16, textAlign: 'center' },
  pinRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  pinAuthor: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  pinContent: { color: colors.ink, fontSize: 14, marginTop: 2 },
});
