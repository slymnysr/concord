import { useEffect, useState } from 'react';
import { api } from '../../api';
import { t } from '../../i18n';

export function InsightsTab({ guildId }: { guildId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.guilds.insights>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.guilds
      .insights(guildId)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [guildId]);

  if (loading) return <p className="text-ink-tertiary text-sm">{t('common.loading')}</p>;
  if (!data) return <p className="text-ink-tertiary text-sm">{t('insights.statsFailed')}</p>;

  const maxGrowth = Math.max(1, ...data.member_growth.map((p) => p.count));
  const maxAct = Math.max(1, ...data.message_activity.map((p) => p.count));

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-ink-primary mb-4">{t('insights.title')}</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label={t('insights.totalMembers')} value={data.member_count} />
        <Stat label={t('insights.newMembers7d')} value={data.new_members_7d} accent />
        <Stat label={t('insights.messages7d')} value={data.messages_7d} />
        <Stat label={t('insights.messages30d')} value={data.messages_30d} />
      </div>

      <ChartCard
        title={t('insights.memberGrowth')}
        aria-label={t('insights.memberGrowth')}
        points={data.member_growth}
        max={maxGrowth}
        color="bg-brand-500"
      />
      <ChartCard
        title={t('insights.msgActivity')}
        aria-label={t('insights.msgActivity')}
        points={data.message_activity}
        max={maxAct}
        color="bg-accent-500"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <TopList
          title={t('insights.topChannels')}
          aria-label={t('insights.topChannels')}
          items={data.top_channels}
          prefix="#"
        />
        <TopList title={t('insights.topMembers')} aria-label={t('insights.topMembers')} items={data.top_members} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-3">
      <div className={'text-2xl font-bold ' + (accent ? 'text-brand-500' : 'text-ink-primary')}>
        {value.toLocaleString('tr-TR')}
      </div>
      <div className="text-xs text-ink-tertiary mt-0.5">{label}</div>
    </div>
  );
}

function ChartCard({
  title,
  points,
  max,
  color,
}: {
  title: string;
  points: Array<{ date: string; count: number }>;
  max: number;
  color: string;
}) {
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-4 mb-3">
      <h3 className="text-sm font-bold text-ink-primary mb-3">{title}</h3>
      <div className="flex items-end gap-1 h-24">
        {points.map((p) => (
          <div
            key={p.date}
            className="flex-1 flex flex-col items-center justify-end h-full group relative"
          >
            <div
              className={'w-full rounded-t ' + color + ' transition-all'}
              style={{ height: `${Math.max(2, (p.count / max) * 100)}%` }}
            />
            <div className="absolute -top-5 opacity-0 group-hover:opacity-100 text-[10px] text-ink-secondary bg-surface-1 px-1 rounded pointer-events-none whitespace-nowrap">
              {p.count} · {p.date.slice(5)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopList({
  title,
  items,
  prefix,
}: {
  title: string;
  items: Array<{ id: string; name: string; count: number }>;
  prefix?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-4">
      <h3 className="text-sm font-bold text-ink-primary mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-ink-tertiary">{t('common.noData')}</p>
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.id}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-ink-primary truncate">
                  {prefix}
                  {i.name}
                </span>
                <span className="text-ink-tertiary shrink-0 ml-2">{i.count}</span>
              </div>
              <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full"
                  style={{ width: `${(i.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
