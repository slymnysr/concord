import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api';
import { t } from '../../i18n';

export function StickersTab({ guildId }: { guildId: string }) {
  const [stickers, setStickers] = useState<Awaited<ReturnType<typeof api.stickers.list>>>([]);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setStickers(await api.stickers.list(guildId).catch(() => []));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    if (!file || !name.trim()) return;
    setUploading(true);
    try {
      const presign = await api.uploads.presign({
        filename: file.name,
        content_type: file.type || 'image/png',
        size_bytes: file.size,
      });
      await fetch(presign.upload_url, {
        method: 'PUT',
        body: file,
        headers: file.type ? { 'Content-Type': file.type } : undefined,
      });
      const format = file.name.endsWith('.apng')
        ? 'apng'
        : file.name.endsWith('.json')
          ? 'lottie'
          : 'png';
      await api.stickers.create(guildId, {
        name: name.trim(),
        tags,
        url: presign.public_url,
        format,
      });
      setName('');
      setTags('');
      setFile(null);
      refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-4">{t('sticker.title')}</h2>
      <div className="bg-surface-2 border border-line rounded-xl p-4 mb-4">
        <p className="text-sm text-ink-secondary mb-3">
          PNG/APNG/Lottie · 320×320 önerilir · maksimum 500KB
        </p>
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('sticker.namePlaceholder')}
            maxLength={30}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t('sticker.tagsPlaceholder')}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/png,image/apng,.apng,application/json,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="flex-1 text-sm text-ink-secondary file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-surface-3 file:text-ink-primary file:font-semibold"
            />
            <button
              onClick={submit}
              disabled={!file || !name.trim() || uploading}
              className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
            >
              {uploading ? t('sb.uploading') : t('common.add')}
            </button>
          </div>
        </div>
      </div>

      {stickers.length === 0 ? (
        <p className="text-ink-tertiary text-sm">{t('sticker.none')}</p>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {stickers.map((s) => (
            <div
              key={s.id}
              className="bg-surface-2 border border-line rounded-xl p-3 flex flex-col items-center gap-2 group relative"
            >
              <img src={s.url} alt={s.name} className="w-24 h-24 object-contain" />
              <div className="text-sm font-semibold text-ink-primary truncate w-full text-center">
                {s.name}
              </div>
              {s.tags && (
                <div className="text-[10px] text-ink-tertiary truncate w-full text-center">
                  {s.tags}
                </div>
              )}
              <button
                onClick={() => {
                  if (confirm(`"${s.name}" stickerini sil?`)) {
                    api.stickers.delete(s.id).then(refresh);
                  }
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded bg-accent-500 hover:bg-accent-600 text-white flex items-center justify-center transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
