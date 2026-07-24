import { useEffect, useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { useAppDispatch, useAppSelector, fetchMessages } from '../store';
import type { APIAttachment } from '../api';
import { t, localeTag } from '../i18n';

type MediaItem = { att: APIAttachment; author?: string; created_at: string };

export function MediaView({ channelId }: { channelId: string }) {
  const dispatch = useAppDispatch();
  const messages = useAppSelector((s) => s.messages.byChannel[channelId] ?? []);
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const channel = useAppSelector((s) =>
    guildId ? s.channels.byGuild[guildId]?.find((c) => c.id === channelId) : null,
  );
  const usersById = useAppSelector((s) => s.users.byId);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchMessages(channelId));
  }, [channelId, dispatch]);

  // Tüm mesajlardan görsel/video eklerini topla (en yeni önce)
  const items: MediaItem[] = [];
  for (const m of [...messages].sort((a, b) => (a.id < b.id ? 1 : -1))) {
    for (const a of m.attachments ?? []) {
      const ct = a.content_type ?? '';
      if (ct.startsWith('image/') || ct.startsWith('video/')) {
        items.push({
          att: a,
          author: usersById[m.author_id]?.display_name,
          created_at: m.created_at,
        });
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg">
      <div className="px-6 py-4 border-b border-line flex items-center gap-2 shrink-0">
        <ImageIcon size={18} className="text-brand-500 shrink-0" />
        <div className="min-w-0">
          <h2 className="font-bold text-ink-primary truncate">
            {channel?.name ?? t('media.title')}
            <span className="ml-2 text-xs font-normal text-ink-tertiary">
              {t('media.count', { n: items.length })}
            </span>
          </h2>
          {channel?.topic && <p className="text-xs text-ink-tertiary truncate">{channel.topic}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="text-center py-16 text-ink-tertiary">
            <ImageIcon size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">{t('media.empty')}</p>
            <p className="text-xs mt-1">{t('media.emptyHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {items.map((it, i) => {
              const isVideo = (it.att.content_type ?? '').startsWith('video/');
              return (
                <button
                  key={it.att.id + '-' + i}
                  onClick={() => !isVideo && setLightbox(it.att.url)}
                  className="group relative aspect-square rounded-lg overflow-hidden bg-surface-2 border border-line hover:ring-2 hover:ring-brand-500 transition"
                  title={
                    it.author
                      ? `${it.author} · ${new Date(it.created_at).toLocaleString(localeTag())}`
                      : undefined
                  }
                >
                  {isVideo ? (
                    <video src={it.att.url} className="w-full h-full object-cover" muted />
                  ) : (
                    <img
                      src={it.att.url}
                      alt={it.att.filename}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  )}
                  {it.author && (
                    <span className="absolute bottom-0 inset-x-0 px-1.5 py-1 text-[10px] text-white bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 truncate text-left">
                      {it.author}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X size={28} />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
