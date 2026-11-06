// Max Editor — exportação de vídeo (MediaRecorder sobre o canvas + áudio mixado por WebAudio)
import { parseRatio } from './config.js';

export function exportSize(ratioId, shortSide) {
  const { w, h } = parseRatio(ratioId);
  let W, H;
  if (w <= h) { W = shortSide; H = Math.round(shortSide * h / w); } else { H = shortSide; W = Math.round(shortSide * w / h); }
  const k = Math.min(1, 1920 / Math.max(W, H));
  W = Math.round(W * k) & ~1; H = Math.round(H * k) & ~1;
  return { W: Math.max(2, W), H: Math.max(2, H) };
}

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ];
  return list.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || null;
}
export const extFor = (mime) => (mime && mime.startsWith('video/mp4') ? 'mp4' : 'webm');

const BITRATE = { 480: 2_500_000, 720: 5_000_000, 1080: 9_000_000 };

// opts: { shortSide, fps, onProgress(p), signal:{cancelled} }
export async function exportVideo(engine, opts) {
  const mime = pickMime();
  if (!mime) throw new Error('Este navegador não suporta exportação de vídeo (MediaRecorder).');
  const store = engine.store, dur = store.duration();
  if (dur <= 0) throw new Error('O projeto está vazio.');
  engine.pause(); engine.ensureAudio();
  if (engine.actx && engine.actx.state !== 'running') { try { await engine.actx.resume(); } catch {} }
  const { W, H } = exportSize(store.p.ratio, opts.shortSide);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { alpha: false });
  const fps = opts.fps || 30;

  engine.exporting = true;
  if (engine.monitor) engine.monitor.gain.value = 0; // não toca no alto-falante enquanto exporta
  let wake = null;
  try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch {}

  const stream = cv.captureStream(fps);
  if (engine.exportDest) engine.exportDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: BITRATE[opts.shortSide] || 5_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });

  let hiddenAt = 0, base = 0;
  const onVis = () => {
    if (document.hidden) { hiddenAt = performance.now(); try { rec.pause(); } catch {} for (const p of [engine.vpool, engine.apool]) p.items.forEach((i) => { try { i.el.pause(); } catch {} }); }
    else if (hiddenAt) { base += performance.now() - hiddenAt; hiddenAt = 0; try { rec.resume(); } catch {} }
  };
  document.addEventListener('visibilitychange', onVis);

  try {
    await engine.prime(0);
    rec.start(1000);
    base = performance.now();
    await new Promise((resolve) => {
      let lastP = 0;
      const step = () => {
        if (opts.signal && opts.signal.cancelled) return resolve();
        if (hiddenAt) { requestAnimationFrame(step); return; }
        const t = (performance.now() - base) / 1000;
        const tt = Math.min(t, dur);
        engine.sync(tt, true);
        engine.draw(ctx, W, H, tt, { overlay: false });
        const now = performance.now();
        if (opts.onProgress && now - lastP > 200) { lastP = now; opts.onProgress(Math.min(1, tt / dur)); }
        if (t >= dur) return resolve();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    if (!(opts.signal && opts.signal.cancelled)) await new Promise((r) => setTimeout(r, 300)); // último quadro
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
  } finally {
    document.removeEventListener('visibilitychange', onVis);
    try { if (rec.state !== 'inactive') rec.stop(); } catch {}
    stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    if (wake) { try { await wake.release(); } catch {} }
    if (engine.monitor) engine.monitor.gain.value = 1;
    engine.exporting = false;
    for (const p of [engine.vpool, engine.apool]) p.items.forEach((i) => { try { i.el.pause(); } catch {} i.lastWant = null; });
    engine.requestRender();
  }
  if (opts.signal && opts.signal.cancelled) return null;
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), mime, W, H };
}
