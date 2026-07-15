// Video arka plan bulanıklaştırma — MediaPipe selfie segmentation (tamamen istemci tarafı).
// Kamera track'i gizli bir işleme hattından geçer: kişi keskin kalır, arka plan blur'lanır;
// çıktı canvas.captureStream() track'i olarak mediasoup producer'a verilir.
import type { ImageSegmenter as ImageSegmenterT } from '@mediapipe/tasks-vision';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

const BLUR_KEY = 'concord_video_blur';

export function isBlurEnabled(): boolean {
  return localStorage.getItem(BLUR_KEY) === '1';
}

export function setBlurEnabledFlag(v: boolean) {
  if (v) localStorage.setItem(BLUR_KEY, '1');
  else localStorage.removeItem(BLUR_KEY);
}

let segmenterPromise: Promise<ImageSegmenterT> | null = null;

async function getSegmenter(): Promise<ImageSegmenterT> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    })().catch((e) => {
      segmenterPromise = null; // sonraki denemede yeniden yüklensin
      throw e;
    });
  }
  return segmenterPromise;
}

export interface BlurredTrack {
  track: MediaStreamTrack;
  stream: MediaStream;
  stop: () => void;
}

// srcTrack'ten bulanık-arka-planlı yeni bir video track üretir. srcTrack'i durdurmaz.
export async function createBlurredTrack(srcTrack: MediaStreamTrack): Promise<BlurredTrack> {
  const segmenter = await getSegmenter();

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([srcTrack]);
  await video.play();

  const settings = srcTrack.getSettings();
  const srcW = settings.width || video.videoWidth || 1280;
  const srcH = settings.height || video.videoHeight || 720;
  // Performans: işleme çözünürlüğünü sınırla (maske döngüsü piksel başına çalışır)
  const scale = Math.min(1, 960 / srcW);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  // proc: kaynak kare (segmentasyon girdisi) · mask: kişi alfa maskesi · out: yayınlanan kompozit
  const proc = document.createElement('canvas');
  proc.width = w;
  proc.height = h;
  const procCtx = proc.getContext('2d', { willReadFrequently: false })!;
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const maskCtx = mask.getContext('2d', { willReadFrequently: true })!;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const outCtx = out.getContext('2d')!;
  const maskImage = maskCtx.createImageData(w, h);

  const FPS = 24;
  let running = true;
  let lastVideoTime = -1;

  function renderFrame() {
    if (!running) return;
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    procCtx.drawImage(video, 0, 0, w, h);

    segmenter.segmentForVideo(proc, performance.now(), (result) => {
      const cm = result.categoryMask;
      if (!cm) return;
      const data = cm.getAsUint8Array();
      const px = maskImage.data;
      // selfie segmenter: kategori 0 = kişi, 0 dışı = arka plan
      for (let i = 0; i < data.length; i++) {
        px[i * 4 + 3] = data[i] === 0 ? 255 : 0;
      }
      cm.close();
      maskCtx.putImageData(maskImage, 0, 0);

      outCtx.save();
      outCtx.clearRect(0, 0, w, h);
      // 1) Kişi: keskin kare, maske ile kırp
      outCtx.drawImage(proc, 0, 0);
      outCtx.globalCompositeOperation = 'destination-in';
      outCtx.drawImage(mask, 0, 0);
      // 2) Arka plan: bulanık kare, kişinin arkasına
      outCtx.globalCompositeOperation = 'destination-over';
      outCtx.filter = 'blur(14px)';
      outCtx.drawImage(proc, 0, 0);
      outCtx.restore();
    });
  }

  const interval = window.setInterval(renderFrame, 1000 / FPS);

  const stream = out.captureStream(FPS);
  const track = stream.getVideoTracks()[0];

  const stop = () => {
    running = false;
    window.clearInterval(interval);
    track.stop();
    video.pause();
    video.srcObject = null;
  };
  // Kaynak track biterse (cihaz çekildi vs.) hattı da kapat
  srcTrack.addEventListener('ended', stop, { once: true });

  return { track, stream, stop };
}
