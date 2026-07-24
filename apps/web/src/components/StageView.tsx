import { useEffect, useState, useMemo } from 'react';
import { Radio, Hand, Mic, PhoneCall } from 'lucide-react';
import { voice } from '../voice';
import { useAppSelector } from '../store';
import { PERM } from '../perms';
import { t } from '../i18n';

export function StageView() {
  const channelId = useAppSelector((s) => s.channels.selectedId);
  const me = useAppSelector((s) => s.auth.user);
  const usersById = useAppSelector((s) => s.users.byId);
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const channel = useAppSelector((s) =>
    guildId ? s.channels.byGuild[guildId]?.find((c) => c.id === channelId) : null,
  );
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === guildId));
  const members = useAppSelector((s) => (guildId ? (s.members.byGuild[guildId] ?? []) : []));
  const myRoleIds = useMemo(
    () => members.find((m) => m.user_id === me?.id)?.role_ids ?? [],
    [members, me?.id],
  );
  const roles = useAppSelector((s) => (guildId ? (s.guildRoles?.byGuild?.[guildId] ?? []) : []));

  const [connected, setConnected] = useState(voice.channelId === channelId);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    const onChange = () => force((n) => n + 1);
    const onConn = () => {
      setConnected(true);
      onChange();
    };
    const onDisc = () => setConnected(false);
    voice.on('stage:changed', onChange);
    voice.on('remotes:changed', onChange);
    voice.on('speaking:changed', onChange);
    voice.on('connected', onConn);
    voice.on('disconnected', onDisc);
    return () => {
      voice.off('stage:changed', onChange);
      voice.off('remotes:changed', onChange);
      voice.off('speaking:changed', onChange);
      voice.off('connected', onConn);
      voice.off('disconnected', onDisc);
    };
  }, []);

  const nameOf = (uid: string) => {
    if (uid === me?.id) return me?.display_name ?? t('common.you');
    return (
      usersById[uid]?.display_name ??
      members.find((m) => m.user_id === uid)?.display_name ??
      t('stage.connecting')
    );
  };
  const colorOf = (uid: string) =>
    usersById[uid]?.avatar_color ??
    members.find((m) => m.user_id === uid)?.avatar_color ??
    '#5865F2';

  // Yetki: owner / admin / MUTE_MEMBERS (sahne moderatörü)
  const myPerms = useMemo(() => {
    let p = 0n;
    for (const r of roles)
      if (r.is_everyone || myRoleIds.includes(r.id)) {
        try {
          p |= BigInt(r.permissions);
        } catch {
          /* yoksay */
        }
      }
    return p;
  }, [roles, myRoleIds]);
  const canModerate =
    guild?.owner_id === me?.id ||
    (myPerms & PERM.ADMINISTRATOR) !== 0n ||
    (myPerms & PERM.MUTE_MEMBERS) !== 0n;

  // Bağlı kullanıcılar = ben + ses peer'leri
  const connectedIds = new Set<string>();
  if (connected && me) connectedIds.add(me.id);
  for (const r of voice.remoteStreams()) if (r.kind === 'audio') connectedIds.add(r.userId);
  const all = Array.from(connectedIds);
  const speakers = all.filter((uid) => voice.isStageSpeaker(uid));
  const audience = all.filter((uid) => !voice.isStageSpeaker(uid));
  const hands = voice.getStageHands();
  const speakingSet = voice.speakingSet();

  const iAmSpeaker = me ? voice.isStageSpeaker(me.id) : false;
  const myHand = me ? hands.has(me.id) : false;

  // Dinleyiciysem mikrofonu kapalı tut
  useEffect(() => {
    if (connected && me && !iAmSpeaker) voice.setMicrophoneEnabled(false);
  }, [connected, iAmSpeaker, me]);

  async function join() {
    if (!channelId) return;
    setBusy(true);
    try {
      await voice.connect(channelId);
      setConnected(true);
    } catch {
      /* yoksay */
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-surface-1 to-brand-900/10 p-8 text-center">
        <Radio size={40} className="text-brand-500 mb-3" />
        <h2 className="text-xl font-bold text-ink-primary">{channel?.name ?? t('stage.title')}</h2>
        {channel?.topic && (
          <p className="text-sm text-ink-secondary mt-1 max-w-md">{channel.topic}</p>
        )}
        <button
          onClick={join}
          disabled={busy}
          className="mt-5 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white font-semibold flex items-center gap-2"
        >
          <PhoneCall size={16} /> {busy ? t('stage.connecting') : t('stage.join')}
        </button>
      </div>
    );
  }

  function Avatar({ uid, big }: { uid: string; big?: boolean }) {
    const sz = big ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-sm';
    const speaking = speakingSet.has(uid) && voice.isStageSpeaker(uid);
    return (
      <div
        className={
          'rounded-full flex items-center justify-center text-white font-bold shrink-0 ' +
          sz +
          (speaking ? ' ring-2 ring-status-online' : '')
        }
        style={{ backgroundColor: colorOf(uid) }}
      >
        {nameOf(uid).slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-surface-1 to-brand-900/10 overflow-y-auto">
      <div className="px-6 py-4 border-b border-line">
        <div className="flex items-center gap-2 text-brand-400 text-xs font-bold uppercase tracking-wider">
          <Radio size={14} /> Sahne · Canlı
        </div>
        <h2 className="text-lg font-bold text-ink-primary mt-0.5">{channel?.name}</h2>
        {channel?.topic && <p className="text-sm text-ink-secondary">{channel.topic}</p>}
      </div>

      {/* Konuşmacılar */}
      <div className="px-6 py-5">
        <div className="text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-3">
          Konuşmacılar — {speakers.length}
        </div>
        {speakers.length === 0 ? (
          <p className="text-sm text-ink-tertiary">{t('stage.noSpeakers')}</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {speakers.map((uid) => (
              <div key={uid} className="flex flex-col items-center gap-1.5 group/sp">
                <div className="relative">
                  <Avatar uid={uid} big />
                  <Mic
                    size={12}
                    className="absolute -bottom-0.5 -right-0.5 bg-surface-1 rounded-full p-0.5 text-status-online"
                  />
                </div>
                <span className="text-xs text-ink-secondary truncate max-w-[72px] text-center">
                  {nameOf(uid)}
                </span>
                {canModerate && uid !== me?.id && (
                  <button
                    onClick={() => voice.setStageSpeaker(uid, false)}
                    className="text-[10px] text-ink-tertiary hover:text-accent-500 opacity-0 group-hover/sp:opacity-100"
                  >
                    {t('stage.moveToAudience')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dinleyiciler */}
      <div className="px-6 pb-5">
        <div className="text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-3">
          Dinleyiciler — {audience.length}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
          {audience.map((uid) => (
            <div key={uid} className="flex flex-col items-center gap-1 group/au relative">
              <div className="relative">
                <Avatar uid={uid} />
                {hands.has(uid) && <span className="absolute -top-1 -right-1 text-xs">🖐</span>}
              </div>
              <span className="text-[11px] text-ink-tertiary truncate max-w-[60px] text-center">
                {nameOf(uid)}
              </span>
              {canModerate && (
                <button
                  onClick={() => voice.setStageSpeaker(uid, true)}
                  className={
                    'text-[10px] hover:text-brand-400 ' +
                    (hands.has(uid)
                      ? 'text-brand-500 font-semibold'
                      : 'text-ink-tertiary opacity-0 group-hover/au:opacity-100')
                  }
                >
                  Konuşmacı yap
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Alt aksiyon çubuğu */}
      <div className="mt-auto sticky bottom-0 border-t border-line bg-surface-2 px-6 py-3 flex items-center justify-center gap-3">
        {iAmSpeaker ? (
          <>
            <span className="text-sm text-status-online font-semibold flex items-center gap-1.5">
              <Mic size={15} /> Konuşmacısın
            </span>
            {!canModerate && (
              <button
                onClick={() => voice.setStageSpeaker(me!.id, false)}
                className="text-sm px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-1 text-ink-secondary"
              >
                {t('stage.becomeAudience')}
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => voice.requestToSpeak(!myHand)}
            className={
              'px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ' +
              (myHand
                ? 'bg-brand-500/20 text-brand-400'
                : 'bg-brand-500 hover:bg-brand-400 text-white')
            }
          >
            <Hand size={15} /> {myHand ? t('stage.withdrawRequest') : t('stage.requestSpeak')}
          </button>
        )}
        {canModerate && !iAmSpeaker && (
          <button
            onClick={() => voice.setStageSpeaker(me!.id, true)}
            className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-1 text-ink-primary text-sm font-semibold"
          >
            {t('stage.startSpeaking')}
          </button>
        )}
      </div>
    </div>
  );
}
