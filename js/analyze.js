// Max Editor — análise de áudio (forma de onda, batidas, silêncios). Tudo local, sem enviar nada.
const cache = new Map(); // mediaId → { env: Float32Array (1 valor / 20 ms), wave: number[] (1 valor / 50 ms) } | null
const STEP = 0.02;
const MAX_BYTES = 120 * 1048576;

export async function analyze(m) {
  if (!m || !m.blob) return null;
  if (cache.has(m.id)) return cache.get(m.id);
  let out = null;
  try {
    if (m.blob.size > MAX_BYTES) throw new Error('grande');
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const buf = await ctx.decodeAudioData(await m.blob.arrayBuffer());
    try { ctx.close(); } catch {}
    const ch = buf.getChannelData(0), sr = buf.sampleRate, win = Math.max(1, Math.floor(sr * STEP));
    const n = Math.floor(ch.length / win), env = new Float32Array(n);
    let mx = 1e-6;
    for (let i = 0; i < n; i++) {
      let s = 0; const o = i * win;
      for (let j = 0; j < win; j += 2) { const v = ch[o + j]; s += v * v; }
      env[i] = Math.sqrt(s / (win / 2)); if (env[i] > mx) mx = env[i];
    }
    for (let i = 0; i < n; i++) env[i] /= mx;
    const per = Math.round(0.05 / STEP), wave = [];
    for (let i = 0; i < n; i += per) { let p = 0; for (let j = i; j < Math.min(n, i + per); j++) if (env[j] > p) p = env[j]; wave.push(Math.round(p * 100) / 100); }
    out = { env, wave };
  } catch { out = null; }
  cache.set(m.id, out);
  return out;
}
export const cached = (id) => cache.get(id) || null;
export function forget(id) { cache.delete(id); }

// batidas: picos de energia (tempo em segundos da mídia)
export function beats(env, minGap = 0.3) {
  const n = env.length, d = new Float32Array(n);
  for (let i = 1; i < n; i++) d[i] = Math.max(0, env[i] - env[i - 1]);
  const w = Math.round(1 / STEP), out = []; let last = -9;
  for (let i = 2; i < n - 1; i++) {
    const a = Math.max(0, i - w), b = Math.min(n, i + w); let mean = 0, sq = 0;
    for (let j = a; j < b; j++) { mean += d[j]; sq += d[j] * d[j]; }
    mean /= b - a; const sd = Math.sqrt(Math.max(0, sq / (b - a) - mean * mean));
    const thr = mean + 1.1 * sd + 0.02;
    if (d[i] > thr && d[i] >= d[i - 1] && d[i] >= d[i + 1] && i * STEP - last >= minGap) { out.push(+(i * STEP).toFixed(3)); last = i * STEP; }
  }
  return out;
}

// silêncios: trechos (segundos da mídia) abaixo do limite por pelo menos minLen
export function silences(env, thr = 0.04, minLen = 0.45, pad = 0.08) {
  const out = []; let s = -1;
  for (let i = 0; i <= env.length; i++) {
    const quiet = i < env.length && env[i] < thr;
    if (quiet && s < 0) s = i;
    if (!quiet && s >= 0) { const a = s * STEP + pad, b = i * STEP - pad; if (b - a >= minLen) out.push([+a.toFixed(3), +b.toFixed(3)]); s = -1; }
  }
  return out;
}

// barras da forma de onda como imagem SVG (data URL) para o fundo do clipe
export function waveSvg(wave, from, to) {
  const a = Math.max(0, Math.floor(from / 0.05)), b = Math.min(wave.length, Math.ceil(to / 0.05));
  const len = b - a; if (len < 1) return '';
  const cols = Math.min(len, 600), k = len / cols; let d = '';
  for (let i = 0; i < cols; i++) {
    let p = 0; for (let j = Math.floor(a + i * k); j < Math.floor(a + (i + 1) * k) + 1 && j < b; j++) if (wave[j] > p) p = wave[j];
    const h = Math.max(4, Math.round(p * 92)); d += `M${i + 0.5} ${50 - h / 2}v${h}`;
  }
  return 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${cols} 100' preserveAspectRatio='none'><path d='${d}' stroke='rgba(255,255,255,.75)' stroke-width='0.8' fill='none'/></svg>`) + '")';
}
