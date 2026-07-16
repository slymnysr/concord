import { useEffect, lazy, Suspense } from 'react';
import { X } from 'lucide-react';
import { useAppDispatch, useAppSelector, closeModal } from '../store';
import { t } from '../i18n';
import { CreateGuildModal } from './CreateGuildModal';
import { JoinGuildModal } from './JoinGuildModal';
import { InviteLinkModal } from './InviteLinkModal';
import { CreateChannelModal } from './CreateChannelModal';
import { ChannelEditModal } from './ChannelEditModal';
import { NewDMModal } from './NewDMModal';
import { FollowChannelModal } from './FollowChannelModal';

// Ağır modallar — on-demand (kod-bölme): yalnızca açıldıklarında indirilir
const ServerSettingsModal = lazy(() =>
  import('./ServerSettingsModal').then((m) => ({ default: m.ServerSettingsModal })),
);
const UserSettingsModal = lazy(() =>
  import('./UserSettingsModal').then((m) => ({ default: m.UserSettingsModal })),
);
const ChannelSettingsModal = lazy(() =>
  import('./ChannelSettingsModal').then((m) => ({ default: m.ChannelSettingsModal })),
);
const ChannelPermissionsModal = lazy(() =>
  import('./ChannelPermissionsModal').then((m) => ({ default: m.ChannelPermissionsModal })),
);
const SearchModal = lazy(() => import('./SearchModal').then((m) => ({ default: m.SearchModal })));
const AddFriendModal = lazy(() =>
  import('./AddFriendModal').then((m) => ({ default: m.AddFriendModal })),
);

function ModalFallback() {
  return (
    <div className="p-10 flex items-center justify-center">
      <div
        className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"
        aria-label={t('common.loading')}
      />
    </div>
  );
}

export function Modal() {
  const modal = useAppSelector((s) => s.ui.modal);
  const editingChannelId = useAppSelector((s) => s.ui.editingChannelId);
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const editingChannel = useAppSelector((s) =>
    guildId && editingChannelId
      ? s.channels.byGuild[guildId]?.find((c) => c.id === editingChannelId)
      : null,
  );
  const dispatch = useAppDispatch();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dispatch(closeModal());
    }
    if (modal) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, dispatch]);

  if (!modal) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 max-md:p-0 anim-fade-in"
      onClick={() => dispatch(closeModal())}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={
          'anim-modal-in bg-surface-1 border border-line rounded-2xl shadow-2xl relative ring-1 ring-white/5 max-md:w-full max-md:h-full max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:overflow-y-auto ' +
          (modal === 'server_settings' || modal === 'user_settings'
            ? 'w-full max-w-4xl'
            : modal === 'channel_perms'
              ? 'w-full max-w-3xl overflow-hidden'
              : modal === 'channel_settings'
                ? 'w-full max-w-3xl overflow-hidden'
                : modal === 'friends' || modal === 'search'
                  ? 'w-full max-w-2xl'
                  : modal === 'new_dm'
                    ? 'w-full max-w-md'
                    : 'w-full max-w-md')
        }
      >
        <button
          onClick={() => dispatch(closeModal())}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg hover:bg-surface-2 text-ink-secondary hover:text-ink-primary flex items-center justify-center"
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X size={18} />
        </button>
        <Suspense fallback={<ModalFallback />}>
          {modal === 'create_guild' && <CreateGuildModal />}
          {modal === 'join_guild' && <JoinGuildModal />}
          {modal === 'invite_link' && <InviteLinkModal />}
          {modal === 'server_settings' && <ServerSettingsModal />}
          {modal === 'friends' && <AddFriendModal />}
          {modal === 'search' && <SearchModal />}
          {modal === 'create_channel' && <CreateChannelModal />}
          {modal === 'edit_channel' && editingChannel && (
            <ChannelEditModal channel={editingChannel} />
          )}
          {modal === 'channel_perms' && editingChannel && (
            <ChannelPermissionsModal channel={editingChannel} />
          )}
          {modal === 'channel_settings' && editingChannel && (
            <ChannelSettingsModal channel={editingChannel} />
          )}
          {modal === 'user_settings' && <UserSettingsModal />}
          {modal === 'new_dm' && <NewDMModal />}
          {modal === 'follow_channel' && <FollowChannelModal />}
        </Suspense>
      </div>
    </div>
  );
}
