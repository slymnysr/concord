import { useEffect, useState } from 'react';
import { Trash2, Megaphone } from 'lucide-react';
import { api } from '../../api';

export function FollowsTab({ guildId }: { guildId: string }) {
  const [follows, setFollows] = useState<
    Array<{
      id: string;
      source_channel_id: string;
      source_channel: string;
      source_guild: string;
      target_channel_id: string;
      target_channel: string;
      created_at: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.follows
      .listForGuild(guildId)
      .then(setFollows)
      .catch(() => setFollows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [guildId]);

  const remove = (id: string) => {
    api.follows
      .remove(id)
      .then(load)
      .catch(() => {});
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-ink-primary mb-1">Takip Edilen Kanallar</h2>
      <p className="text-sm text-ink-tertiary mb-4">
        Başka sunucuların duyuru kanallarından bu sunucuya iletilen yayınlar. Bir duyuru kanalını
        takip etmek için kanalın başlığındaki "Takip Et" düğmesini kullan.
      </p>
      {loading ? (
        <div className="text-sm text-ink-tertiary">Yükleniyor...</div>
      ) : follows.length === 0 ? (
        <div className="text-sm text-ink-tertiary border border-dashed border-line rounded-xl p-6 text-center">
          Henüz takip edilen duyuru kanalı yok.
        </div>
      ) : (
        <ul className="space-y-2">
          {follows.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3"
            >
              <Megaphone size={18} className="text-brand-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink-primary truncate">
                  {f.source_guild} <span className="text-ink-tertiary font-normal">/</span> #
                  {f.source_channel}
                </div>
                <div className="text-xs text-ink-tertiary truncate">
                  → #{f.target_channel} kanalına iletiliyor
                </div>
              </div>
              <button
                onClick={() => remove(f.id)}
                className="w-8 h-8 rounded-lg hover:bg-accent-500/15 text-ink-tertiary hover:text-accent-500 flex items-center justify-center shrink-0"
                title="Takibi bırak"
                aria-label="Takibi bırak"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
