import { useEffect, useState } from 'react';
import { Trash2, Plus, Play, X } from 'lucide-react';
import { api } from '../../api';
import { t } from '../../i18n';

export function SoundboardTab({ guildId }: { guildId: string }) {
  const [sounds, setSounds] = useState<Awaited<ReturnType<typeof api.sounds.list>>>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setSounds(await api.sounds.list(guildId).catch(() => []));
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
        content_type: file.type || 'audio/mpeg',
        size_bytes: file.size,
      });
      await fetch(presign.upload_url, {
        method: 'PUT',
        body: file,
        headers: file.type ? { 'Content-Type': file.type } : undefined,
      });
      await api.sounds.create(guildId, {
        name: name.trim(),
        emoji: emoji || undefined,
        file_url: presign.public_url,
      });
      setName('');
      setEmoji('');
      setFile(null);
      setAdding(false);
      refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">{t('sb.title')}</h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          {adding ? <X size={14} /> : <Plus size={14} />}
          {adding ? t('common.discard') : t('sb.addSound')}
        </button>
      </div>

      {adding && (
        <div className="bg-surface-2 border border-line rounded-xl p-4 mb-5 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('sb.namePlaceholder')}
            maxLength={32}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder={t('sb.emojiPlaceholder')}
            maxLength={4}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-ink-secondary file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-surface-3 file:text-ink-primary file:font-semibold hover:file:bg-surface-1"
          />
          <button
            onClick={submit}
            disabled={!file || !name.trim() || uploading}
            className="w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
          >
            {uploading ? t('sb.uploading') : t('common.upload')}
          </button>
        </div>
      )}

      {sounds.length === 0 ? (
        <p className="text-ink-tertiary text-sm">{t('sb.none')}</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {sounds.map((s) => (
            <div
              key={s.id}
              className="bg-surface-2 border border-line rounded-xl p-3 flex items-center gap-2"
            >
              <span className="text-2xl shrink-0">{s.emoji ?? '🔊'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-primary truncate">{s.name}</div>
                <audio src={s.file_url} controls className="w-full h-7 mt-1" />
              </div>
              <button
                onClick={() => {
                  if (confirm(`"${s.name}" sesini sil?`)) {
                    api.sounds.delete(s.id).then(refresh);
                  }
                }}
                className="text-ink-tertiary hover:text-accent-500 shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Play helper unused yet — voice kanaldayken SoundboardPlayButton kullanır
void Play;
