import { useState } from 'react';
import {
  Settings,
  Shield,
  Ban,
  Plus,
  Calendar,
  Volume2,
  Smile,
  Sticker,
  Slash,
  Link2,
  Hand,
  ScrollText,
  ShieldAlert,
  BarChart2,
  Megaphone,
} from 'lucide-react';
import { useAppSelector } from '../store';
import { t } from '../i18n';
import { OverviewTab } from './server-settings/OverviewTab';
import { InsightsTab } from './server-settings/InsightsTab';
import { RolesTab } from './server-settings/RolesTab';
import { MembersTab } from './server-settings/MembersTab';
import { BansTab } from './server-settings/BansTab';
import { EventsTab } from './server-settings/EventsTab';
import { SoundboardTab } from './server-settings/SoundboardTab';
import { EmojisTab } from './server-settings/EmojisTab';
import { StickersTab } from './server-settings/StickersTab';
import { CommandsTab } from './server-settings/CommandsTab';
import { ReactionRolesTab } from './server-settings/ReactionRolesTab';
import { WelcomeTab } from './server-settings/WelcomeTab';
import { AutomodTab } from './server-settings/AutomodTab';
import { AuditTab } from './server-settings/AuditTab';
import { GuildInvitesTab } from './server-settings/GuildInvitesTab';
import { FollowsTab } from './server-settings/FollowsTab';

type Tab =
  | 'overview'
  | 'insights'
  | 'roles'
  | 'members'
  | 'bans'
  | 'events'
  | 'soundboard'
  | 'emojis'
  | 'stickers'
  | 'commands'
  | 'reaction-roles'
  | 'welcome'
  | 'automod'
  | 'audit'
  | 'invites'
  | 'follows';

export function ServerSettingsModal() {
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === s.guilds.selectedId));
  const [tab, setTab] = useState<Tab>('overview');

  if (!guild) return null;

  return (
    <div className="flex max-h-[80vh]" style={{ minHeight: '500px' }}>
      <nav className="w-48 max-md:w-14 bg-surface-2 border-r border-line p-2 md:p-3 space-y-1 overflow-y-auto rounded-l-2xl max-md:rounded-none shrink-0">
        <div className="text-xs font-bold uppercase text-ink-tertiary px-2 py-2">{guild.name}</div>
        <TabBtn
          icon={<Settings size={16} />}
          active={tab === 'overview'}
          onClick={() => setTab('overview')}
        >
          {t('srv.nav.overview')}
        </TabBtn>
        <TabBtn
          icon={<Shield size={16} />}
          active={tab === 'roles'}
          onClick={() => setTab('roles')}
        >
          {t('srv.nav.roles')}
        </TabBtn>
        <TabBtn
          icon={<Plus size={16} />}
          active={tab === 'members'}
          onClick={() => setTab('members')}
        >
          {t('srv.nav.members')}
        </TabBtn>
        <TabBtn icon={<Ban size={16} />} active={tab === 'bans'} onClick={() => setTab('bans')}>
          {t('srv.nav.bans')}
        </TabBtn>
        <TabBtn
          icon={<Calendar size={16} />}
          active={tab === 'events'}
          onClick={() => setTab('events')}
        >
          {t('srv.nav.events')}
        </TabBtn>
        <TabBtn
          icon={<Volume2 size={16} />}
          active={tab === 'soundboard'}
          onClick={() => setTab('soundboard')}
        >
          {t('srv.nav.soundboard')}
        </TabBtn>
        <TabBtn
          icon={<Smile size={16} />}
          active={tab === 'emojis'}
          onClick={() => setTab('emojis')}
        >
          {t('srv.nav.emojis')}
        </TabBtn>
        <TabBtn
          icon={<Sticker size={16} />}
          active={tab === 'stickers'}
          onClick={() => setTab('stickers')}
        >
          {t('srv.nav.stickers')}
        </TabBtn>
        <TabBtn
          icon={<Slash size={16} />}
          active={tab === 'commands'}
          onClick={() => setTab('commands')}
        >
          {t('srv.nav.commands')}
        </TabBtn>
        <TabBtn
          icon={<Link2 size={16} />}
          active={tab === 'reaction-roles'}
          onClick={() => setTab('reaction-roles')}
        >
          {t('srv.nav.reactionRoles')}
        </TabBtn>
        <TabBtn
          icon={<Hand size={16} />}
          active={tab === 'welcome'}
          onClick={() => setTab('welcome')}
        >
          {t('srv.nav.welcome')}
        </TabBtn>
        <TabBtn
          icon={<ShieldAlert size={16} />}
          active={tab === 'automod'}
          onClick={() => setTab('automod')}
        >
          {t('srv.nav.automod')}
        </TabBtn>
        <TabBtn
          icon={<BarChart2 size={16} />}
          active={tab === 'insights'}
          onClick={() => setTab('insights')}
        >
          {t('srv.nav.insights')}
        </TabBtn>
        <TabBtn
          icon={<ScrollText size={16} />}
          active={tab === 'audit'}
          onClick={() => setTab('audit')}
        >
          {t('srv.nav.audit')}
        </TabBtn>
        <TabBtn
          icon={<Link2 size={16} />}
          active={tab === 'invites'}
          onClick={() => setTab('invites')}
        >
          {t('srv.nav.invites')}
        </TabBtn>
        <TabBtn
          icon={<Megaphone size={16} />}
          active={tab === 'follows'}
          onClick={() => setTab('follows')}
        >
          {t('srv.nav.follows')}
        </TabBtn>
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && <OverviewTab guildId={guild.id} />}
        {tab === 'insights' && <InsightsTab guildId={guild.id} />}
        {tab === 'roles' && <RolesTab guildId={guild.id} />}
        {tab === 'members' && <MembersTab guildId={guild.id} />}
        {tab === 'bans' && <BansTab guildId={guild.id} />}
        {tab === 'events' && <EventsTab guildId={guild.id} />}
        {tab === 'soundboard' && <SoundboardTab guildId={guild.id} />}
        {tab === 'emojis' && <EmojisTab guildId={guild.id} />}
        {tab === 'stickers' && <StickersTab guildId={guild.id} />}
        {tab === 'commands' && <CommandsTab guildId={guild.id} />}
        {tab === 'reaction-roles' && <ReactionRolesTab guildId={guild.id} />}
        {tab === 'welcome' && <WelcomeTab guildId={guild.id} />}
        {tab === 'automod' && <AutomodTab guildId={guild.id} />}
        {tab === 'audit' && <AuditTab guildId={guild.id} />}
        {tab === 'invites' && <GuildInvitesTab guildId={guild.id} />}
        {tab === 'follows' && <FollowsTab guildId={guild.id} />}
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
