import { useEffect, useState } from 'react';
import { Trash2, Plus, Calendar, X } from 'lucide-react';
import { useAppSelector } from '../../store';
import { api } from '../../api';
import { t } from '../../i18n';

export function EventsTab({ guildId }: { guildId: string }) {
  const [events, setEvents] = useState<Awaited<ReturnType<typeof api.events.list>>>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [entityType, setEntityType] = useState<'voice' | 'stage_instance' | 'external'>('voice');
  const [channelId, setChannelId] = useState('');
  const [location, setLocation] = useState('');
  const channels = useAppSelector((s) => s.channels.byGuild[guildId] ?? []);

  async function refresh() {
    setEvents(await api.events.list(guildId).catch(() => []));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    try {
      await api.events.create(guildId, {
        name,
        description: description || undefined,
        scheduled_start_at: new Date(start).toISOString(),
        scheduled_end_at: end ? new Date(end).toISOString() : undefined,
        entity_type: entityType,
        channel_id: entityType !== 'external' ? channelId || undefined : undefined,
        entity_location: entityType === 'external' ? location : undefined,
      });
      setCreating(false);
      setName('');
      setDescription('');
      setStart('');
      setEnd('');
      setLocation('');
      refresh();
    } catch (e) {
      console.warn(e);
    }
  }

  const voiceOrStage = channels.filter((c) => c.type === 'voice' || c.type === 'stage');

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">{t('event.title')}</h2>
        <button
          onClick={() => setCreating((v) => !v)}
          className="bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          {creating ? <X size={14} /> : <Plus size={14} />}
          {creating ? t('common.discard') : t('event.new')}
        </button>
      </div>

      {creating && (
        <div className="bg-surface-2 border border-line rounded-xl p-4 mb-5 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('event.namePlaceholder')}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('event.descPlaceholder')}
            rows={2}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-tertiary mb-1">{t('event.start')}</label>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-tertiary mb-1">{t('event.end')}</label>
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary"
              />
            </div>
          </div>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as any)}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary"
          >
            <option value="voice">{t('event.inVoice')}</option>
            <option value="stage_instance">{t('event.onStage')}</option>
            <option value="external">{t('event.external')}</option>
          </select>
          {entityType !== 'external' ? (
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary"
            >
              <option value="">— Kanal seç —</option>
              {voiceOrStage.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type === 'stage' ? '🎤 ' : '🔊 '}
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('event.locationPlaceholder')}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            />
          )}
          <button
            onClick={submit}
            disabled={!name.trim() || !start}
            className="w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold"
          >
            Oluştur
          </button>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-ink-tertiary text-sm">{t('event.none')}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="bg-surface-2 border border-line rounded-xl p-3 flex items-start gap-3"
            >
              <Calendar size={18} className="text-brand-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-primary">{e.name}</div>
                {e.description && (
                  <div className="text-xs text-ink-secondary mt-0.5">{e.description}</div>
                )}
                <div className="text-xs text-ink-tertiary mt-1">
                  📅 {new Date(e.scheduled_start_at).toLocaleString('tr-TR')} · {e.subscriber_count}{' '}
                  ilgilenen
                </div>
                {e.entity_location && (
                  <div className="text-xs text-ink-tertiary mt-0.5">📍 {e.entity_location}</div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    e.subscribed
                      ? api.events.unsubscribe(e.id).then(refresh)
                      : api.events.subscribe(e.id).then(refresh)
                  }
                  className={
                    'px-2 py-1 rounded text-xs font-semibold ' +
                    (e.subscribed
                      ? 'bg-brand-500/15 text-brand-500'
                      : 'bg-surface-3 hover:bg-brand-500 hover:text-white text-ink-secondary')
                  }
                >
                  {e.subscribed ? '✓ İlgileniyorum' : t('event.interested')}
                </button>
                <button
                  onClick={() => {
                    if (confirm(t('event.deleteConfirm'))) {
                      api.events.delete(e.id).then(refresh);
                    }
                  }}
                  className="px-2 py-1 rounded text-xs bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
