import { useEffect, useState } from 'react';
import { MessagesSquare, Plus, X, Archive, Search } from 'lucide-react';
import { api, type APIChannel } from '../api';
import { useAppDispatch, useAppSelector, selectChannel } from '../store';

type ForumPost = APIChannel & { message_count?: number; member_count?: number; creator_id?: string; archived?: boolean; tag_ids?: string[] };
type ForumTag = { id: string; name: string; emoji?: string; position: number };

export function ForumView({ channelId }: { channelId: string }) {
  const dispatch = useAppDispatch();
  const channel = useAppSelector((s) => {
    const gid = s.guilds.selectedId;
    return gid ? s.channels.byGuild[gid]?.find((c) => c.id === channelId) : null;
  });
  const users = useAppSelector((s) => s.users.byId);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [tags, setTags] = useState<ForumTag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]); // seçili filtre etiketleri (OR)
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');

  function load() {
    setLoading(true);
    api.threads
      .list(channelId, showArchived)
      // En yeni gönderi üstte (snowflake id zaman sıralı)
      .then((l) => setPosts(([...l] as ForumPost[]).sort((a, b) => (a.id < b.id ? 1 : -1))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(load, [channelId, showArchived]);
  useEffect(() => {
    api.forumTags.list(channelId).then(setTags).catch(() => setTags([]));
    setActiveTags([]);
  }, [channelId]);

  const tagMap = new Map(tags.map((t) => [t.id, t]));
  function toggleFilter(id: string) {
    setActiveTags((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  async function toggleArchive(p: ForumPost) {
    await api.threads.setState(p.id, { archived: !p.archived }).catch(() => {});
    load();
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg">
      <div className="px-6 py-4 border-b border-line flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessagesSquare size={18} className="text-brand-500 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-bold text-ink-primary truncate">
              {channel?.name ?? 'Forum'}
              {!loading && <span className="ml-2 text-xs font-normal text-ink-tertiary">{posts.length} gönderi</span>}
            </h2>
            {channel?.topic && <p className="text-xs text-ink-tertiary truncate">{channel.topic}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={'text-xs font-medium px-2.5 py-1.5 rounded-lg border ' + (showArchived ? 'border-brand-500 text-brand-400' : 'border-line text-ink-tertiary hover:text-ink-secondary')}
          >
            {showArchived ? 'Aktifleri göster' : 'Arşivlenenler'}
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"
          >
            <Plus size={15} /> Yeni Gönderi
          </button>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="px-6 py-2 border-b border-line flex items-center gap-1.5 flex-wrap shrink-0">
          {tags.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleFilter(t.id)}
              className={
                'text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ' +
                (activeTags.includes(t.id)
                  ? 'bg-brand-500 border-brand-500 text-white'
                  : 'bg-surface-1 border-line text-ink-secondary hover:border-brand-500/40')
              }
            >
              {t.emoji ? t.emoji + ' ' : ''}{t.name}
            </button>
          ))}
          {activeTags.length > 0 && (
            <button onClick={() => setActiveTags([])} className="text-xs text-ink-tertiary hover:text-ink-primary px-2 py-1">
              Filtreyi temizle
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm text-ink-tertiary text-center py-10">Yükleniyor…</p>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-ink-tertiary">
            <MessagesSquare size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Henüz gönderi yok.</p>
            <p className="text-xs mt-1">"Yeni Gönderi" ile ilk tartışmayı başlat.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Gönderilerde ara..."
                className="w-full bg-surface-1 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-sm text-ink-primary"
              />
            </div>
            {(() => {
              const visible = posts.filter(
                (p) =>
                  p.name.toLowerCase().includes(query.trim().toLowerCase()) &&
                  (activeTags.length === 0 || activeTags.some((t) => (p.tag_ids ?? []).includes(t))),
              );
              if (visible.length === 0) {
                return (
                  <p className="text-sm text-ink-tertiary text-center py-6">
                    {query.trim() || activeTags.length > 0 ? 'Eşleşen gönderi yok.' : ''}
                  </p>
                );
              }
              return visible.map((p) => {
              const author = p.creator_id ? users[p.creator_id] : null;
              return (
                <div
                  key={p.id}
                  className="w-full bg-surface-1 hover:bg-surface-2 border border-line rounded-xl px-4 py-3 transition-colors group flex items-start gap-3"
                >
                  <button
                    onClick={() => {
                      try { sessionStorage.setItem('concord_forum_return', JSON.stringify({ forumId: channelId, threadId: p.id })); } catch { /* yoksay */ }
                      dispatch(selectChannel(p.id));
                    }}
                    className="flex-1 min-w-0 text-left flex items-start gap-3"
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: author?.avatar_color ?? '#5865F2' }}
                    >
                      {(author?.display_name ?? '#').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink-primary group-hover:text-brand-400 truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-ink-tertiary mt-0.5 flex items-center gap-2">
                        {author && <span>{author.display_name}</span>}
                        <span className="flex items-center gap-1">
                          <MessagesSquare size={11} /> {p.message_count ?? 0} mesaj
                        </span>
                        {p.archived && <span className="text-ink-tertiary">· arşivlendi</span>}
                      </div>
                      {(p.tag_ids ?? []).length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-1.5">
                          {(p.tag_ids ?? []).map((tid) => {
                            const t = tagMap.get(tid);
                            if (!t) return null;
                            return (
                              <span key={tid} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-3 text-ink-secondary">
                                {t.emoji ? t.emoji + ' ' : ''}{t.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => toggleArchive(p)}
                    title={p.archived ? 'Arşivden çıkar' : 'Arşivle'}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-ink-tertiary hover:text-ink-primary transition-opacity"
                  >
                    <Archive size={15} />
                  </button>
                </div>
              );
              });
            })()}
          </div>
        )}
      </div>

      {creating && (
        <CreatePostModal
          channelId={channelId}
          tags={tags}
          onClose={() => setCreating(false)}
          onCreated={(threadId) => {
            setCreating(false);
            load();
            try { sessionStorage.setItem('concord_forum_return', JSON.stringify({ forumId: channelId, threadId })); } catch { /* yoksay */ }
            dispatch(selectChannel(threadId));
          }}
        />
      )}
    </div>
  );
}

function CreatePostModal({
  channelId,
  tags,
  onClose,
  onCreated,
}: {
  channelId: string;
  tags: ForumTag[];
  onClose: () => void;
  onCreated: (threadId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleTag(id: string) {
    setSelectedTags((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function create() {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const thread = await api.threads.create(channelId, {
        name: title.trim(),
        type: 'public_thread',
        tag_ids: selectedTags.length ? selectedTags : undefined,
      });
      // İlk mesajı thread'e gönder
      await api.channels.sendMessage(thread.id, body.trim()).catch(() => {});
      onCreated(thread.id);
    } catch (e: any) {
      setErr(e?.message ?? 'Gönderi oluşturulamadı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-surface-1 border border-line rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink-primary">Yeni Forum Gönderisi</h2>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink-primary"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="Gönderi başlığı"
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary font-semibold"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="İlk mesajın…"
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary resize-none"
          />
          {tags.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Etiketler</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={
                      'text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ' +
                      (selectedTags.includes(t.id)
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'bg-surface-2 border-line text-ink-secondary hover:border-brand-500/40')
                    }
                  >
                    {t.emoji ? t.emoji + ' ' : ''}{t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {err && <p className="text-accent-500 text-sm">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-ink-secondary hover:text-ink-primary text-sm">İptal</button>
          <button
            onClick={create}
            disabled={!title.trim() || !body.trim() || busy}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {busy ? 'Oluşturuluyor…' : 'Gönderiyi Yayınla'}
          </button>
        </div>
      </div>
    </div>
  );
}
