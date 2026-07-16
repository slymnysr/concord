import { useEffect, useState } from 'react';
import { httpUrl } from '../serverConfig';
import { UserPlus, Check, X, Mail } from 'lucide-react';
import { api } from '../api';
import { useAppDispatch, useAppSelector, openModal } from '../store';
import { t } from '../i18n';

interface FriendItem {
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  status: string;
  friendship: 'accepted' | 'pending_sent' | 'pending_received';
}

export function AddFriendModal() {
  const [tab, setTab] = useState<'list' | 'add'>('list');
  const [list, setList] = useState<FriendItem[]>([]);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);

  async function refresh() {
    const r = ((await api) as any).request?.('/friends') as any;
    // basit: doğrudan fetch et
    try {
      const res = await fetch(httpUrl('/api/v1/friends'), {
        headers: { Authorization: 'Bearer ' + localStorage.getItem('concord_access') },
      });
      setList(await res.json());
    } catch {}
    void r;
  }

  useEffect(() => {
    refresh();
  }, []);

  async function send() {
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(httpUrl('/api/v1/friends'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('concord_access'),
        },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? 'istek gönderilemedi');
        return;
      }
      setSuccess(t('friend.requestSentDot'));
      setUsername('');
      refresh();
    } catch (e: any) {
      setError(e?.message ?? 'hata');
    } finally {
      setBusy(false);
    }
  }

  async function accept(userId: string) {
    await fetch(httpUrl(`/api/v1/friends/${userId}/accept`), {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + localStorage.getItem('concord_access') },
    });
    refresh();
  }

  async function remove(userId: string) {
    if (!confirm(t('friend.endConfirm'))) return;
    await fetch(httpUrl(`/api/v1/friends/${userId}`), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + localStorage.getItem('concord_access') },
    });
    refresh();
  }

  async function openDM(userId: string) {
    const res = await fetch(httpUrl('/api/v1/users/me/channels'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + localStorage.getItem('concord_access'),
      },
      body: JSON.stringify({ user_id: userId }),
    });
    if (res.ok) {
      dispatch(openModal(null));
      // TODO: navigate to DM channel
      alert('DM açıldı. Faz 5.4.x: DM sayfası entegrasyonu yapılacak.');
    }
  }

  const accepted = list.filter((f) => f.friendship === 'accepted');
  const incoming = list.filter((f) => f.friendship === 'pending_received');
  const outgoing = list.filter((f) => f.friendship === 'pending_sent');

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center">
          <UserPlus size={20} />
        </div>
        <h2 className="text-xl font-bold text-ink-primary">{t('friend.title')}</h2>
      </div>

      <div className="flex gap-1 mb-4 border-b border-line">
        <TabBtn active={tab === 'list'} onClick={() => setTab('list')}>
          Arkadaşlar ({accepted.length})
        </TabBtn>
        <TabBtn active={tab === 'add'} onClick={() => setTab('add')}>
          <Mail size={14} className="inline mr-1" /> Yeni İstek
        </TabBtn>
      </div>

      {tab === 'add' && (
        <div>
          <label className="block text-sm font-semibold text-ink-primary mb-1.5">
            Kullanıcı adı
          </label>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('friend.usernamePlaceholder', { name: me?.username ?? 'user' })}
              className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!username.trim() || busy}
              className="px-4 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
            >
              Gönder
            </button>
          </div>
          {error && <p className="text-accent-500 text-sm mt-2">{error}</p>}
          {success && <p className="text-brand-500 text-sm mt-2">{success}</p>}
        </div>
      )}

      {tab === 'list' && (
        <div className="space-y-4">
          {incoming.length > 0 && (
            <FriendSection title={t('friend.incomingCount', { n: incoming.length })}>
              {incoming.map((f) => (
                <FriendRow key={f.user_id} f={f}>
                  <button
                    onClick={() => accept(f.user_id)}
                    className="px-3 py-1.5 bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold rounded-lg flex items-center gap-1"
                  >
                    <Check size={14} /> Kabul
                  </button>
                  <button
                    onClick={() => remove(f.user_id)}
                    className="px-3 py-1.5 bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary text-sm rounded-lg flex items-center gap-1"
                  >
                    <X size={14} /> Reddet
                  </button>
                </FriendRow>
              ))}
            </FriendSection>
          )}
          {outgoing.length > 0 && (
            <FriendSection title={t('friend.outgoingCount', { n: outgoing.length })}>
              {outgoing.map((f) => (
                <FriendRow key={f.user_id} f={f}>
                  <button
                    onClick={() => remove(f.user_id)}
                    className="px-3 py-1.5 bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary text-sm rounded-lg"
                  >
                    İptal
                  </button>
                </FriendRow>
              ))}
            </FriendSection>
          )}
          {accepted.length > 0 && (
            <FriendSection title={t('friend.acceptedCount', { n: accepted.length })}>
              {accepted.map((f) => (
                <FriendRow key={f.user_id} f={f}>
                  <button
                    onClick={() => openDM(f.user_id)}
                    className="px-3 py-1.5 bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold rounded-lg"
                  >
                    Mesaj
                  </button>
                  <button
                    onClick={() => remove(f.user_id)}
                    className="px-3 py-1.5 bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary text-sm rounded-lg"
                  >
                    Kaldır
                  </button>
                </FriendRow>
              ))}
            </FriendSection>
          )}
          {accepted.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
            <p className="text-sm text-ink-tertiary text-center py-6">
              Henüz arkadaşın yok. "Yeni İstek" sekmesinden kullanıcı adıyla istek gönder.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'px-4 py-2 text-sm font-semibold border-b-2 transition-colors ' +
        (active
          ? 'text-brand-500 border-brand-500'
          : 'text-ink-secondary border-transparent hover:text-ink-primary')
      }
    >
      {children}
    </button>
  );
}

function FriendSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold uppercase text-ink-tertiary mb-2 tracking-wider">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function FriendRow({ f, children }: { f: FriendItem; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-3 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: f.avatar_color }}
      >
        {f.display_name.slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-ink-primary font-semibold truncate">{f.display_name}</div>
        <div className="text-xs text-ink-tertiary truncate">@{f.username}</div>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
