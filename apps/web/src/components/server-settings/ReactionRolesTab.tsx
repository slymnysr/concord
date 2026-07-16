import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, type APIRole, type APIChannel, type APIReactionRole } from '../../api';
import { t } from '../../i18n';

export function ReactionRolesTab({ guildId }: { guildId: string }) {
  const [bindings, setBindings] = useState<APIReactionRole[]>([]);
  const [roles, setRoles] = useState<APIRole[]>([]);
  const [channels, setChannels] = useState<APIChannel[]>([]);
  const [messageId, setMessageId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [emoji, setEmoji] = useState('');
  const [roleId, setRoleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const [b, r, c] = await Promise.all([
      api.reactionRoles.list(guildId).catch(() => []),
      api.guilds.roles(guildId).catch(() => []),
      api.guilds.channels(guildId).catch(() => []),
    ]);
    setBindings(b);
    setRoles(r);
    setChannels(c.filter((ch) => ch.type !== 'voice'));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    setError('');
    if (!messageId.trim() || !channelId || !emoji.trim() || !roleId) {
      setError(t('rr.fillAll'));
      return;
    }
    setSaving(true);
    try {
      await api.reactionRoles.create(guildId, {
        message_id: messageId.trim(),
        channel_id: channelId,
        emoji: emoji.trim(),
        role_id: roleId,
      });
      setMessageId('');
      setEmoji('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('rr.addFailed'));
    } finally {
      setSaving(false);
    }
  }

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-1">{t('rr.title')}</h2>
      <p className="text-sm text-ink-secondary mb-4">
        Bir mesaja belirli bir emoji ile tepki veren üyeye otomatik rol atanır; tepki kaldırılınca
        rol geri alınır.
      </p>

      <div className="bg-surface-2 border border-line rounded-xl p-4 mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-tertiary mb-1">{t('common.channel')}</label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            >
              <option value="">{t('common.select')}</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-tertiary mb-1">{t('rr.messageId')}</label>
            <input
              value={messageId}
              onChange={(e) => setMessageId(e.target.value.replace(/[^\d]/g, ''))}
              placeholder={t('rr.messageIdPlaceholder')}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-tertiary mb-1">{t('common.emoji')}</label>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder={t('rr.emojiPlaceholder')}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-tertiary mb-1">{t('common.role')}</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            >
              <option value="">{t('common.select')}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-accent-500">{error}</p>}
        <button
          onClick={submit}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          {saving ? t('common.adding') : t('rr.addBinding')}
        </button>
      </div>

      {bindings.length === 0 ? (
        <p className="text-ink-tertiary text-sm">{t('rr.none')}</p>
      ) : (
        <ul className="space-y-2">
          {bindings.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3"
            >
              <span className="text-xl">{b.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-primary font-semibold truncate">
                  → {roleName(b.role_id)}
                </div>
                <div className="text-xs text-ink-tertiary truncate">
                  #{channelName(b.channel_id)} · mesaj {b.message_id}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Bu tepki rolü bağlamasını sil?')) {
                    api.reactionRoles.delete(b.id).then(refresh);
                  }
                }}
                className="text-ink-tertiary hover:text-accent-500"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
