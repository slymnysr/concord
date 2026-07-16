import { useState } from 'react';
import { User, Lock, Smile, Bell, Mic, Keyboard, Palette, Link2, Bot } from 'lucide-react';
import { useAppSelector } from '../store';
import { t } from '../i18n';
import { ProfileTab } from './user-settings/ProfileTab';
import { AccountTab } from './user-settings/AccountTab';
import { CustomStatusTab } from './user-settings/CustomStatusTab';
import { ConnectionsTab } from './user-settings/ConnectionsTab';
import { NotificationsTab } from './user-settings/NotificationsTab';
import { VoiceTab } from './user-settings/VoiceTab';
import { AppearanceTab } from './user-settings/AppearanceTab';
import { KeyboardTab } from './user-settings/KeyboardTab';
import { DeveloperTab } from './user-settings/DeveloperTab';

type Tab =
  | 'profile'
  | 'account'
  | 'status'
  | 'connections'
  | 'notifications'
  | 'voice'
  | 'appearance'
  | 'keyboard'
  | 'developer';

export function UserSettingsModal() {
  const me = useAppSelector((s) => s.auth.user);
  const [tab, setTab] = useState<Tab>('profile');
  if (!me) return null;

  return (
    <div className="flex max-h-[80vh]" style={{ minHeight: '500px' }}>
      <nav className="w-52 max-md:w-14 bg-surface-2 border-r border-line p-2 md:p-3 space-y-1 overflow-y-auto rounded-l-2xl max-md:rounded-none shrink-0">
        <div className="text-xs font-bold uppercase text-ink-tertiary px-2 py-2">
          {t('usr.title')}
        </div>
        <TabBtn
          icon={<User size={16} />}
          active={tab === 'profile'}
          onClick={() => setTab('profile')}
        >
          {t('settings.profile')}
        </TabBtn>
        <TabBtn
          icon={<Lock size={16} />}
          active={tab === 'account'}
          onClick={() => setTab('account')}
        >
          {t('settings.account')}
        </TabBtn>
        <TabBtn
          icon={<Smile size={16} />}
          active={tab === 'status'}
          onClick={() => setTab('status')}
        >
          {t('settings.status')}
        </TabBtn>
        <TabBtn
          icon={<Link2 size={16} />}
          active={tab === 'connections'}
          onClick={() => setTab('connections')}
        >
          {t('settings.connections')}
        </TabBtn>
        <TabBtn
          icon={<Bell size={16} />}
          active={tab === 'notifications'}
          onClick={() => setTab('notifications')}
        >
          {t('settings.notifications')}
        </TabBtn>
        <TabBtn icon={<Mic size={16} />} active={tab === 'voice'} onClick={() => setTab('voice')}>
          {t('settings.voice')}
        </TabBtn>
        <TabBtn
          icon={<Palette size={16} />}
          active={tab === 'appearance'}
          onClick={() => setTab('appearance')}
        >
          {t('settings.appearance')}
        </TabBtn>
        <TabBtn
          icon={<Keyboard size={16} />}
          active={tab === 'keyboard'}
          onClick={() => setTab('keyboard')}
        >
          {t('settings.keyboard')}
        </TabBtn>
        <TabBtn
          icon={<Bot size={16} />}
          active={tab === 'developer'}
          onClick={() => setTab('developer')}
        >
          {t('settings.developer')}
        </TabBtn>
      </nav>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'profile' && <ProfileTab />}
        {tab === 'account' && <AccountTab />}
        {tab === 'status' && <CustomStatusTab />}
        {tab === 'connections' && <ConnectionsTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'voice' && <VoiceTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'keyboard' && <KeyboardTab />}
        {tab === 'developer' && <DeveloperTab />}
      </div>
    </div>
  );
}

function TabBtn({
  icon,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ' +
        (active
          ? 'bg-brand-500/15 text-brand-500'
          : 'text-ink-secondary hover:bg-surface-3 hover:text-ink-primary')
      }
    >
      {icon}
      <span className="max-md:hidden truncate">{children}</span>
    </button>
  );
}
