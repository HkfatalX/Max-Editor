// Max Editor — importação de mídia (metadados + miniatura) e criação de clipes
import { storage } from './storage.js';
import { uid, makeClip, defaultText } from './state.js';
import { IMAGE_DUR } from './config.js';

const EXT = {
  video: ['mp4', 'mov', 'm4v', 'webm', 'mkv', '3gp', 'avi', 'ogv'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic'],
  audio: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'amr'],
};

export function kindOf(file) {
  const t = file.type || '';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  const ext = ((file.name || '').split('.').pop() || '').toLowerCase();
  for (const k of Object.keys(EXT)) if (EXT[k].includes(ext)) return k;
  return null;
}

function once(el, ev, ms) {
  return new Promise((res, rej) => {
    let done = false;
    const ok = () => { if (done) return; done = true; cleanup(); res(); };
    const bad = () => { if (done) return; done = true; cleanup(); rej(new Error('Formato não suportado neste aparelho')); };
    const to = setTimeout(() => { if (done) return; done = true; cleanup(); rej(new Error('Tempo esgotado ao ler o arquivo')); }, ms);
    function cleanup() { clearTimeout(to); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); }
    el.addEventListener(ev, ok); el.addEventListener('error', bad);
  });
}

function thumbFrom(src, sw, sh) {
  const W = 160, H = Math.max(1, Math.round(W * sh / sw));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.getContext('2d').drawImage(src, 0, 0, W, H);
  return cv.toDataURL('image/jpeg', 0.6);
}

export async function probe(file, kind) {
  if (kind === 'image') {
    const bmp = await createImageBitmap(file);
    const r = { dur: IMAGE_DUR, w: bmp.width, h: bmp.height, thumb: thumbFrom(bmp, bmp.width, bmp.height) };
    bmp.close(); return r;
  }
  const url = URL.createObjectURL(file);
  const el = document.createElement(kind === 'video' ? 'video' : 'audio');
  el.preload = 'metadata'; el.muted = true; el.setAttribute('playsinline', '');
  try {
    el.src = url;
    await once(el, 'loadedmetadata', 20000);
    let dur = el.duration;
    if (!isFinite(dur)) { // webm gravado sem duração
      el.currentTime = 1e101; await once(el, 'timeupdate', 5000).catch(() => {});
      dur = el.duration; el.currentTime = 0;
    }
    if (!isFinite(dur) || dur <= 0) throw new Error('Não consegui ler a duração do arquivo');
    if (kind === 'audio') return { dur, w: 0, h: 0, thumb: '' };
    const w = el.videoWidth, h = el.videoHeight;
    if (!w || !h) throw new Error('Vídeo sem imagem (codec não suportado)');
    let thumb = '';
    try {
      el.currentTime = Math.min(0.5, dur / 2);
      await once(el, 'seeked', 6000);
      thumb = thumbFrom(el, w, h);
    } catch { /* sem miniatura */ }
    return { dur, w, h, thumb };
  } finally {
    URL.revokeObjectURL(url);
    try { el.removeAttribute('src'); el.load(); } catch {}
  }
}

// Importa arquivos em fila (um por vez: poupa memória e decodificadores)
export async function importFiles(files, store, onProgress) {
  const out = []; const errors = [];
  const list = Array.from(files);
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const kind = kindOf(f);
    if (onProgress) onProgress(i, list.length, f.name);
    if (!kind) { errors.push(`${f.name}: tipo de arquivo não reconhecido`); continue; }
    try {
      const meta = await probe(f, kind);
      // Copia o arquivo para a memória: no Android o seletor devolve um "File" que pode ficar inválido (InvalidBlob)
      let blob = f;
      if (f.size <= 250 * 1048576) { try { blob = new Blob([await f.arrayBuffer()], { type: f.type || ({ video: 'video/mp4', image: 'image/jpeg', audio: 'audio/mpeg' })[kind] }); } catch { blob = f; } }
      const rec = { id: uid(), projectId: store.p.id, name: f.name, kind, type: f.type || '', blob, size: f.size, added: Date.now(), ...meta };
      await storage.putMedia(rec);
      rec.url = URL.createObjectURL(rec.blob);
      store.media.set(rec.id, rec);
      out.push(rec);
    } catch (e) {
      const quota = e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)));
      errors.push(`${f.name}: ${quota ? 'sem espaço de armazenamento no aparelho' : (e.message || 'erro ao importar')}`);
    }
  }
  if (onProgress) onProgress(list.length, list.length, '');
  return { media: out, errors };
}

export function clipFromMedia(m, lane, start) {
  const base = { lane, mediaId: m.id, start, dur: m.dur };
  if (m.kind === 'audio') return makeClip({ ...base, lane: 3, type: 'audio' });
  const c = makeClip({ ...base, type: m.kind });
  if (lane === 1) { c.scale = 0.5; c.fit = 'contain'; }
  return c;
}

export function textClip(start) {
  return makeClip({ lane: 2, type: 'text', start, dur: 3, text: defaultText(), y: 0.28, animIn: 'fade', animDur: 0.4 });
}

export async function loadProjectMedia(project) {
  const ids = new Set(project.clips.map((c) => c.mediaId).filter(Boolean));
  if (project.bgMedia) ids.add(project.bgMedia);
  const map = new Map();
  for (const id of ids) {
    const rec = await storage.getMedia(id);
    if (rec && rec.blob) { rec.url = URL.createObjectURL(rec.blob); map.set(id, rec); }
  }
  return map;
}

export function freeMedia(map) {
  for (const m of map.values()) { try { URL.revokeObjectURL(m.url); } catch {} }
}
