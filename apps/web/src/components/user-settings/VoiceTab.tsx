import { useEffect, useState } from 'react';
import { AudioToggle } from './shared';
import { t } from '../../i18n';

export function VoiceTab() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputId, setInputId] = useState(localStorage.getItem('concord_input_device') ?? 'default');
  const [outputId, setOutputId] = useState(
    localStorage.getItem('concord_output_device') ?? 'default',
  );
  const [videoId, setVideoId] = useState(localStorage.getItem('concord_video_device') ?? 'default');
  const [ptt, setPtt] = useState(localStorage.getItem('concord_ptt') === '1');
  const [pttKey, setPttKey] = useState(localStorage.getItem('concord_ptt_key') ?? 'Space');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then(setDevices)
      .catch(() => {});
  }, []);

  function saveDevice(kind: 'input' | 'output' | 'video', id: string) {
    if (kind === 'input') {
      setInputId(id);
      localStorage.setItem('concord_input_device', id);
    } else if (kind === 'output') {
      setOutputId(id);
      localStorage.setItem('concord_output_device', id);
    } else {
      setVideoId(id);
      localStorage.setItem('concord_video_device', id);
    }
  }

  function togglePtt(v: boolean) {
    setPtt(v);
    localStorage.setItem('concord_ptt', v ? '1' : '0');
  }

  useEffect(() => {
    if (!capturing) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      const k = e.code || e.key;
      setPttKey(k);
      localStorage.setItem('concord_ptt_key', k);
      setCapturing(false);
    }
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [capturing]);

  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const outputs = devices.filter((d) => d.kind === 'audiooutput');
  const videos = devices.filter((d) => d.kind === 'videoinput');

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-ink-primary mb-5">{t('voice.title')}</h2>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <h3 className="text-sm font-bold text-ink-primary">{t('voice.inputDevice')}</h3>
        <select
          value={inputId}
          onChange={(e) => saveDevice('input', e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        >
          <option value="default">{t('common.default')}</option>
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || t('voice.micPrefix') + d.deviceId.slice(0, 6)}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <h3 className="text-sm font-bold text-ink-primary">{t('voice.outputDevice')}</h3>
        <select
          value={outputId}
          onChange={(e) => saveDevice('output', e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        >
          <option value="default">{t('common.default')}</option>
          {outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || t('voice.outputPrefix') + d.deviceId.slice(0, 6)}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <h3 className="text-sm font-bold text-ink-primary">{t('voice.camera')}</h3>
        <select
          value={videoId}
          onChange={(e) => saveDevice('video', e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        >
          <option value="default">{t('common.default')}</option>
          {videos.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || t('voice.cameraPrefix') + d.deviceId.slice(0, 6)}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <h3 className="text-sm font-bold text-ink-primary">{t('voice.inputMode')}</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            checked={!ptt}
            onChange={() => togglePtt(false)}
            className="accent-brand-500"
          />
          <span className="text-sm text-ink-primary">
            Ses Aktivitesi <span className="text-ink-tertiary">(her zaman açık)</span>
          </span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            checked={ptt}
            onChange={() => togglePtt(true)}
            className="accent-brand-500"
          />
          <span className="text-sm text-ink-primary">
            Bas-Konuş <span className="text-ink-tertiary">(sadece tuşa basılıyken)</span>
          </span>
        </label>
        {ptt && (
          <button
            type="button"
            onClick={() => setCapturing(true)}
            className="mt-2 px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-1 text-ink-primary text-sm font-semibold border border-line"
          >
            {capturing ? t('voice.pressKey') : t('voice.pttKey', { key: pttKey })}
          </button>
        )}
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-1">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('voice.processing')}</h3>
        <AudioToggle
          storageKey="concord_echo_cancel"
          label={t('voice.echoCancel')}
          desc="Hoparlör sesinin mikrofona geri dönmesini önler"
        />
        <AudioToggle
          storageKey="concord_noise_suppress"
          label={t('voice.noiseSuppress')}
          desc="Arka plan gürültüsünü bastırır (tarayıcı yerleşik)"
        />
        <AudioToggle
          storageKey="concord_rnnoise"
          label={t('voice.rnnoise')}
          desc="Yapay zekâ tabanlı — klavye/fan gibi gürültüleri çok daha iyi temizler, cihazında çalışır"
          defaultOn={false}
        />
        <AudioToggle
          storageKey="concord_auto_gain"
          label={t('voice.autoGain')}
          desc="Mikrofon seviyesini otomatik dengeler"
        />
        <AudioToggle
          storageKey="concord_music_mode"
          label={t('voice.musicMode')}
          desc="Stereo + yüksek bitrate; tüm ses işleme kapatılır (enstrüman/müzik paylaşımı için)"
          defaultOn={false}
        />
        <p className="text-[11px] text-ink-tertiary pt-1">
          Değişiklikler bir sonraki ses kanalına katılışta uygulanır.
        </p>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-1">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('voice.video')}</h3>
        <AudioToggle
          storageKey="concord_video_blur"
          label={t('voice.blurBackground')}
          desc="Kamerada sadece sen net görünürsün (cihazında işlenir, ilk açılışta model indirilir)"
          defaultOn={false}
        />
        <p className="text-[11px] text-ink-tertiary pt-1">
          Kamera açıkken ses kanalındaki "Blur" düğmesiyle anında aç/kapa yapabilirsin.
        </p>

        <div className="pt-3 flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Yayın çözünürlüğü
            </label>
            <select
              defaultValue={localStorage.getItem('concord_stream_res') ?? '720'}
              onChange={(e) => localStorage.setItem('concord_stream_res', e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-2 py-1.5 text-sm text-ink-primary outline-none focus:border-brand-500/50"
              aria-label={t('voice.streamResolution')}
            >
              <option value="480">480p</option>
              <option value="720">720p (önerilen)</option>
              <option value="1080">1080p</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              {t('voice.frameRate')}
            </label>
            <select
              defaultValue={localStorage.getItem('concord_stream_fps') ?? '30'}
              onChange={(e) => localStorage.setItem('concord_stream_fps', e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-2 py-1.5 text-sm text-ink-primary outline-none focus:border-brand-500/50"
              aria-label={t('voice.streamFrameRate')}
            >
              <option value="15">15 FPS</option>
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-ink-tertiary pt-1">
          Kamera ve ekran paylaşımına uygulanır; bir sonraki yayın açılışında geçerli olur.
        </p>
      </div>
    </div>
  );
}
