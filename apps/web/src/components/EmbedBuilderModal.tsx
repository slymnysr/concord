import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { api, type RichEmbed } from '../api';
import { useAppDispatch } from '../store';
import { t } from '../i18n';

export function EmbedBuilderModal({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState('#00D9A6');
  const [authorName, setAuthorName] = useState('');
  const [footerText, setFooterText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [fields, setFields] = useState<Array<{ name: string; value: string; inline: boolean }>>([]);
  const [busy, setBusy] = useState(false);

  function buildEmbed(): RichEmbed {
    const e: RichEmbed = {};
    if (title.trim()) e.title = title.trim();
    if (description.trim()) e.description = description.trim();
    if (url.trim()) e.url = url.trim();
    if (color) e.color = parseInt(color.replace('#', ''), 16);
    if (authorName.trim()) e.author_name = authorName.trim();
    if (footerText.trim()) e.footer_text = footerText.trim();
    if (imageUrl.trim()) e.image_url = imageUrl.trim();
    const fs = fields.filter((f) => f.name.trim() && f.value.trim());
    if (fs.length) e.fields = fs.map((f) => ({ name: f.name.trim(), value: f.value.trim(), inline: f.inline }));
    return e;
  }

  const embed = buildEmbed();
  const hasContent = Object.keys(embed).length > 0;

  async function send() {
    if (!hasContent || busy) return;
    setBusy(true);
    try {
      const msg = await api.channels.sendMessage(channelId, content.trim(), undefined, { embeds: [embed] });
      dispatch({ type: 'messages/send/fulfilled', payload: msg, meta: { arg: { channelId, content: content.trim() } } });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  const previewColor = color || '#00D9A6';

  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-surface-1 border border-line rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink-primary">{t('embed.title')}</h2>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink-primary"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto grid md:grid-cols-2 gap-0">
          {/* Form */}
          <div className="p-5 space-y-3 border-r border-line">
            <Field label={t('embed.normalMessage')}>
              <input value={content} onChange={(e) => setContent(e.target.value)} className={inputCls} placeholder={t('embed.normalPlaceholder')} />
            </Field>
            <Field label={t('embed.titleLabel')}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={256} className={inputCls} placeholder={t('embed.titlePlaceholder')} />
            </Field>
            <Field label={t('embed.description')}>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2048} className={inputCls + ' resize-none'} placeholder={t('embed.descPlaceholder')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('embed.color')}>
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer bg-transparent border border-line" />
                  <input value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} />
                </div>
              </Field>
              <Field label={t('embed.titleLink')}>
                <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://" />
              </Field>
            </div>
            <Field label={t('embed.authorName')}>
              <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} maxLength={256} className={inputCls} placeholder={t('embed.authorPlaceholder')} />
            </Field>
            <Field label={t('embed.imageUrl')}>
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputCls} placeholder="https://...jpg" />
            </Field>
            <Field label={t('embed.footer')}>
              <input value={footerText} onChange={(e) => setFooterText(e.target.value)} maxLength={2048} className={inputCls} placeholder={t('embed.footerPlaceholder')} />
            </Field>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-ink-secondary">Alanlar ({fields.length})</label>
                {fields.length < 25 && (
                  <button onClick={() => setFields((f) => [...f, { name: '', value: '', inline: true }])} className="text-xs text-brand-500 hover:underline flex items-center gap-1">
                    <Plus size={12} /> Alan ekle
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={i} className="bg-surface-2 rounded-lg p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input value={f.name} onChange={(e) => setFields((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={t('embed.fieldName')} className={inputCls + ' flex-1'} />
                      <button onClick={() => setFields((arr) => arr.filter((_, j) => j !== i))} className="text-ink-tertiary hover:text-accent-500"><Trash2 size={14} /></button>
                    </div>
                    <input value={f.value} onChange={(e) => setFields((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder={t('embed.fieldValue')} className={inputCls} />
                    <label className="flex items-center gap-1.5 text-xs text-ink-tertiary cursor-pointer">
                      <input type="checkbox" checked={f.inline} onChange={(e) => setFields((arr) => arr.map((x, j) => (j === i ? { ...x, inline: e.target.checked } : x)))} className="accent-brand-500" />
                      Satır içi (inline)
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Önizleme */}
          <div className="p-5 bg-bg/40">
            <div className="text-xs font-semibold text-ink-tertiary mb-2">{t('embed.preview')}</div>
            {content.trim() && <div className="text-sm text-ink-primary mb-2 whitespace-pre-wrap">{content}</div>}
            {hasContent ? (
              <div className="max-w-md bg-surface-2 border border-line rounded-r-lg rounded-l-sm p-3" style={{ borderLeft: `4px solid ${previewColor}` }}>
                {authorName.trim() && <div className="text-xs font-semibold text-ink-primary mb-1">{authorName}</div>}
                {title.trim() && <div className="font-semibold text-brand-500 text-sm">{title}</div>}
                {description.trim() && <div className="text-xs text-ink-secondary mt-1 whitespace-pre-wrap">{description}</div>}
                {fields.filter((f) => f.name && f.value).length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {fields.filter((f) => f.name && f.value).map((f, i) => (
                      <div key={i} className={f.inline ? '' : 'col-span-2'}>
                        <div className="text-[11px] font-bold text-ink-primary">{f.name}</div>
                        <div className="text-xs text-ink-secondary whitespace-pre-wrap">{f.value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {imageUrl.trim() && <img src={imageUrl} alt="" className="mt-2 rounded max-h-48 w-full object-cover" />}
                {footerText.trim() && <div className="text-[10px] text-ink-tertiary mt-2">{footerText}</div>}
              </div>
            ) : (
              <p className="text-xs text-ink-tertiary">En az bir alan doldur — önizleme burada görünür.</p>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-ink-secondary hover:text-ink-primary text-sm">{t('common.cancel')}</button>
          <button onClick={send} disabled={!hasContent || busy} className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm font-semibold">
            {busy ? 'Gönderiliyor…' : 'Gönder'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-1.5 text-sm text-ink-primary';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-secondary mb-1">{label}</label>
      {children}
    </div>
  );
}
