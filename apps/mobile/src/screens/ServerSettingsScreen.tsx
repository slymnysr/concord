// Sunucu ayarları — genel, roller, davetler, yasaklar, AutoMod, denetim kaydı.
import { t } from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme';
import {
  api,
  uploadFile,
  type Role,
  type Invite,
  type Ban,
  type AutomodRule,
  type Guild,
} from '../api';
import type { Nav } from '../nav';
import { ScreenHeader, Section, Row, InputModal, Empty, ui } from '../ui';

type SubView =
  | 'main'
  | 'roles'
  | 'invites'
  | 'bans'
  | 'automod'
  | 'audit'
  | 'reactionRoles'
  | 'follows'
  | 'bots';

export function ServerSettingsScreen({
  guildId,
  guildName,
  nav,
  onBack,
}: {
  guildId: string;
  guildName: string;
  nav: Nav;
  onBack: () => void;
}) {
  const [view, setView] = useState<SubView>('main');
  const [guild, setGuild] = useState<Guild | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [bans, setBans] = useState<Ban[]>([]);
  const [automod, setAutomod] = useState<AutomodRule[]>([]);
  const [audit, setAudit] = useState<
    Array<{ id: string; action: string; reason?: string; created_at: string }>
  >([]);
  const [reactionRoles, setReactionRoles] = useState<any[]>([]);
  const [follows, setFollows] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [edit, setEdit] = useState<{
    k: 'name' | 'description' | 'newRole' | 'roleName' | 'myNick' | 'myBio';
    role?: Role;
  } | null>(null);

  const reloadGuild = useCallback(
    () =>
      api.guilds
        .get(guildId)
        .then(setGuild)
        .catch(() => {}),
    [guildId],
  );
  useEffect(() => {
    reloadGuild();
  }, [reloadGuild]);
  useEffect(() => {
    if (view === 'roles')
      api.guilds
        .roles(guildId)
        .then(setRoles)
        .catch(() => {});
    if (view === 'invites')
      api.guilds
        .invites(guildId)
        .then(setInvites)
        .catch(() => {});
    if (view === 'bans')
      api.guilds
        .bans(guildId)
        .then(setBans)
        .catch(() => {});
    if (view === 'automod')
      api.guilds
        .automodRules(guildId)
        .then(setAutomod)
        .catch(() => {});
    if (view === 'audit')
      api.guilds
        .auditLog(guildId)
        .then(setAudit)
        .catch(() => {});
    if (view === 'reactionRoles') {
      api.reactionRoles
        .list(guildId)
        .then(setReactionRoles)
        .catch(() => {});
      api.guilds
        .roles(guildId)
        .then(setRoles)
        .catch(() => {});
    }
    if (view === 'follows')
      api.follows
        .listForGuild(guildId)
        .then(setFollows)
        .catch(() => {});
    if (view === 'bots')
      api.applications
        .list()
        .then(setApps)
        .catch(() => {});
  }, [view, guildId]);

  async function run(fn: () => Promise<any>, after?: () => void, ok?: string) {
    try {
      await fn();
      if (ok) Alert.alert('Concord', ok);
      after?.();
    } catch (e: any) {
      Alert.alert('Concord', e?.message ?? t('common.actionFailed'));
    }
  }

  async function pickIcon() {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    try {
      const up = await uploadFile(
        a.uri,
        a.fileName || 'icon.jpg',
        a.mimeType || 'image/jpeg',
        a.fileSize || 0,
      );
      await api.guilds.update(guildId, { icon_url: up.url });
      reloadGuild();
      Alert.alert('Concord', t('guild.iconUpdated'));
    } catch (e: any) {
      Alert.alert('Concord', e?.message ?? t('common.loadFailed'));
    }
  }

  function leave() {
    Alert.alert(t('guild.leave'), `"${guildName}" sunucusundan ayrılınsın mı?`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.leave'),
        style: 'destructive',
        onPress: () =>
          run(
            () => api.guilds.leave(guildId),
            () => nav.reset({ kind: 'home' }),
          ),
      },
    ]);
  }
  function destroy() {
    Alert.alert('Sunucuyu sil', `"${guildName}" kalıcı olarak silinecek. Emin misin?`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          run(
            () => api.guilds.deleteGuild(guildId),
            () => nav.reset({ kind: 'home' }),
          ),
      },
    ]);
  }

  async function submitEdit(value: string) {
    const e = edit;
    setEdit(null);
    if (!e) return;
    if (e.k === 'name' && value.trim())
      await run(() => api.guilds.update(guildId, { name: value.trim() }), reloadGuild);
    else if (e.k === 'description')
      await run(() => api.guilds.update(guildId, { description: value.trim() }), reloadGuild);
    else if (e.k === 'newRole' && value.trim())
      await run(
        () => api.guilds.createRole(guildId, { name: value.trim() }),
        () => api.guilds.roles(guildId).then(setRoles),
      );
    else if (e.k === 'roleName' && e.role && value.trim())
      await run(
        () => api.guilds.updateRole(guildId, e.role!.id, { name: value.trim() }),
        () => api.guilds.roles(guildId).then(setRoles),
      );
    else if (e.k === 'myNick')
      await run(
        () => api.guilds.setMyProfile(guildId, { nickname: value.trim() }),
        undefined,
        t('member.nickUpdated'),
      );
    else if (e.k === 'myBio')
      await run(
        () => api.guilds.setMyProfile(guildId, { guild_bio: value.trim() || null }),
        undefined,
        t('profile.updated'),
      );
  }

  const editMeta = {
    name: { title: t('guild.name'), initial: guild?.name },
    description: { title: t('common.description'), initial: guild?.description, multiline: true },
    newRole: { title: t('roles.newName') },
    roleName: { title: t('roles.name'), initial: edit?.role?.name },
    myNick: { title: t('member.yourNick') },
    myBio: { title: 'Bu sunucudaki bio', multiline: true },
  } as const;
  const m = edit ? editMeta[edit.k] : null;

  // --- Alt görünümler ---
  if (view !== 'main') {
    const titles: Record<SubView, string> = {
      main: '',
      roles: 'Roller',
      invites: 'Davetler',
      bans: 'Yasaklar',
      automod: 'AutoMod',
      audit: t('audit.title'),
      reactionRoles: 'Tepki Rolleri',
      follows: 'Kanal Takipleri',
      bots: 'Bot Ekle',
    };
    return (
      <View style={ui.screen}>
        <ScreenHeader
          title={titles[view]}
          onBack={() => setView('main')}
          right={
            view === 'roles' ? (
              <TouchableOpacity onPress={() => setEdit({ k: 'newRole' })}>
                <Text style={ui.headerBtn}>+ Rol</Text>
              </TouchableOpacity>
            ) : view === 'invites' ? (
              <TouchableOpacity
                onPress={() =>
                  run(
                    () => api.guilds.createInvite(guildId),
                    () => api.guilds.invites(guildId).then(setInvites),
                    t('invite.created'),
                  )
                }
              >
                <Text style={ui.headerBtn}>+ Davet</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />
        {view === 'roles' && (
          <FlatList
            data={roles.filter((r) => !r.is_everyone)}
            keyExtractor={(r) => r.id}
            ListEmptyComponent={<Empty text="Rol yok." />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.listRow}
                onPress={() =>
                  Alert.alert(item.name, undefined, [
                    {
                      text: t('common.changeName'),
                      onPress: () => setEdit({ k: 'roleName', role: item }),
                    },
                    {
                      text: 'Sil',
                      style: 'destructive',
                      onPress: () =>
                        run(
                          () => api.guilds.deleteRole(guildId, item.id),
                          () => api.guilds.roles(guildId).then(setRoles),
                        ),
                    },
                    { text: t('common.cancel'), style: 'cancel' },
                  ])
                }
              >
                <View
                  style={[
                    s.roleDot,
                    {
                      backgroundColor: item.color
                        ? `#${item.color.toString(16).padStart(6, '0')}`
                        : colors.inkTertiary,
                    },
                  ]}
                />
                <Text style={s.rowText}>{item.name}</Text>
                <Text style={ui.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}
        {view === 'invites' && (
          <FlatList
            data={invites}
            keyExtractor={(i) => i.code}
            ListEmptyComponent={<Empty text="Davet yok." />}
            renderItem={({ item }) => (
              <View style={s.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText}>{item.code}</Text>
                  <Text style={s.sub}>
                    {item.uses} kullanım{item.max_uses ? ` / ${item.max_uses}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    run(
                      () => api.invites.delete(item.code),
                      () => api.guilds.invites(guildId).then(setInvites),
                    )
                  }
                >
                  <Text style={{ color: colors.accent }}>Sil</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        {view === 'bans' && (
          <FlatList
            data={bans}
            keyExtractor={(b) => b.user_id}
            ListEmptyComponent={<Empty text={t('mod.noBans')} />}
            renderItem={({ item }) => (
              <View style={s.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText}>{item.display_name || item.user_id}</Text>
                  {!!item.reason && <Text style={s.sub}>{item.reason}</Text>}
                </View>
                <TouchableOpacity
                  onPress={() =>
                    run(
                      () => api.guilds.unban(guildId, item.user_id),
                      () => api.guilds.bans(guildId).then(setBans),
                    )
                  }
                >
                  <Text style={{ color: colors.brand }}>{t('common.remove')}</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        {view === 'automod' && (
          <FlatList
            data={automod}
            keyExtractor={(r) => r.id}
            ListEmptyComponent={<Empty text={t('automod.none')} />}
            renderItem={({ item }) => (
              <View style={s.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText}>{item.name}</Text>
                  <Text style={s.sub}>
                    {item.trigger_type} ·{' '}
                    {item.enabled ? t('common.onLower') : t('common.offLower')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    run(
                      () => api.guilds.updateAutomodRule(guildId, item.id, !item.enabled),
                      () => api.guilds.automodRules(guildId).then(setAutomod),
                    )
                  }
                >
                  <Text style={{ color: item.enabled ? colors.inkSecondary : colors.brand }}>
                    {item.enabled ? 'Kapat' : t('common.open')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        {view === 'audit' && (
          <FlatList
            data={audit}
            keyExtractor={(a) => a.id}
            ListEmptyComponent={<Empty text={t('common.noRecords')} />}
            renderItem={({ item }) => (
              <View style={s.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText}>{item.action}</Text>
                  <Text style={s.sub}>
                    {new Date(item.created_at).toLocaleString('tr-TR')}
                    {item.reason ? ` · ${item.reason}` : ''}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
        {view === 'reactionRoles' && (
          <FlatList
            data={reactionRoles}
            keyExtractor={(r) => r.id}
            ListEmptyComponent={<Empty text={t('reactionRole.none')} />}
            renderItem={({ item }) => (
              <View style={s.listRow}>
                <Text style={s.rowText}>
                  {item.emoji} → {roles.find((r) => r.id === item.role_id)?.name ?? item.role_id}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    run(
                      () => api.reactionRoles.delete(item.id),
                      () => api.reactionRoles.list(guildId).then(setReactionRoles),
                    )
                  }
                >
                  <Text style={{ color: colors.accent }}>Sil</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        {view === 'follows' && (
          <FlatList
            data={follows}
            keyExtractor={(f) => f.id}
            ListEmptyComponent={<Empty text="Takip edilen kanal yok." />}
            renderItem={({ item }) => (
              <View style={s.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText}>
                    {item.target_channel} → {item.source_channel}
                  </Text>
                  <Text style={s.sub}>{item.source_guild}</Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    run(
                      () => api.follows.remove(item.id),
                      () => api.follows.listForGuild(guildId).then(setFollows),
                    )
                  }
                >
                  <Text style={{ color: colors.accent }}>{t('common.remove')}</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        {view === 'bots' && (
          <FlatList
            data={apps}
            keyExtractor={(a) => a.id}
            ListEmptyComponent={<Empty text="Uygulaman yok." />}
            renderItem={({ item }) => (
              <View style={s.listRow}>
                <Text style={s.rowText}>
                  {item.name} {item.bot_username ? `(@${item.bot_username})` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    run(
                      () => api.applications.addToGuild(guildId, item.id),
                      undefined,
                      'Bot eklendi',
                    )
                  }
                >
                  <Text style={{ color: colors.brand }}>Ekle</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        <InputModal
          visible={!!edit}
          title={m && 'title' in m ? m.title : ''}
          initial={m && 'initial' in m ? (m as any).initial : undefined}
          multiline={m && 'multiline' in m ? (m as any).multiline : undefined}
          onCancel={() => setEdit(null)}
          onSubmit={submitEdit}
        />
      </View>
    );
  }

  // --- Ana ---
  return (
    <View style={ui.screen}>
      <ScreenHeader title={`Ayarlar — ${guildName}`} onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Section title="Genel">
          <Row label={t('guild.iconUpload')} onPress={pickIcon} />
          <Row
            label={t('guild.name')}
            value={guild?.name ?? guildName}
            onPress={() => setEdit({ k: 'name' })}
          />
          <Row
            label={t('common.description')}
            value={guild?.description || '—'}
            onPress={() => setEdit({ k: 'description' })}
          />
          <Row
            label={t('members.title')}
            onPress={() => nav.push({ kind: 'members', guildId, guildName })}
          />
          <Row label={t('member.myNick')} onPress={() => setEdit({ k: 'myNick' })} />
          <Row label="Sunucudaki profilim (bio)" onPress={() => setEdit({ k: 'myBio' })} />
          <Row
            label={t('content.title')}
            value={t('content.subtitle')}
            onPress={() => nav.push({ kind: 'serverContent', guildId, guildName })}
          />
        </Section>
        <Section title={t('common.management')}>
          <Row label="Roller" onPress={() => setView('roles')} />
          <Row label="Davetler" onPress={() => setView('invites')} />
          <Row label="Yasaklar" onPress={() => setView('bans')} />
          <Row label="AutoMod" onPress={() => setView('automod')} />
          <Row label="Tepki rolleri" onPress={() => setView('reactionRoles')} />
          <Row label="Kanal takipleri" onPress={() => setView('follows')} />
          <Row label="Bot ekle" onPress={() => setView('bots')} />
          <Row label={t('audit.title2')} onPress={() => setView('audit')} />
        </Section>
        <Section>
          <Row label={t('guild.leave')} danger onPress={leave} />
          <Row label="Sunucuyu sil" danger onPress={destroy} />
        </Section>
      </ScrollView>
      <InputModal
        visible={!!edit}
        title={m && 'title' in m ? m.title : ''}
        initial={m && 'initial' in m ? (m as any).initial : undefined}
        multiline={m && 'multiline' in m ? (m as any).multiline : undefined}
        onCancel={() => setEdit(null)}
        onSubmit={submitEdit}
      />
    </View>
  );
}

const s = StyleSheet.create({
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  rowText: { color: colors.ink, fontSize: 15, flex: 1 },
  sub: { color: colors.inkTertiary, fontSize: 12, marginTop: 2 },
  roleDot: { width: 14, height: 14, borderRadius: 7 },
});
