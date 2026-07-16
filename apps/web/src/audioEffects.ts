// Gelişmiş gürültü engelleme — RNNoise (WASM, AudioWorklet).
// Krisp'in açık kaynak karşılığı: tarayıcının yerleşik gürültü engellemesinden belirgin
// daha iyi; tamamen istemcide çalışır. Mikrofon ham track'i bozulmadan kalır (PTT/mute
// ham track üzerinden), producer'a işlenmiş çıkış gider.
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';

const RNNOISE_KEY = 'concord_rnnoise';
const MUSIC_KEY = 'concord_music_mode';

export function isRnnoiseEnabled(): boolean {
  return localStorage.getItem(RNNOISE_KEY) === '1';
}

export function isMusicMode(): boolean {
  return localStorage.getItem(MUSIC_KEY) === '1';
}

let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;

function getWasm(): Promise<ArrayBuffer> {
  if (!wasmBinaryPromise) {
    wasmBinaryPromise = loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }).catch(
      (e) => {
        wasmBinaryPromise = null;
        throw e;
      },
    );
  }
  return wasmBinaryPromise;
}

export interface SuppressedTrack {
  track: MediaStreamTrack;
  stop: () => void;
}

// Ham mikrofon track'inden RNNoise ile temizlenmiş yeni bir track üretir.
// RNNoise 48kHz bekler — AudioContext o örnekleme hızıyla açılır.
export async function createNoiseSuppressedTrack(
  srcTrack: MediaStreamTrack,
): Promise<SuppressedTrack> {
  const wasmBinary = await getWasm();
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.audioWorklet.addModule(rnnoiseWorkletUrl);

  const source = ctx.createMediaStreamSource(new MediaStream([srcTrack]));
  const rnnoise = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
  const destination = ctx.createMediaStreamDestination();
  source.connect(rnnoise);
  rnnoise.connect(destination);

  const track = destination.stream.getAudioTracks()[0];
  const stop = () => {
    try {
      rnnoise.destroy();
    } catch {
      /* yoksay */
    }
    try {
      source.disconnect();
      rnnoise.disconnect();
    } catch {
      /* yoksay */
    }
    try {
      track.stop();
    } catch {
      /* yoksay */
    }
    void ctx.close().catch(() => {});
  };
  srcTrack.addEventListener('ended', stop, { once: true });
  return { track, stop };
}
