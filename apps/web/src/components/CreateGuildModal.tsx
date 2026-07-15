import { useState } from 'react';
import {
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Gamepad2,
  Users,
  BookOpen,
  GraduationCap,
  MapPin,
  Palette,
  Camera,
} from 'lucide-react';
import { api } from '../api';
import {
  useAppDispatch,
  createGuildThunk,
  acceptInviteThunk,
  closeModal,
  selectGuild,
  setMode,
  addToast,
} from '../store';

type Step = 'home' | 'about' | 'create' | 'join';

interface Template {
  key: string;
  label: string;
  icon: React.ReactNode;
  suggestedName: string;
}

const TEMPLATES: Template[] = [
  { key: 'gaming', label: 'Oyun', icon: <Gamepad2 size={18} />, suggestedName: 'Oyun Topluluğu' },
  { key: 'friends', label: 'Arkadaşlar', icon: <Users size={18} />, suggestedName: 'Arkadaş Grubu' },
  { key: 'study', label: 'Çalışma Grubu', icon: <BookOpen size={18} />, suggestedName: 'Çalışma Grubu' },
  { key: 'school', label: 'Okul Kulübü', icon: <GraduationCap size={18} />, suggestedName: 'Okul Kulübü' },
  { key: 'local', label: 'Yerel Topluluk', icon: <MapPin size={18} />, suggestedName: 'Yerel Topluluk' },
  { key: 'artists', label: 'Sanatçılar ve Zanaatkarlar', icon: <Palette size={18} />, suggestedName: 'Sanat Topluluğu' },
];

export function CreateGuildModal() {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<Step>('home');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  function pickIcon(f: File | null) {
    setIconFile(f);
    setIconPreview(f ? URL.createObjectURL(f) : null);
  }

  function normalizeCode(input: string): string {
    const m = input
      .trim()
      .match(/(?:(?:concord\.com|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)\/(?:invite|davet)\/)?([a-z0-9]{4,16})/i);
    return m?.[1] ?? '';
  }

  async function createServer() {
    const v = name.trim();
    if (v.length < 2) {
      setError('Sunucu adı en az 2 karakter olmalı');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const guild = await dispatch(createGuildThunk(v)).unwrap();
      // Foto seçildiyse yükle ve sunucu ikonu yap
      if (iconFile) {
        try {
          const presign = await api.uploads.presign({
            filename: iconFile.name,
            content_type: iconFile.type || 'image/png',
            size_bytes: iconFile.size,
          });
          await fetch(presign.upload_url, {
            method: 'PUT',
            body: iconFile,
            headers: iconFile.type ? { 'Content-Type': iconFile.type } : undefined,
          });
          await api.guilds.update(guild.id, { icon_url: presign.public_url });
        } catch {
          /* ikon yüklenemese de sunucu oluştu, sessiz geç */
        }
      }
      dispatch(closeModal());
    } catch (e: any) {
      setError(e?.message || 'Oluşturulamadı');
    } finally {
      setLoading(false);
    }
  }

  async function joinServer() {
    const code = normalizeCode(inviteInput);
    if (!code) {
      setError('Geçerli bir davet bağlantısı veya kodu gir');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const guild = await dispatch(acceptInviteThunk(code)).unwrap();
      dispatch(setMode('guild'));
      dispatch(selectGuild(guild.id));
      dispatch(addToast({ kind: 'success', message: `${guild.name} sunucusuna katıldın` }));
      dispatch(closeModal());
    } catch (e: any) {
      setError(e?.message || 'Katılınamadı');
    } finally {
      setLoading(false);
    }
  }

  // ---------- ADIM: ANA ----------
  if (step === 'home') {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-ink-primary text-center">Sunucunu Oluştur</h2>
        <p className="text-sm text-ink-secondary text-center mt-1 mb-5">
          Sunucun, sen ve arkadaşlarının takıldığı yerdir. Kendininkini oluştur ve sohbete başla.
        </p>

        {/* Kendim oluşturayım — ayrı, üstte */}
        <button
          onClick={() => {
            setName('');
            setError(null);
            setStep('about');
          }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-line hover:border-brand-500/60 hover:bg-surface-2 transition-colors mb-5"
        >
          <span className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center shrink-0">
            <Sparkles size={20} />
          </span>
          <span className="flex-1 text-left font-semibold text-ink-primary">Kendim Oluşturayım</span>
          <ChevronRight size={18} className="text-ink-tertiary" />
        </button>

        {/* Şablonlar */}
        <div className="text-[11px] font-bold uppercase text-ink-tertiary tracking-wider mb-2">
          Bir şablon kullanarak başla
        </div>
        <div className="space-y-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setName(t.suggestedName);
                setError(null);
                setStep('create');
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-line hover:border-brand-500/60 hover:bg-surface-2 transition-colors"
            >
              <span className="w-9 h-9 rounded-lg bg-surface-3 text-ink-secondary flex items-center justify-center shrink-0">
                {t.icon}
              </span>
              <span className="flex-1 text-left text-sm font-medium text-ink-primary">{t.label}</span>
              <ChevronRight size={16} className="text-ink-tertiary" />
            </button>
          ))}
        </div>

        {/* Zaten davetin var mı */}
        <div className="mt-6 pt-5 border-t border-line text-center">
          <p className="text-sm text-ink-secondary mb-2">Zaten bir davetin var mı?</p>
          <button
            onClick={() => {
              setInviteInput('');
              setError(null);
              setStep('join');
            }}
            className="w-full py-2.5 rounded-xl bg-surface-3 hover:bg-surface-2 text-ink-primary font-semibold transition-colors"
          >
            Bir Sunucuya Katıl
          </button>
        </div>
      </div>
    );
  }

  // ---------- ADIM: SUNUCUNDAN BAHSET ----------
  if (step === 'about') {
    return (
      <div className="p-6">
        <button
          onClick={() => {
            setStep('home');
            setError(null);
          }}
          className="flex items-center gap-1 text-sm text-ink-tertiary hover:text-ink-primary mb-3"
        >
          <ArrowLeft size={16} /> Geri
        </button>
        <h2 className="text-xl font-bold text-ink-primary text-center">Bize biraz sunucundan bahset</h2>
        <p className="text-sm text-ink-secondary text-center mt-1 mb-5">
          Sunucunu doğru kişilerle kurmamıza yardımcı olur. Sonra istediğini değiştirebilirsin.
        </p>
        <button
          onClick={() => setStep('create')}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-line hover:border-brand-500/60 hover:bg-surface-2 transition-colors mb-2.5"
        >
          <span className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center shrink-0">
            <Users size={20} />
          </span>
          <span className="flex-1 text-left font-semibold text-ink-primary">Benim ve arkadaşlarım için</span>
          <ChevronRight size={18} className="text-ink-tertiary" />
        </button>
        <button
          onClick={() => setStep('create')}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-line hover:border-brand-500/60 hover:bg-surface-2 transition-colors"
        >
          <span className="w-10 h-10 rounded-xl bg-accent-500/15 text-accent-500 flex items-center justify-center shrink-0">
            <BookOpen size={20} />
          </span>
          <span className="flex-1 text-left font-semibold text-ink-primary">Bir kulüp veya topluluk için</span>
          <ChevronRight size={18} className="text-ink-tertiary" />
        </button>
        <div className="mt-5 text-center text-sm text-ink-secondary">
          Emin değil misin?{' '}
          <button onClick={() => setStep('create')} className="text-brand-400 hover:underline font-medium">
            Bu soruyu şimdilik geçebilirsin
          </button>
        </div>
      </div>
    );
  }

  // ---------- ADIM: OLUŞTUR ----------
  if (step === 'create') {
    return (
      <div className="p-6">
        <button
          onClick={() => {
            setStep('home');
            setError(null);
          }}
          className="flex items-center gap-1 text-sm text-ink-tertiary hover:text-ink-primary mb-3"
        >
          <ArrowLeft size={16} /> Geri
        </button>
        <h2 className="text-xl font-bold text-ink-primary text-center mb-1">Sunucunu Özelleştir</h2>
        <p className="text-sm text-ink-secondary text-center mb-5">
          Yeni sunucuna bir kişilik kat. İstediğin zaman değiştirebilirsin.
        </p>

        {/* Sunucu fotosu */}
        <div className="flex justify-center mb-5">
          <label className="relative w-20 h-20 rounded-full cursor-pointer group">
            {iconPreview ? (
              <img src={iconPreview} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="w-full h-full rounded-full border-2 border-dashed border-line flex flex-col items-center justify-center text-ink-tertiary group-hover:border-brand-500/60 group-hover:text-brand-500 transition-colors">
                <Camera size={20} />
                <span className="text-[9px] font-bold uppercase mt-0.5">Yükle</span>
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => pickIcon(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <label className="block text-sm font-semibold text-ink-primary mb-1.5">Sunucu adı</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createServer()}
          placeholder="Örn. Yazılım Türkiye"
          maxLength={64}
          className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary placeholder:text-ink-tertiary"
        />
        {error && <p className="text-accent-500 text-sm mt-2">{error}</p>}
        <button
          onClick={createServer}
          disabled={name.trim().length < 2 || loading}
          className="w-full mt-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold transition-colors"
        >
          {loading ? 'Oluşturuluyor...' : 'Sunucu Oluştur'}
        </button>
      </div>
    );
  }

  // ---------- ADIM: KATIL ----------
  return (
    <div className="p-6">
      <button
        onClick={() => {
          setStep('home');
          setError(null);
        }}
        className="flex items-center gap-1 text-sm text-ink-tertiary hover:text-ink-primary mb-3"
      >
        <ArrowLeft size={16} /> Geri
      </button>
      <h2 className="text-xl font-bold text-ink-primary mb-1">Bir Sunucuya Katıl</h2>
      <p className="text-sm text-ink-secondary mb-5">
        Aşağıya bir davet bağlantısı girerek mevcut bir sunucuya katıl.
      </p>
      <label className="block text-sm font-semibold text-ink-primary mb-1.5">Davet bağlantısı</label>
      <input
        autoFocus
        value={inviteInput}
        onChange={(e) => setInviteInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && joinServer()}
        placeholder="concord.com/davet/abcd1234"
        className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary placeholder:text-ink-tertiary font-mono"
      />
      {error && <p className="text-accent-500 text-sm mt-2">{error}</p>}
      <button
        onClick={joinServer}
        disabled={!inviteInput.trim() || loading}
        className="w-full mt-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold transition-colors"
      >
        {loading ? 'Katılınıyor...' : 'Sunucuya Katıl'}
      </button>
    </div>
  );
}
