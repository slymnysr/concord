import { useState } from 'react';
import {
  Hash,
  Volume2,
  MessagesSquare,
  Lock,
  FolderTree,
  Radio,
  Megaphone,
  Image as ImageIcon,
} from 'lucide-react';
import { api } from '../api';
import { useAppDispatch, useAppSelector, closeModal, fetchChannels, selectChannel } from '../store';
import { t } from '../i18n';

type ChannelType = 'text' | 'voice' | 'forum' | 'stage' | 'announcement' | 'category' | 'media';

// ViewChannel = 1 << 10 = 1024
const VIEW_CHANNEL = '1024';

const TYPES: { type: ChannelType; icon: any; label: string; description: string }[] = [
  {
    type: 'text',
    icon: Hash,
    label: 'Metin',
    description: "Mesajlar, resimler, GIF'ler, emojiler, fikirler ve şakalar gönder",
  },
  {
    type: 'voice',
    icon: Volume2,
    label: 'Ses',
    description: 'Birlikte sesli veya görüntülü konuşun ya da ekran paylaşın',
  },
  { type: 'forum', icon: MessagesSquare, label: 'Forum', description: t('chtype.forumDesc') },
  {
    type: 'media',
    icon: ImageIcon,
    label: 'Medya',
    description: 'Görsel ve videoların galeri görünümünde paylaşıldığı kanal',
  },
  {
    type: 'announcement',
    icon: Megaphone,
    label: 'Duyuru',
    description: t('chtype.announcementDesc'),
  },
  {
    type: 'stage',
    icon: Radio,
    label: 'Sahne',
    description: 'Dinleyici kitlesi önünde konuşmacıların yer aldığı etkinlik odası',
  },
  { type: 'category', icon: FolderTree, label: 'Kategori', description: t('chtype.categoryDesc') },
];

export function CreateChannelModal() {
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const presetType = useAppSelector((s) => s.ui.createChannelType);
  const categories = useAppSelector((s) =>
    guildId ? (s.channels.byGuild[guildId] ?? []).filter((c) => c.type === 'category') : [],
  );
  const [type, setType] = useState<ChannelType>(presetType ?? 'text');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [parentId, setParentId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!guildId) return null;

  const isVoice = type === 'voice';
  const isCategory = type === 'category';
  const sectionLabel = isVoice
    ? t('channel.voiceChannels')
    : isCategory
      ? 'Kategori'
      : t('channel.textChannels');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!guildId) return;
    const v = isVoice || isCategory ? name.trim() : name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!v) return;
    setLoading(true);
    setError(null);
    try {
      const created = await api.channels.create(
        guildId,
        v,
        type,
        isCategory ? null : parentId || null,
        isCategory ? undefined : topic.trim() || undefined,
      );
      if (isPrivate && !isCategory) {
        const everyone = (await api.guilds.roles(guildId)).find((r) => r.is_everyone);
        if (everyone) {
          await api.channels.upsertOverride(created.id, {
            target_type: 'role',
            target_id: everyone.id,
            allow: '0',
            deny: VIEW_CHANNEL,
          });
        }
      }
      await dispatch(fetchChannels(guildId));
      dispatch(selectChannel(created.id));
      dispatch(closeModal());
    } catch (e: any) {
      setError(e?.message || t('channel.createFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-6">
      <h2 className="text-xl font-bold text-ink-primary">{t('channel.create')}</h2>
      <p className="text-sm text-ink-secondary mb-5">{sectionLabel} bölümünde</p>

      <label className="block text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-2">
        Kanal Türü
      </label>
      <div className="space-y-2 mb-5">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const selected = t.type === type;
          return (
            <button
              key={t.type}
              type="button"
              onClick={() => setType(t.type)}
              className={
                'w-full text-left p-3 rounded-xl border flex items-center gap-3 transition-colors ' +
                (selected
                  ? 'bg-brand-500/10 border-brand-500/50'
                  : 'bg-surface-2 border-line hover:bg-surface-3')
              }
            >
              <div
                className={
                  'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ' +
                  (selected ? 'bg-brand-500/20 text-brand-500' : 'bg-surface-3 text-ink-secondary')
                }
              >
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-primary">{t.label}</div>
                <div className="text-xs text-ink-tertiary leading-snug">{t.description}</div>
              </div>
              <div
                className={
                  'w-4 h-4 rounded-full border-2 shrink-0 ' +
                  (selected ? 'border-brand-500 bg-brand-500' : 'border-ink-tertiary')
                }
              />
            </button>
          );
        })}
      </div>

      <label className="block text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-1.5">
        Kanal Adı
      </label>
      <div className="relative mb-5">
        {isVoice ? (
          <Volume2
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
          />
        ) : (
          <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
        )}
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isCategory ? t('channel.newCategory') : isVoice ? 'Genel' : 'yeni-kanal'}
          maxLength={100}
          className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg pl-9 pr-3 py-2.5 text-ink-primary placeholder:text-ink-tertiary"
        />
      </div>

      {!isCategory && type !== 'voice' && (
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-1.5">
            Konu (opsiyonel)
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('channel.aboutPlaceholder')}
            maxLength={1024}
            rows={2}
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary placeholder:text-ink-tertiary resize-none text-sm"
          />
        </div>
      )}

      {!isCategory && categories.length > 0 && (
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-1.5">
            Kategori
          </label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary"
          >
            <option value="">— Kategorisiz —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isCategory && (
        <label className="flex items-center justify-between gap-3 mb-5 cursor-pointer">
          <span className="flex items-center gap-2">
            <Lock size={15} className="text-ink-tertiary" />
            <span>
              <span className="block text-sm font-semibold text-ink-primary">
                {t('channel.private')}
              </span>
              <span className="block text-xs text-ink-tertiary">
                Sadece seçilen üyeler ve roller bu kanalı görüntüleyebilir.
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="w-4 h-4 accent-brand-500 shrink-0"
          />
        </label>
      )}

      {error && <p className="text-accent-500 text-sm mb-3">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => dispatch(closeModal())}
          className="px-5 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-ink-primary font-semibold"
        >
          İptal
        </button>
        <button
          type="submit"
          disabled={!name.trim() || loading}
          className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold"
        >
          {loading ? t('common.creating') : t('channel.create')}
        </button>
      </div>
    </form>
  );
}
