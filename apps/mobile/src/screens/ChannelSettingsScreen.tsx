// Kanal ayarları — genel (konu/yavaş mod/NSFW), izinler, webhook, zamanlanmış mesaj.
import { t } from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors } from '../theme';
import { api, type Webhook, type ScheduledMessage } from '../api';
import { ScreenHeader, Section, Row, InputModal, Empty, ui } from '../ui';

type SubView = 'main' | 'perms' | 'webhooks' | 'scheduled';

export function ChannelSettingsScreen({
  channelId,
  channelName,
  onBack,
}: {
  channelId: string;
  channelName: string;
  guildId?: string;
  onBack: () => void;
}) {
  const [view, setView] = useState<SubView>('main');
  const [overrides, setOverrides] = useState<
    Array<{ target_type: string; target_id: string; allow: string; deny: string }>
  >([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);
  const [edit, setEdit] = useState<{ k: 'topic' | 'webhook' | 'sched' } | null>(null);

  const reload = useCallback(() => {
    if (view === 'perms')
      api.channels
        .listOverrides(channelId)
        .then(setOverrides)
        .catch(() => {});
    if (view === 'webhooks')
      api.channels
        .webhooks(channelId)
        .then(setWebhooks)
        .catch(() => {});
    if (view === 'scheduled')
      api.scheduledMessages
        .list(channelId)
        .then(setScheduled)
        .catch(() => {});
  }, [view, channelId]);
  useEffect(() => {
    reload();
  }, [reload]);

  async function run(fn: () => Promise<any>, ok?: string) {
    try {
      await fn();
      if (ok) Alert.alert('Concord', ok);
      reload();
    } catch (e: any) {
      Alert.alert('Concord', e?.message ?? t('common.actionFailed'));
    }
  }

  function slowMenu() {
    Alert.alert(t('channel.slowmode'), undefined, [
      {
        text: t('common.off'),
        onPress: () =>
          run(() => api.channels.update(channelId, { rate_limit_sec: 0 }), t('common.updated')),
      },
      {
        text: '5 saniye',
        onPress: () =>
          run(() => api.channels.update(channelId, { rate_limit_sec: 5 }), t('common.updated')),
      },
      {
        text: '30 saniye',
        onPress: () =>
          run(() => api.channels.update(channelId, { rate_limit_sec: 30 }), t('common.updated')),
      },
      {
        text: '1 dakika',
        onPress: () =>
          run(() => api.channels.update(channelId, { rate_limit_sec: 60 }), t('common.updated')),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }
  function nsfwMenu() {
    Alert.alert('NSFW (+18)', undefined, [
      {
        text: t('common.open'),
        onPress: () =>
          run(() => api.channels.update(channelId, { nsfw: true }), t('common.updated')),
      },
      {
        text: 'Kapat',
        onPress: () =>
          run(() => api.channels.update(channelId, { nsfw: false }), t('common.updated')),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function submitEdit(value: string) {
    const e = edit;
    setEdit(null);
    if (!e || !value.trim()) return;
    if (e.k === 'topic')
      return run(
        () => api.channels.update(channelId, { topic: value.trim() }),
        t('channel.topicUpdated'),
      );
    if (e.k === 'webhook')
      return run(async () => {
        const w = await api.channels.createWebhook(channelId, value.trim());
        Alert.alert(t('webhook.created'), w.token ? `Token:\n${w.token}` : t('common.created'));
      }, undefined);
    if (e.k === 'sched') {
      const at = new Date(Date.now() + 3600 * 1000).toISOString();
      return run(
        () => api.scheduledMessages.create(channelId, value.trim(), at),
        t('sched.inOneHour'),
      );
    }
  }
  const titles: Record<SubView, string> = {
    main: '',
    perms: t('perms.title'),
    webhooks: 'Webhooks',
    scheduled: t('sched.title'),
  };

  if (view !== 'main') {
    return (
      <View style={ui.screen}>
        <ScreenHeader
          title={titles[view]}
          onBack={() => setView('main')}
          right={
            view === 'webhooks' ? (
              <TouchableOpacity onPress={() => setEdit({ k: 'webhook' })}>
                <Text style={ui.headerBtn}>+ Webhook</Text>
              </TouchableOpacity>
            ) : view === 'scheduled' ? (
              <TouchableOpacity onPress={() => setEdit({ k: 'sched' })}>
                <Text style={ui.headerBtn}>+ Mesaj</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />
        {view === 'perms' && (
          <FlatList
            data={overrides}
            keyExtractor={(o) => o.target_type + o.target_id}
            ListEmptyComponent={<Empty text={t('perms.noOverrides')} />}
            renderItem={({ item }) => (
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText}>
                    {item.target_type === 'role' ? '🏷️' : '👤'} {item.target_id}
                  </Text>
                  <Text style={s.sub}>
                    izin: {item.allow || '0'} · ret: {item.deny || '0'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    run(() =>
                      api.channels.deleteOverride(
                        channelId,
                        item.target_type as 'role' | 'user',
                        item.target_id,
                      ),
                    )
                  }
                >
                  <Text style={{ color: colors.accent }}>Sil</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        {view === 'webhooks' && (
          <FlatList
            data={webhooks}
            keyExtractor={(w) => w.id}
            ListEmptyComponent={<Empty text="Webhook yok." />}
            renderItem={({ item }) => (
              <View style={s.row}>
                <Text style={s.rowText}>{item.name}</Text>
                <TouchableOpacity onPress={() => run(() => api.channels.deleteWebhook(item.id))}>
                  <Text style={{ color: colors.accent }}>Sil</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        {view === 'scheduled' && (
          <FlatList
            data={scheduled}
            keyExtractor={(m) => m.id}
            ListEmptyComponent={<Empty text={t('sched.none')} />}
            renderItem={({ item }) => (
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText}>{item.content}</Text>
                  <Text style={s.sub}>{new Date(item.scheduled_for).toLocaleString('tr-TR')}</Text>
                </View>
                <TouchableOpacity onPress={() => run(() => api.scheduledMessages.delete(item.id))}>
                  <Text style={{ color: colors.accent }}>Sil</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        <InputModal
          visible={!!edit}
          title={
            edit?.k === 'webhook'
              ? t('webhook.name')
              : edit?.k === 'sched'
                ? 'Mesaj (1 saat sonra)'
                : 'Konu'
          }
          multiline={edit?.k === 'sched'}
          onCancel={() => setEdit(null)}
          onSubmit={submitEdit}
        />
      </View>
    );
  }

  return (
    <View style={ui.screen}>
      <ScreenHeader title={`#${channelName}`} onBack={onBack} />
      <ScrollView>
        <Section title="Genel">
          <Row label="Konu" onPress={() => setEdit({ k: 'topic' })} />
          <Row label={t('channel.slowmode')} onPress={slowMenu} />
          <Row label="NSFW (+18)" onPress={nsfwMenu} />
        </Section>
        <Section title={t('common.management')}>
          <Row label={t('perms.title')} onPress={() => setView('perms')} />
          <Row label="Webhooks" onPress={() => setView('webhooks')} />
          <Row label={t('sched.messages')} onPress={() => setView('scheduled')} />
        </Section>
      </ScrollView>
      <InputModal
        visible={!!edit}
        title="Konu"
        multiline
        onCancel={() => setEdit(null)}
        onSubmit={submitEdit}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
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
});
