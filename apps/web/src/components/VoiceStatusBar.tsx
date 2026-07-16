import { useEffect, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2, Headphones, HeadphoneOff } from 'lucide-react';
import { voice } from '../voice';
import { useAppSelector } from '../store';
import { t } from '../i18n';

export function useVoiceState() {
  const [connected, setConnected] = useState<boolean>(voice.isConnected());
  const [channelId, setChannelId] = useState<string | null>(voice.channelId);
  const [micOn, setMicOn] = useState<boolean>(voice.isMicrophoneEnabled());
  const [deafened, setDeafened] = useState<boolean>(voice.isDeafened());

  useEffect(() => {
    const onConn = ({ channelId: c }: any) => {
      setConnected(true);
      setChannelId(c);
      setMicOn(voice.isMicrophoneEnabled());
      setDeafened(voice.isDeafened());
    };
    const onDisc = () => {
      setConnected(false);
      setChannelId(null);
      setDeafened(false);
    };
    const onMic = ({ enabled }: any) => setMicOn(enabled);
    const onDeaf = ({ deafened: d }: any) => setDeafened(d);
    voice.on('connected', onConn);
    voice.on('disconnected', onDisc);
    voice.on('mic:changed', onMic);
    voice.on('deafen:changed', onDeaf);
    return () => {
      voice.off('connected', onConn);
      voice.off('disconnected', onDisc);
      voice.off('mic:changed', onMic);
      voice.off('deafen:changed', onDeaf);
    };
  }, []);

  return { connected, channelId, micOn, deafened };
}

export function VoiceStatusBar() {
  const { connected, channelId, micOn, deafened } = useVoiceState();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const me = useAppSelector((s) => s.auth.user);
  const channel = useAppSelector((s) =>
    guildId && channelId ? s.channels.byGuild[guildId]?.find((c) => c.id === channelId) : null,
  );
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === guildId));

  // Kendi sunucu-susturma/sağırlaştırma durumum (mod tarafından) — buton kilidi + gösterge
  const [serverState, setServerState] = useState(() => (me ? voice.getServerVoice(me.id) : { mute: false, deafen: false }));
  useEffect(() => {
    if (!me) return;
    setServerState(voice.getServerVoice(me.id));
    const onVs = (ev: any) => { if (String(ev.userId) === me.id) setServerState({ mute: ev.serverMute, deafen: ev.serverDeaf }); };
    voice.on('voiceState:changed', onVs);
    return () => voice.off('voiceState:changed', onVs);
  }, [me?.id]);

  if (!connected || !channelId) return null;

  const srvMute = serverState.mute;
  const srvDeaf = serverState.deafen;

  function toggleMic() {
    if (srvMute || srvDeaf) return; // Sunucu tarafından susturuldun — kendin açamazsın
    voice.setMicrophoneEnabled(!micOn);
  }

  async function leave() {
    try {
      await voice.disconnect();
    } catch {}
  }

  return (
    <div className="bg-surface-2 border-t border-line px-3 py-2 flex items-center gap-2">
      <SignalBars />
      <div className="flex-1 min-w-0">
        <div className={'text-[12px] font-semibold flex items-center gap-1 ' + (srvMute || srvDeaf ? 'text-accent-500' : 'text-status-online')}>
          <Volume2 size={12} className="shrink-0" />
          <span className="truncate">
            {srvDeaf ? t('voice.serverDeafenedYou') : srvMute ? t('voice.serverMutedYou') : t('voice.connected')}
          </span>
        </div>
        <div className="text-[10px] text-ink-tertiary truncate">
          {channel?.name ? `#${channel.name}` : '—'}
          {guild?.name && ` / ${guild.name}`}
        </div>
      </div>
      <button
        onClick={toggleMic}
        disabled={srvMute || srvDeaf}
        title={srvMute || srvDeaf ? 'Sunucu tarafından susturuldun — kendin açamazsın' : micOn ? t('voice.micOff') : t('voice.micOn')}
        className={
          'w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ' +
          (srvMute || srvDeaf
            ? 'bg-accent-500/25 text-accent-500 cursor-not-allowed'
            : micOn
              ? 'text-ink-secondary hover:bg-surface-3 hover:text-ink-primary'
              : 'bg-accent-500/15 text-accent-500 hover:bg-accent-500/25')
        }
      >
        {micOn && !srvMute && !srvDeaf ? <Mic size={14} /> : <MicOff size={14} />}
      </button>
      <button
        onClick={() => { if (!srvDeaf) voice.setDeafened(!deafened); }}
        disabled={srvDeaf}
        title={srvDeaf ? t('voice.serverDeafenedByMod') : deafened ? t('voice.undeafen') : t('voice.deafen')}
        className={
          'w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ' +
          (deafened || srvDeaf
            ? 'bg-accent-500/' + (srvDeaf ? '25 cursor-not-allowed' : '15 hover:bg-accent-500/25') + ' text-accent-500'
            : 'text-ink-secondary hover:bg-surface-3 hover:text-ink-primary')
        }
      >
        {deafened || srvDeaf ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
      </button>
      <button
        onClick={leave}
        title={t('voice.leave')} aria-label={t('voice.leave')}
        className="w-7 h-7 rounded-md text-ink-secondary hover:bg-accent-500 hover:text-white flex items-center justify-center transition-colors shrink-0"
      >
        <PhoneOff size={14} />
      </button>
    </div>
  );
}

// Bağlantı kalitesi göstergesi — gerçek WebRTC RTT'sine göre 3 çubuk (Discord paritesi).
// ≤80ms yeşil · ≤200ms sarı · üstü kırmızı; ölçüm yoksa gri.
function SignalBars() {
  const [rtt, setRtt] = useState<number | null>(voice.getRtt());
  useEffect(() => {
    const onRtt = ({ ms }: any) => setRtt(ms);
    const onDisc = () => setRtt(null);
    voice.on('rtt', onRtt);
    voice.on('disconnected', onDisc);
    return () => {
      voice.off('rtt', onRtt);
      voice.off('disconnected', onDisc);
    };
  }, []);

  const color =
    rtt === null ? 'bg-ink-tertiary/40' : rtt <= 80 ? 'bg-status-online' : rtt <= 200 ? 'bg-status-idle' : 'bg-status-dnd';
  const active = rtt === null ? 0 : rtt <= 80 ? 3 : rtt <= 200 ? 2 : 1;

  return (
    <div
      className="flex items-end gap-[2px] shrink-0"
      title={rtt === null ? t('voice.qualityMeasuring') : `Gecikme: ${rtt} ms`}
      aria-label={rtt === null ? t('voice.qualityMeasuringAria') : `Gecikme ${rtt} milisaniye`}
    >
      {[4, 7, 10].map((h, i) => (
        <span
          key={i}
          style={{ height: h }}
          className={'w-[3px] rounded-sm ' + (i < active ? color : 'bg-ink-tertiary/25')}
        />
      ))}
    </div>
  );
}
