import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api';

export function EmojisTab({ guildId }: { guildId: string }) {
  const [emojis, setEmojis] = useState<Awaited<ReturnType<typeof api.emojis.list>>>([]);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setEmojis(await api.emojis.list(guildId).catch(() => []));
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
      await api.emojis.create(guildId, {
        name: name.trim(),
        url: presign.public_url,
        animated: file.type === 'image/gif',
      });
      setName('');
      setFile(null);
      refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-4">
        Özel Emojiler ({emojis.length}/50)
      </h2>
      <div className="bg-surface-2 border border-line rounded-xl p-4 mb-4">
        <p className="text-sm text-ink-secondary mb-3">
          PNG/GIF · 128×128 önerilir · maksimum 256KB · ad 2-32 karakter (sadece a-z, 0-9, _)
        </p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^\w]/g, ''))}
            placeholder="emoji_adi"
            maxLength={32}
            className="flex-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <input
            type="file"
            accept="image/png,image/gif,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="flex-1 text-sm text-ink-secondary file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-surface-3 file:text-ink-primary file:font-semibold"
          />
          <button
            onClick={submit}
            disabled={!file || !name.trim() || uploading}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
          >
            {uploading ? 'Yükleniyor...' : 'Ekle'}
          </button>
        </div>
      </div>

      {emojis.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Henüz özel emoji yok.</p>
      ) : (
        <div className="grid grid-cols-6 md:grid-cols-8 gap-2">
          {emojis.map((e) => (
            <div
              key={e.id}
              className="aspect-square bg-surface-2 border border-line rounded-xl p-2 flex flex-col items-center justify-center gap-1 group relative"
            >
              <img src={e.url} alt={e.name} className="w-10 h-10 object-contain" />
              <span className="text-[10px] truncate w-full text-center text-ink-secondary">
                :{e.name}:
              </span>
              <button
                onClick={() => {
                  if (confirm(`:${e.name}: emojisini sil?`)) {
                    api.emojis.delete(guildId, e.id).then(refresh);
                  }
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 w-5 h-5 rounded bg-accent-500 hover:bg-accent-600 text-white flex items-center justify-center transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
