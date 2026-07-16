import { useEffect, useState } from 'react';
import { UserPlus, Hash, Plus, Users, Bookmark } from 'lucide-react';
import { api, type APIDMChannel, type APIPublicUser } from '../api';
import { useAppDispatch, useAppSelector, openModal, selectDM, selectChannel, setPendingDM, switchToGuild } from '../store';
import { VoiceStatusBar } from './VoiceStatusBar';
import { SavedMessagesModal } from './SavedMessagesModal';
import { t } from '../i18n';

export function DMSidebar() {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const selectedDMId = useAppSelector((s) => s.ui.selectedDMChannelId);
  const pendingDM = useAppSelector((s) => s.ui.pendingDM);
  const readStates = useAppSelector((s) => s.readStates.byChannel);
  const [dms, setDMs] = useState<APIDMChannel[]>([]);
  const [partners, setPartners] = useState<Record<string, APIPublicUser>>({});
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (savedOpen) return; // modal açıkken tazeleme gereksiz
    api.savedMessages.list().then((l) => setSavedCount(l.length)).catch(() => {});
  }, [savedOpen, me?.id]);

  async function refresh() {
    try {
      const list = await api.dms.list();
      setDMs(list);
      const userIds = new Set<string>();
      for (const dm of list) {
        for (const p of dm.participants) {
          if (p !== me?.id) userIds.add(p);
        }
      }
      if (pendingDM) userIds.add(pendingDM.partnerId);
      const ids = Array.from(userIds);
      const results = await Promise.all(
        ids.map((id) => api.users.user(id).catch(() => null)),
      );
      const next: Record<string, APIPublicUser> = {};
      for (let i = 0; i < ids.length; i++) {
        const u = results[i];
        if (u) next[ids[i]] = u;
      }
      setPartners(next);
      // Pending DM artık listeye geldiyse temizle (mesaj atılmış demektir)
      if (pendingDM && list.some((d) => d.id === pendingDM.channelId)) {
        dispatch(setPendingDM(null));
      }
    } catch (e) {
      console.warn('dm refresh', e);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, selectedDMId, pendingDM?.channelId]);

  // Pending DM listede mevcutsa zaten gösteriliyor, ekstra satır gereksiz
  const showPending =
    pendingDM && !dms.some((d) => d.id === pendingDM.channelId)
      ? pendingDM
      : null;

  function dmTitle(dm: APIDMChannel): string {
    if (dm.type === 'group_dm') {
      if (dm.name && dm.name !== t('dm.groupChat')) return dm.name;
      // İsimsiz grup: katılımcı adlarından otomatik başlık üret
      const names = dm.participants
        .filter((p) => p !== me?.id)
        .map((p) => partners[p]?.display_name ?? t('user.unknownShort', { id: p.slice(-4) }));
      return names.length > 0 ? names.join(', ') : dm.name || t('dm.groupChat');
    }
    const other = dm.participants.find((p) => p !== me?.id);
    if (!other) return dm.name || 'DM';
    return partners[other]?.display_name ?? t('user.unknownShort', { id: other.slice(-4) });
  }

  function dmColor(dm: APIDMChannel): string {
    if (dm.type === 'group_dm') return '#5865F2';
    const other = dm.participants.find((p) => p !== me?.id);
    return partners[other ?? '']?.avatar_color ?? '#6B7280';
  }

  return (
    <aside className="w-64 bg-surface-1 flex flex-col border-r border-line">
      <header className="h-14 px-4 flex items-center border-b border-line">
        <h2 className="text-ink-primary font-semibold text-[15px]">{t('dm.title')}</h2>
      </header>

      <div className="px-2.5 py-3 border-b border-line space-y-1.5">
        <button
          onClick={() => dispatch(openModal('friends'))}
          className="w-full px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white font-semibold text-sm flex items-center gap-2 justify-center"
        >
          <UserPlus size={16} />
          Arkadaş Ekle
        </button>
        <button
          onClick={() => setSavedOpen(true)}
          className="w-full px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-secondary hover:text-ink-primary font-medium text-sm flex items-center gap-2 justify-center"
        >
          <Bookmark size={15} />
          Kaydedilenler
          {savedCount > 0 && (
            <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500/20 text-brand-400 text-[11px] font-bold flex items-center justify-center">
              {savedCount}
            </span>
          )}
        </button>
      </div>
      {savedOpen && <SavedMessagesModal onClose={() => setSavedOpen(false)} />}

      <div className="flex-1 overflow-y-auto py-2 px-2.5 space-y-0.5">
        <div className="px-2 mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold text-ink-tertiary uppercase tracking-[0.08em]">
            Doğrudan Mesajlar — {dms.length}
          </span>
          <button
            onClick={() => dispatch(openModal('new_dm'))}
            className="relative group w-5 h-5 rounded flex items-center justify-center text-ink-tertiary hover:text-ink-primary hover:bg-surface-2 transition-colors"
            aria-label={t('dm.createMessage')}
          >
            <Plus size={15} />
            <span className="pointer-events-none absolute right-0 top-full mt-1.5 z-20 whitespace-nowrap rounded-md bg-surface-3 px-2 py-1 text-[11px] font-semibold text-ink-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
              Mesaj Oluştur
            </span>
          </button>
        </div>
        {dms.length === 0 && !showPending && (
          <p className="px-2 text-xs text-ink-tertiary">
            Henüz DM yok. "Arkadaş Ekle" ile başla.
          </p>
        )}
        {showPending && (() => {
          const partner = partners[showPending.partnerId];
          const title = partner?.display_name ?? t('user.unknownShort', { id: showPending.partnerId.slice(-4) });
          const color = partner?.avatar_color ?? '#6B7280';
          const active = showPending.channelId === selectedDMId;
          return (
            <button
              onClick={() => {
                dispatch(selectDM(showPending.channelId));
                dispatch(selectChannel(showPending.channelId));
              }}
              className={
                'w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2.5 transition-colors ' +
                (active
                  ? 'bg-brand-500/10 text-ink-primary'
                  : 'text-ink-secondary hover:bg-surface-2 hover:text-ink-primary')
              }
              title={t('dm.noMessagesYet')} aria-label={t('dm.noMessagesYet')}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-1 ring-brand-500/40"
                style={{ backgroundColor: color }}
              >
                {title.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-sm truncate font-medium flex-1">{title}</span>
              <span className="text-[9px] uppercase font-bold text-brand-500 tracking-wider">{t('common.new')}</span>
            </button>
          );
        })()}
        {dms.map((dm) => {
          const active = dm.id === selectedDMId;
          const rs = readStates[dm.id];
          const unread =
            !active &&
            !!dm.last_message_id &&
            (!rs?.last_message_id || rs.last_message_id < dm.last_message_id);
          const mentions = rs?.mention_count ?? 0;
          return (
            <button
              key={dm.id}
              onClick={() => {
                dispatch(selectDM(dm.id));
                dispatch(selectChannel(dm.id));
              }}
              className={
                'w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2.5 transition-colors ' +
                (active
                  ? 'bg-brand-500/10 text-ink-primary'
                  : unread
                    ? 'text-ink-primary hover:bg-surface-2'
                    : 'text-ink-secondary hover:bg-surface-2 hover:text-ink-primary')
              }
            >
              <div className="relative shrink-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                  style={{ backgroundColor: dmColor(dm) }}
                >
                  {dm.type === 'group_dm' ? <Users size={14} /> : dmTitle(dm).slice(0, 1).toUpperCase()}
                </div>
                {dm.type !== 'group_dm' && (() => {
                  const other = dm.participants.find((p) => p !== me?.id);
                  const st = partners[other ?? '']?.status ?? 'offline';
                  const c =
                    st === 'online' ? 'bg-status-online' : st === 'idle' ? 'bg-status-idle' : st === 'dnd' ? 'bg-status-dnd' : 'bg-status-offline';
                  return <span className={'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface-1 ' + c} />;
                })()}
              </div>
              <span className="flex-1 min-w-0">
                <span className={'block text-sm truncate ' + (unread ? 'font-bold text-ink-primary' : 'font-medium')}>{dmTitle(dm)}</span>
                {dm.type === 'group_dm' && (
                  <span className="block text-[11px] text-ink-tertiary truncate">
                    {dm.participants.length} üye
                  </span>
                )}
              </span>
              {mentions > 0 ? (
                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-500 text-white text-[11px] font-bold flex items-center justify-center">
                  {mentions > 99 ? '99+' : mentions}
                </span>
              ) : unread ? (
                <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-ink-primary" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="px-2.5 pb-2 border-t border-line pt-2">
        <button
          onClick={() => dispatch(switchToGuild())}
          className="w-full px-2 py-1.5 rounded-md text-xs text-ink-tertiary hover:bg-surface-2 hover:text-ink-primary flex items-center gap-2"
        >
          <Hash size={12} />
          Sunucu görünümüne dön
        </button>
      </div>
      <VoiceStatusBar />
    </aside>
  );
}

