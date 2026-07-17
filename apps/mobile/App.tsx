// Concord Mobil — giriş kapısı + ekran-yığını navigasyon.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './src/theme';
import { api, loadTokens, clearTokens, type User } from './src/api';
import { loadHost } from './src/config';
import { disconnectGateway, joinUser } from './src/gateway';
import { ToastHost, showToast } from './src/Toast';
import { ConnectionBanner } from './src/ConnectionBanner';
import type { Nav, Screen } from './src/nav';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { ForumScreen } from './src/screens/ForumScreen';
import { UserSettingsScreen } from './src/screens/UserSettingsScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { MembersScreen } from './src/screens/MembersScreen';
import { ServerSettingsScreen } from './src/screens/ServerSettingsScreen';
import { ServerContentScreen } from './src/screens/ServerContentScreen';
import { ChannelSettingsScreen } from './src/screens/ChannelSettingsScreen';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SavedMessagesScreen } from './src/screens/SavedMessagesScreen';
import { DeveloperScreen } from './src/screens/DeveloperScreen';
import { QuickSwitcherScreen } from './src/screens/QuickSwitcherScreen';
import { VoiceBar } from './src/VoiceBar';
import { registerForPush, notifyLocal, loadNotifPref, notifOn } from './src/push';
import { loadLocale } from './src/i18n';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [stack, setStack] = useState<Screen[]>([{ kind: 'home' }]);

  const nav: Nav = useMemo(
    () => ({
      push: (sc) => setStack((s) => [...s, sc]),
      pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      reset: (sc) => setStack([sc]),
    }),
    [],
  );

  // Açılış: kayıtlı sunucu + token varsa otomatik giriş
  useEffect(() => {
    (async () => {
      await loadHost();
      await loadTokens();
      await loadNotifPref();
      // Dil: kullanıcı tercihi varsa cihaz dilini ezer. İLK ekran çizilmeden yüklenmeli,
      // yoksa uygulama bir an yanlış dilde açılıp sonra değişir.
      await loadLocale();
      try {
        const u = await api.me();
        setMe(u);
        registerForPush();
      } catch {}
      setBooting(false);
    })();
  }, []);

  // Android geri tuşu: yığında geri git
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        nav.pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, nav]);

  const logout = useCallback(async () => {
    disconnectGateway();
    await clearTokens();
    setStack([{ kind: 'home' }]);
    setMe(null);
  }, []);

  const onLogin = useCallback((u: User) => {
    setStack([{ kind: 'home' }]);
    setMe(u);
    registerForPush();
  }, []);

  const top = stack[stack.length - 1];
  const activeRef = useRef<string | null>(null);
  activeRef.current = top.kind === 'chat' ? top.channel.id : null;

  // Global bildirim: DM mesajları + bahsetmeler → toast + yerel bildirim (Firebase'siz)
  useEffect(() => {
    if (!me) return;
    const off = joinUser(me.id, (ev, payload) => {
      if (!notifOn()) return;
      if (ev === 'NOTIFICATION') {
        const title = payload?.title ?? 'Concord';
        showToast(title, { sub: payload?.body });
        notifyLocal(title, payload?.body);
      } else if (ev === 'MESSAGE_CREATE') {
        const msg = payload?.message;
        if (msg && msg.channel_id !== activeRef.current && String(msg.author_id) !== me.id) {
          showToast('Yeni mesaj', {
            sub: msg.content,
            onPress: () =>
              nav.push({ kind: 'chat', channel: { id: msg.channel_id, name: 'Mesaj' } }),
          });
          notifyLocal('Yeni mesaj', msg.content);
        }
      }
    });
    return off;
  }, [me, nav]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        {me ? <ConnectionBanner /> : null}
        <View style={s.body}>
          {booting ? (
            <View style={s.center}>
              <ActivityIndicator color={colors.brand} size="large" />
            </View>
          ) : !me ? (
            <LoginScreen onLogin={onLogin} />
          ) : top.kind === 'chat' ? (
            <ChatScreen channel={top.channel} me={me} nav={nav} onBack={nav.pop} />
          ) : top.kind === 'forum' ? (
            <ForumScreen channel={top.channel} nav={nav} onBack={nav.pop} />
          ) : top.kind === 'userSettings' ? (
            <UserSettingsScreen
              me={me}
              setMe={setMe}
              nav={nav}
              onLogout={logout}
              onBack={nav.pop}
            />
          ) : top.kind === 'developer' ? (
            <DeveloperScreen onBack={nav.pop} />
          ) : top.kind === 'friends' ? (
            <FriendsScreen me={me} nav={nav} onBack={nav.pop} />
          ) : top.kind === 'members' ? (
            <MembersScreen
              guildId={top.guildId}
              guildName={top.guildName}
              me={me}
              nav={nav}
              onBack={nav.pop}
            />
          ) : top.kind === 'serverSettings' ? (
            <ServerSettingsScreen
              guildId={top.guildId}
              guildName={top.guildName}
              nav={nav}
              onBack={nav.pop}
            />
          ) : top.kind === 'serverContent' ? (
            <ServerContentScreen guildId={top.guildId} guildName={top.guildName} onBack={nav.pop} />
          ) : top.kind === 'channelSettings' ? (
            <ChannelSettingsScreen
              channelId={top.channelId}
              channelName={top.channelName}
              guildId={top.guildId}
              onBack={nav.pop}
            />
          ) : top.kind === 'savedMessages' ? (
            <SavedMessagesScreen onBack={nav.pop} />
          ) : top.kind === 'quickSwitch' ? (
            <QuickSwitcherScreen nav={nav} onBack={nav.pop} />
          ) : top.kind === 'discover' ? (
            <DiscoverScreen nav={nav} onBack={nav.pop} />
          ) : top.kind === 'notifications' ? (
            <NotificationsScreen onBack={nav.pop} />
          ) : top.kind === 'search' ? (
            <SearchScreen
              guildId={top.guildId}
              channelId={top.channelId}
              nav={nav}
              onBack={nav.pop}
            />
          ) : (
            <HomeScreen me={me} nav={nav} onLogout={logout} />
          )}
        </View>
        {me ? <VoiceBar /> : null}
        <ToastHost />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
