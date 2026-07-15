import { useEffect, useState } from 'react';
import { X, Bookmark, Trash2 } from 'lucide-react';
import { api, type APISavedMessage } from '../api';
import { useAppDispatch, selectChannel, selectDM, switchToGuild, switchToDM } from '../store';

export function SavedMessagesModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<APISavedMessage[] | null>(null);

  useEffect(() => {
    api.savedMessages.list().then(setItems).catch(() => setItems([]));
  }, []);

  async function unsave(id: string) {
    await api.savedMessages.unsave(id).catch(() => {});
    setItems((arr) => (arr ? arr.filter((m) => m.message_id !== id) : arr));
  }

  function jump(sm: APISavedMessage) {
    if (sm.guild_id) {
      dispatch(switchToGuild(sm.guild_id));
      dispatch(selectChannel(sm.channel_id));
    } else {
      dispatch(switchToDM());
      dispatch(selectDM(sm.channel_id));
      dispatch(selectChannel(sm.channel_id));
    }
    onClose();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('concord:jump-to-message', { detail: { messageId: sm.message_id, channelId: sm.channel_id } }));
    }, 700);
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface-1 border border-line rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink-primary flex items-center gap-2">
            <Bookmark size={18} className="text-brand-500" /> Kaydedilen Mesajlar
          </h2>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink-primary">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-3">
          {items === null ? (
            <p className="text-sm text-ink-tertiary text-center py-10">Yükleniyor…</p>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-ink-tertiary">
              <Bookmark size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Henüz kaydedilen mesaj yok.</p>
              <p className="text-xs mt-1">Bir mesaja sağ tıklayıp "🔖 Kaydet" ile başla.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((m) => (
                <li
                  key={m.message_id}
                  className="group flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-surface-2 cursor-pointer"
                  onClick={() => jump(m)}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden"
                    style={{ backgroundColor: m.author_color }}
                  >
                    {m.author_avatar ? (
                      <img src={m.author_avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      m.author_name.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-ink-primary">{m.author_name}</span>
                      {m.channel_name && <span className="text-ink-tertiary truncate">#{m.channel_name}</span>}
                    </div>
                    <div className="text-sm text-ink-secondary truncate">{m.content || '📎 Dosya / anket'}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); unsave(m.message_id); }}
                    title="Kayıttan çıkar" aria-label="Kayıttan çıkar"
                    className="opacity-0 group-hover:opacity-100 text-ink-tertiary hover:text-accent-500 shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
