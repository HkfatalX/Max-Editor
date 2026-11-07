// Max Editor — motor de reprodução e renderização (canvas 2D, leve para aparelhos fracos)
import { parseRatio, PREVIEW_LONG, deviceTier } from './config.js';
import { evalKf } from './state.js';

export const FONTS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
  display: 'Impact, "Arial Black", Haettenschweiler, sans-serif',
  hand: '"Comic Sans MS", "Segoe Print", cursive',
};
export const FONT_NAMES = { sans: 'Padrão', serif: 'Serifada', mono: 'Código', display: 'Impacto', hand: 'Manuscrita' };

export const FILTERS = [
  { id: 'none', name: 'Original', css: '', sw: '#8b93a7' },
  { id: 'vivid', name: 'Vívido', css: 'saturate(1.35) contrast(1.08)', sw: '#ff4d8d' },
  { id: 'pop', name: 'Pop', css: 'saturate(2) contrast(1.1)', sw: '#ff2bd6' },
  { id: 'warm', name: 'Quente', css: 'sepia(.25) saturate(1.2) hue-rotate(-10deg)', sw: '#ffa24d' },
  { id: 'golden', name: 'Dourado', css: 'sepia(.4) saturate(1.4) brightness(1.08)', sw: '#ffc94d' },
  { id: 'sunset', name: 'Pôr do sol', css: 'sepia(.3) saturate(1.5) hue-rotate(-20deg)', sw: '#ff7a45' },
  { id: 'cool', name: 'Frio', css: 'saturate(1.1) hue-rotate(15deg) brightness(1.02)', sw: '#4db8ff' },
  { id: 'mint', name: 'Menta', css: 'hue-rotate(60deg) saturate(1.2) brightness(1.05)', sw: '#3ddc84' },
  { id: 'cyber', name: 'Cyber', css: 'hue-rotate(180deg) saturate(1.6) contrast(1.2)', sw: '#2ec4ff' },
  { id: 'neon', name: 'Neon', css: 'saturate(1.8) contrast(1.2) hue-rotate(20deg)', sw: '#b14dff' },
  { id: 'bw', name: 'P&B', css: 'grayscale(1) contrast(1.1)', sw: '#d0d0d0' },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.6) brightness(.8)', sw: '#555' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(.55) contrast(.95) brightness(1.05)', sw: '#c9a26b' },
  { id: 'fade', name: 'Fosco', css: 'contrast(.85) brightness(1.1) saturate(.85)', sw: '#b8c4d6' },
  { id: 'pastel', name: 'Pastel', css: 'saturate(.7) brightness(1.15) contrast(.9)', sw: '#ffc7e0' },
  { id: 'drama', name: 'Drama', css: 'contrast(1.35) saturate(.8) brightness(.92)', sw: '#6b6bff' },
  { id: 'moody', name: 'Sombrio', css: 'contrast(1.25) saturate(.7) brightness(.85) hue-rotate(-8deg)', sw: '#3a3f6b' },
  { id: 'cine', name: 'Cinema', css: 'contrast(1.15) saturate(.9) hue-rotate(-6deg) brightness(.96)', sw: '#2fb5a6' },
];
export const ANIMS_IN = [['none', 'Nenhuma'], ['fade', 'Aparecer'], ['zoom', 'Zoom'], ['pop', 'Pop'], ['slam', 'Impacto'], ['spin', 'Girar'], ['drop', 'Cair'], ['left', 'Da esquerda'], ['right', 'Da direita'], ['up', 'Subir']];
export const ANIMS_OUT = [['none', 'Nenhuma'], ['fade', 'Sumir'], ['zoom', 'Zoom'], ['spin', 'Girar'], ['left', 'Para esquerda'], ['right', 'Para direita'], ['down', 'Descer']];
export const LOOPS = [['none', 'Nenhuma'], ['zoomin', 'Zoom lento +'], ['zoomout', 'Zoom lento −'], ['pulse', 'Pulsar'], ['float', 'Flutuar'], ['sway', 'Balançar'], ['spin', 'Girar']];
export const TRANSITIONS = [['none', 'Corte seco'], ['fade', 'Escurecer'], ['white', 'Flash'], ['slideL', 'Deslizar ←'], ['slideR', 'Deslizar →'], ['slideU', 'Subir'], ['zoom', 'Zoom'], ['spin', 'Girar'], ['wipe', 'Revelar']];
export const BLENDS = [['normal', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Tela'], ['overlay', 'Sobrepor'], ['lighten', 'Clarear'], ['darken', 'Escurecer'], ['color-dodge', 'Subexpor'], ['difference', 'Diferença'], ['hard-light', 'Luz forte'], ['soft-light', 'Luz suave']];
export const MASKS = [['none', 'Nenhuma'], ['circle', 'Círculo'], ['oval', 'Oval'], ['rounded', 'Arredondado'], ['heart', 'Coração'], ['star', 'Estrela'], ['diamond', 'Losango'], ['triangle', 'Triângulo'], ['hex', 'Hexágono']];

const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

// p: 0 (início/fim) → 1 (estado normal)
function animState(kind, p) {
  const e = ease(p);
  const r = { a: 1, s: 1, dx: 0, dy: 0, rot: 0 };
  switch (kind) {
    case 'fade': r.a = e; break;
    case 'zoom': r.s = 0.5 + 0.5 * e; r.a = e; break;
    case 'pop': {
      const c1 = 1.70158, c3 = c1 + 1, q = Math.min(1, Math.max(0, p));
      r.s = Math.max(0, 1 + c3 * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2));
      r.a = Math.min(1, q * 3); break;
    }
    case 'slam': r.s = 2 - e; r.a = Math.min(1, p * 2); break;
    case 'spin': r.rot = -(1 - e) * 180; r.s = 0.4 + 0.6 * e; r.a = e; break;
    case 'drop': r.dy = -(1 - e) * 0.35; r.a = e; break;
    case 'left': r.dx = -(1 - e) * 0.6; r.a = e; break;
    case 'right': r.dx = (1 - e) * 0.6; r.a = e; break;
    case 'up': case 'down': r.dy = (1 - e) * 0.25; r.a = e; break;
  }
  return r;
}

// s: 1 na emenda → 0 longe dela. isIn: clipe que entra (true) ou que sai (false)
function applyTrans(kind, s, isIn, r) {
  switch (kind) {
    case 'fade': r.a *= 1 - s; break;
    case 'slideL': r.dx += isIn ? s : -s; break;
    case 'slideR': r.dx += isIn ? -s : s; break;
    case 'slideU': r.dy += isIn ? s : -s; break;
    case 'zoom': r.s *= isIn ? 1 - 0.5 * s : 1 + 0.6 * s; r.a *= 1 - s * 0.9; break;
    case 'spin': r.rot += (isIn ? -1 : 1) * 120 * s; r.s *= 1 - 0.5 * s; r.a *= 1 - s; break;
    case 'wipe': if (isIn) r.wipe = 1 - s; break;
  }
}

function filterCss(c, H) {
  const f = FILTERS.find((x) => x.id === c.filter);
  const parts = [];
  if (f && f.css) parts.push(f.css);
  const a = c.adj || {};
  if (a.b) parts.push(`brightness(${(1 + a.b / 100).toFixed(3)})`);
  if (a.c) parts.push(`contrast(${(1 + a.c / 100).toFixed(3)})`);
  if (a.s) parts.push(`saturate(${(1 + a.s / 100).toFixed(3)})`);
  if (a.h) parts.push(`hue-rotate(${Math.round(a.h * 1.8)}deg)`);
  if (c.fx && c.fx.blur > 0) parts.push(`blur(${(c.fx.blur * 10 * (H / 720)).toFixed(1)}px)`);
  return parts.join(' ');
}

function wrapLines(ctx, str, maxW) {
  const out = [];
  for (const para of String(str).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + ' ' + words[i];
      if (ctx.measureText(test).width <= maxW) line = test;
      else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}

function rrect(ctx, x, y, w, h, r, begin = true) {
  r = Math.min(r, w / 2, h / 2);
  if (begin) ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function maskPath(ctx, kind, w, h, rr) {
  const hw = w / 2, hh = h / 2, m = Math.min(w, h);
  ctx.beginPath();
  switch (kind) {
    case 'circle': ctx.arc(0, 0, m / 2, 0, Math.PI * 2); break;
    case 'oval': ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2); break;
    case 'rounded': rrect(ctx, -hw, -hh, w, h, m * rr, false); break;
    case 'diamond': ctx.moveTo(0, -hh); ctx.lineTo(hw, 0); ctx.lineTo(0, hh); ctx.lineTo(-hw, 0); break;
    case 'triangle': ctx.moveTo(0, -hh); ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh); break;
    case 'hex': for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; const x = hw * Math.cos(a), y = hh * Math.sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } break;
    case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? 0.45 : 1; const x = hw * k * Math.cos(a), y = hh * k * Math.sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } break;
    case 'heart':
      ctx.moveTo(0, hh);
      ctx.bezierCurveTo(-hw * 1.2, hh * 0.1, -hw * 0.9, -hh * 0.95, 0, -hh * 0.35);
      ctx.bezierCurveTo(hw * 0.9, -hh * 0.95, hw * 1.2, hh * 0.1, 0, hh);
      break;
    default: ctx.rect(-hw, -hh, w, h);
  }
  ctx.closePath();
}

function hexRgb(h) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 255, 0];
}

// Pequeno conjunto de elementos <video>/<audio> reutilizados (limita decodificadores em aparelhos fracos)
class Pool {
  constructor(engine, kind, size) { this.e = engine; this.kind = kind; this.size = size; this.items = []; }
  make() {
    const el = document.createElement(this.kind);
    el.preload = 'auto'; el.setAttribute('playsinline', ''); el.playsInline = true;
    const it = { el, clipId: null, mediaId: null, srcNode: null, gain: null, seeking: false, lastWant: null };
    el.addEventListener('seeked', () => { it.seeking = false; this.e.requestRender(); });
    el.addEventListener('loadeddata', () => this.e.requestRender());
    el.addEventListener('error', () => { it.failed = true; });
    this.items.push(it);
    if (this.e.actx) this.wire(it);
    return it;
  }
  wire(it) {
    if (it.srcNode || !this.e.actx) return;
    try {
      it.srcNode = this.e.actx.createMediaElementSource(it.el);
      it.gain = this.e.actx.createGain();
      it.srcNode.connect(it.gain); it.gain.connect(this.e.master);
    } catch { /* sem áudio WebAudio: usa volume nativo */ }
  }
  acquire(clip, media, needed) {
    let it = this.items.find((i) => i.clipId === clip.id);
    if (!it) {
      it = this.items.find((i) => !i.clipId);
      if (!it && this.items.length < this.size) it = this.make();
      if (!it) it = this.items.find((i) => !needed.has(i.clipId));
      if (!it) return null;
      it.clipId = clip.id; it.lastWant = null; it.seeking = false; it.failed = false;
      if (it.mediaId !== clip.mediaId) { it.mediaId = clip.mediaId; it.el.src = media.url; }
    }
    return it;
  }
  releaseUnused(needed) {
    for (const it of this.items) {
      if (it.clipId && !needed.has(it.clipId)) {
        try { it.el.pause(); } catch {}
        it.clipId = null; it.lastWant = null;
        if (it.gain) it.gain.gain.value = 0;
      }
    }
  }
  find(clipId) { return this.items.find((i) => i.clipId === clipId); }
  dispose() {
    for (const it of this.items) {
      try { it.el.pause(); it.el.removeAttribute('src'); it.el.load(); } catch {}
      it.clipId = null; it.mediaId = null; it.lastWant = null;
    }
  }
}

export class Engine {
  constructor(store) {
    this.store = store;
    this.canvas = null; this.ctx = null; this.W = 2; this.H = 2;
    this.time = 0; this.playing = false; this.exporting = false;
    this.tier = deviceTier();
    this.quality = 1; this.maxLong = PREVIEW_LONG[this.tier];
    this.vpool = new Pool(this, 'video', 3);
    this.apool = new Pool(this, 'audio', 2);
    this.images = new Map(); this.imgLoading = new Set();
    this.raf = 0; this.need = true; this.base = 0; this.t0 = 0;
    this.ls = {}; this.costs = []; this.bounds = new Map();
    this.main = []; this.mainIdx = new Map();
    this.actx = null; this.master = null; this.monitor = null; this.exportDest = null;
    this.kc = null; this.kx = null; this.bgc = null; this.grain = null;
    this.filterOK = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
    this.tick = this.tick.bind(this);
    store.timeFn = () => this.time;
  }
  on(ev, fn) { (this.ls[ev] || (this.ls[ev] = new Set())).add(fn); return () => this.ls[ev].delete(fn); }
  emit(ev, a) { if (this.ls[ev]) this.ls[ev].forEach((fn) => fn(a)); }

  // ---------- canvas / tamanho ----------
  attach(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.resize(); }
  dims(long) {
    const { w, h } = parseRatio(this.store.p ? this.store.p.ratio : '9:16');
    let W, H;
    if (w >= h) { W = long; H = Math.round(long * h / w); } else { H = long; W = Math.round(long * w / h); }
    return { W: Math.max(2, W & ~1), H: Math.max(2, H & ~1) };
  }
  resize() {
    if (!this.canvas || !this.store.p) return;
    const { W, H } = this.dims(Math.round(this.maxLong * this.quality));
    if (W !== this.W || H !== this.H || this.canvas.width !== W) {
      this.W = W; this.H = H; this.canvas.width = W; this.canvas.height = H;
    }
    this.requestRender();
  }
  degrade() {
    if (this.quality <= 0.55) return false;
    this.quality = Math.max(0.55, this.quality - 0.15);
    this.resize(); this.costs = [];
    this.emit('degrade', this.quality);
    return true;
  }

  // ---------- áudio ----------
  ensureAudio() {
    if (!this.actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.actx = new AC();
        this.master = this.actx.createGain();
        this.monitor = this.actx.createGain();
        this.exportDest = this.actx.createMediaStreamDestination();
        this.master.connect(this.monitor); this.monitor.connect(this.actx.destination);
        this.master.connect(this.exportDest);
        [...this.vpool.items].forEach((i) => this.vpool.wire(i));
        [...this.apool.items].forEach((i) => this.apool.wire(i));
      } catch { this.actx = null; }
    }
    if (this.actx && this.actx.state === 'suspended') this.actx.resume().catch(() => {});
  }
  setVol(it, v) {
    v = Math.max(0, v);
    if (it.gain) { try { it.gain.gain.setTargetAtTime(v, this.actx.currentTime, 0.012); } catch { it.gain.gain.value = v; } }
    else it.el.volume = Math.min(1, v);
  }
  clipVolume(c, t) {
    const local = t - c.start;
    let f = 1;
    if (c.fadeIn > 0 && local < c.fadeIn) f = Math.max(0, local / c.fadeIn);
    if (c.fadeOut > 0 && c.dur - local < c.fadeOut) f = Math.min(f, Math.max(0, (c.dur - local) / c.fadeOut));
    return c.vol * f;
  }

  // ---------- reprodução ----------
  play() {
    if (this.playing || this.exporting) return;
    const dur = this.store.duration();
    if (dur <= 0) return;
    if (this.time >= dur - 0.05) this.time = 0;
    this.ensureAudio();
    this.t0 = this.time; this.base = performance.now(); this.playing = true;
    this.emit('state'); this.requestRender();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.emit('state'); this.requestRender();
    for (const p of [this.vpool, this.apool]) for (const it of p.items) it.lastWant = null;
  }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(t) {
    const dur = this.store.duration();
    this.time = Math.min(Math.max(0, t), dur);
    if (this.playing) { this.t0 = this.time; this.base = performance.now(); }
    this.emit('time', this.time);
    this.requestRender();
  }
  requestRender() { this.need = true; if (!this.raf && !this.exporting) this.raf = requestAnimationFrame(this.tick); }

  tick() {
    this.raf = 0;
    if (this.exporting || !this.store.p || !this.ctx) return;
    if (this.playing) {
      const dur = this.store.duration();
      let t = this.t0 + (performance.now() - this.base) / 1000;
      if (t >= dur) { t = dur; this.time = t; this.playing = false; this.emit('state'); }
      this.time = t; this.emit('time', t);
    }
    if (this.playing || this.need) {
      this.need = false;
      const c0 = performance.now();
      this.sync(this.time, this.playing);
      this.draw(this.ctx, this.W, this.H, this.time, { overlay: !this.playing });
      if (this.playing) {
        this.costs.push(performance.now() - c0);
        if (this.costs.length >= 30) {
          const avg = this.costs.reduce((a, b) => a + b, 0) / this.costs.length;
          this.costs = [];
          if (avg > 30) this.degrade();
        }
      }
    }
    if (this.playing) this.raf = requestAnimationFrame(this.tick);
  }

  // Posiciona/toca os elementos de mídia de acordo com o tempo t
  sync(t, playing) {
    const p = this.store.p, media = this.store.media;
    const needed = new Set(); const list = [];
    for (const c of p.clips) {
      if (c.type !== 'video' && c.type !== 'audio') continue;
      const m = media.get(c.mediaId);
      if (!m) continue;
      const active = t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6;
      const soon = !active && c.start > t && c.start - t < 1.5;
      if (active || soon) {
        needed.add(c.id);
        list.push({ c, m, active, pool: c.type === 'video' ? this.vpool : this.apool });
      }
    }
    for (const a of list) a.it = a.pool.acquire(a.c, a.m, needed);
    this.vpool.releaseUnused(needed); this.apool.releaseUnused(needed);
    for (const { c, m, it, active } of list) {
      if (!it) continue;
      const el = it.el;
      let want = c.in + (active ? (t - c.start) : 0) * c.speed;
      want = Math.max(0, Math.min(want, Math.max(0, (m.dur || 0) - 0.04)));
      try { if (el.playbackRate !== c.speed) el.playbackRate = c.speed; } catch {}
      if (active && playing) {
        if (el.paused) {
          if (Math.abs(el.currentTime - want) > 0.05) el.currentTime = want;
          const pr = el.play(); if (pr && pr.catch) pr.catch(() => {});
        } else if (Math.abs(el.currentTime - want) > 0.35) el.currentTime = want;
        it.lastWant = null;
      } else {
        if (!el.paused) el.pause();
        if (it.lastWant === null || Math.abs(want - it.lastWant) > 0.02) {
          try { el.currentTime = want; it.seeking = true; } catch {}
          it.lastWant = want;
        }
      }
      this.setVol(it, active ? this.clipVolume(c, t) : 0);
    }
  }

  // Espera os elementos necessários em t estarem com quadro pronto (usado antes de exportar)
  async prime(t, timeout = 2500) {
    this.sync(t, false);
    const t0 = performance.now();
    while (performance.now() - t0 < timeout) {
      const bad = [this.vpool, this.apool].some((pl) => pl.items.some((i) => i.clipId && !i.failed && (i.el.readyState < 2 || i.seeking)));
      if (!bad) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // ---------- desenho ----------
  loadImage(id) {
    if (this.imgLoading.has(id) || this.images.has(id)) return;
    const m = this.store.media.get(id);
    if (!m) return;
    this.imgLoading.add(id);
    (async () => {
      try {
        let bmp = await createImageBitmap(m.blob);
        const MAX = 2048, big = Math.max(bmp.width, bmp.height);
        if (big > MAX) {
          const s = MAX / big;
          try {
            const b2 = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * s), resizeHeight: Math.round(bmp.height * s), resizeQuality: 'medium' });
            bmp.close(); bmp = b2;
          } catch { /* mantém original */ }
        }
        this.images.set(id, bmp);
      } catch (e) { console.warn('imagem', e); }
      this.imgLoading.delete(id);
      this.requestRender();
    })();
  }

  srcOf(c) {
    if (c.type === 'video') {
      const it = this.vpool.find(c.id);
      if (!it || it.el.readyState < 2 || !it.el.videoWidth) return null;
      return { src: it.el, sw: it.el.videoWidth, sh: it.el.videoHeight };
    }
    const bmp = this.images.get(c.mediaId);
    if (!bmp) { this.loadImage(c.mediaId); return null; }
    return { src: bmp, sw: bmp.width, sh: bmp.height };
  }

  // Animações de entrada/saída + loop + efeitos + transições, combinados no instante t
  animAll(c, t) {
    const r = { a: 1, s: 1, dx: 0, dy: 0, rot: 0, wipe: 1 };
    const local = t - c.start, rem = c.dur - local;
    const add = (s) => { r.s *= s.s; r.a *= s.a; r.dx += s.dx; r.dy += s.dy; r.rot += s.rot; };
    if (c.animIn !== 'none' && local < c.animDur) add(animState(c.animIn, local / c.animDur));
    if (c.animOut !== 'none' && rem < c.animDur) add(animState(c.animOut, rem / c.animDur));
    const lt = Math.max(0, local), k = Math.min(1, lt / Math.max(0.1, c.dur));
    switch (c.loop) {
      case 'zoomin': r.s *= 1 + 0.15 * k; break;
      case 'zoomout': r.s *= 1.15 - 0.15 * k; break;
      case 'pulse': r.s *= 1 + 0.05 * Math.sin(lt * 6); break;
      case 'float': r.dy += Math.sin(lt * 2.2) * 0.015; break;
      case 'sway': r.rot += Math.sin(lt * 2.5) * 4; break;
      case 'spin': r.rot += (lt * 90) % 360; break;
    }
    const fx = c.fx;
    if (fx) {
      if (fx.shake > 0) { r.dx += Math.sin(t * 53) * 0.012 * fx.shake; r.dy += Math.cos(t * 61) * 0.012 * fx.shake; r.rot += Math.sin(t * 47) * 1.5 * fx.shake; }
      if (fx.pulse > 0) r.s *= 1 + 0.07 * fx.pulse * Math.sin(t * 9);
    }
    const idx = this.mainIdx.get(c.id);
    if (idx !== undefined) {
      const prev = this.main[idx - 1], next = this.main[idx + 1];
      if (prev && c.trans !== 'none') {
        const half = Math.max(0.05, Math.min(c.transDur, c.dur, prev.dur) / 2);
        if (local < half) applyTrans(c.trans, 1 - ease(local / half), true, r);
      }
      if (next && next.trans !== 'none') {
        const half = Math.max(0.05, Math.min(next.transDur, next.dur, c.dur) / 2);
        if (rem < half) applyTrans(next.trans, 1 - ease(rem / half), false, r);
      }
    }
    return r;
  }

  place(c, W, H, sw, sh, t) {
    const base = c.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
    const an = this.animAll(c, t), k = evalKf(c, t - c.start), sc = k.scale * an.s;
    return { cx: W / 2 + (k.x + an.dx) * W, cy: H / 2 + (k.y + an.dy) * H, w: sw * base * sc, h: sh * base * sc, rot: k.rot + an.rot, a: k.opacity * an.a, wipe: an.wipe };
  }

  // Chroma key (fundo verde): processa uma cópia pequena do quadro para ficar leve
  keyed(src, pl, ch) {
    const lim = this.exporting ? 720 : 480;
    const sc = Math.min(1, lim / Math.max(pl.w, pl.h, 1));
    const w = Math.max(2, Math.round(pl.w * sc)), h = Math.max(2, Math.round(pl.h * sc));
    if (!this.kc) { this.kc = document.createElement('canvas'); this.kx = this.kc.getContext('2d', { willReadFrequently: true }); }
    if (this.kc.width !== w || this.kc.height !== h) { this.kc.width = w; this.kc.height = h; }
    this.kx.clearRect(0, 0, w, h); this.kx.drawImage(src, 0, 0, w, h);
    const img = this.kx.getImageData(0, 0, w, h), d = img.data;
    const [kr, kg, kb] = hexRgb(ch.color);
    const t1 = ch.tol * 441, t2 = (ch.tol + ch.soft) * 441, t1s = t1 * t1, t2s = t2 * t2, span = Math.max(1, t2 - t1);
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb, ds = dr * dr + dg * dg + db * db;
      if (ds <= t1s) d[i + 3] = 0;
      else if (ds < t2s) {
        const f = (Math.sqrt(ds) - t1) / span; d[i + 3] = d[i + 3] * f;
        if (kg > kr && kg > kb && d[i + 1] > d[i] && d[i + 1] > d[i + 2]) d[i + 1] = (d[i] + d[i + 2]) / 2; // tira o verde das bordas
      }
    }
    this.kx.putImageData(img, 0, 0);
    return this.kc;
  }

  grainPattern(ctx) {
    if (!this.grain) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'), im = x.createImageData(128, 128);
      for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0); this.grain = c;
    }
    return ctx.createPattern(this.grain, 'repeat');
  }

  drawMedia(ctx, W, H, c, t) {
    const s = this.srcOf(c);
    if (!s) return;
    const pl = this.place(c, W, H, s.sw, s.sh, t);
    this.bounds.set(c.id, pl);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, pl.a));
    if (c.blend && c.blend !== 'normal') ctx.globalCompositeOperation = c.blend;
    ctx.imageSmoothingQuality = this.exporting ? 'high' : 'low';
    ctx.translate(pl.cx, pl.cy);
    if (pl.rot) ctx.rotate(pl.rot * Math.PI / 180);
    if (pl.wipe < 1) { ctx.beginPath(); ctx.rect(-pl.w / 2, -pl.h / 2, pl.w * pl.wipe, pl.h); ctx.clip(); }
    if (c.mask && c.mask !== 'none') { maskPath(ctx, c.mask, pl.w, pl.h, c.radius); ctx.clip(); }
    if (c.flip) ctx.scale(-1, 1);
    if (this.filterOK) { const f = filterCss(c, H); if (f) ctx.filter = f; }
    const src = c.chroma && c.chroma.on ? this.keyed(s.src, pl, c.chroma) : s.src;
    ctx.drawImage(src, -pl.w / 2, -pl.h / 2, pl.w, pl.h);
    ctx.filter = 'none';
    const fx = c.fx;
    if (fx && fx.vig > 0) {
      const g = ctx.createRadialGradient(0, 0, Math.min(pl.w, pl.h) * 0.25, 0, 0, Math.max(pl.w, pl.h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.9 * fx.vig})`);
      ctx.fillStyle = g; ctx.fillRect(-pl.w / 2, -pl.h / 2, pl.w, pl.h);
    }
    if (fx && fx.grain > 0) {
      ctx.save(); ctx.globalAlpha *= 0.35 * fx.grain; ctx.globalCompositeOperation = 'overlay';
      ctx.translate(-pl.w / 2 + ((Math.floor(t * 24) * 37) % 128), -pl.h / 2 + ((Math.floor(t * 24) * 61) % 128));
      ctx.fillStyle = this.grainPattern(ctx); ctx.fillRect(-128, -128, pl.w + 256, pl.h + 256);
      ctx.restore();
    }
    ctx.restore();
  }

  drawText(ctx, W, H, c, t) {
    const s = c.text, fs = Math.max(4, s.size * H);
    ctx.save();
    ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? '700' : '400'} ${fs}px ${FONTS[s.font] || FONTS.sans}`;
    ctx.textBaseline = 'middle';
    const str = s.upper ? String(s.str || ' ').toUpperCase() : String(s.str || ' ');
    const lines = wrapLines(ctx, str, W * 0.9);
    const lh = fs * 1.18;
    let bw = 0; for (const l of lines) bw = Math.max(bw, ctx.measureText(l).width);
    const bh = lines.length * lh, pad = fs * 0.3;
    const an = this.animAll(c, t), k0 = evalKf(c, t - c.start), k = k0.scale * an.s;
    const cx = W / 2 + (k0.x + an.dx) * W, cy = H / 2 + (k0.y + an.dy) * H, rot = k0.rot + an.rot;
    const w = bw + pad * 2, h = bh + pad;
    this.bounds.set(c.id, { cx, cy, w: w * k, h: h * k, rot });
    ctx.globalAlpha = Math.max(0, Math.min(1, k0.opacity * an.a));
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot * Math.PI / 180);
    ctx.scale(k, k);
    if (s.bg) { ctx.fillStyle = s.bg; rrect(ctx, -w / 2, -h / 2, w, h, fs * 0.25); ctx.fill(); }
    ctx.textAlign = s.align === 'left' ? 'left' : s.align === 'right' ? 'right' : 'center';
    const tx = s.align === 'left' ? -bw / 2 : s.align === 'right' ? bw / 2 : 0;
    ctx.lineJoin = 'round';
    let total = lines.reduce((n, l) => n + l.length, 0), shown = total;
    if (s.typing) shown = Math.floor(total * Math.min(1, Math.max(0, (t - c.start) / Math.max(0.4, Math.min(c.dur * 0.7, total * 0.07)))));
    let used = 0;
    lines.forEach((l, i) => {
      const y = -bh / 2 + lh * (i + 0.5);
      const part = l.slice(0, Math.max(0, shown - used)); used += l.length;
      if (!part) return;
      if (s.strokeW > 0 && s.stroke) { ctx.lineWidth = fs * s.strokeW; ctx.strokeStyle = s.stroke; ctx.strokeText(part, tx, y); }
      ctx.fillStyle = s.color;
      if (s.glow > 0) { ctx.shadowColor = s.glowColor; ctx.shadowBlur = fs * 0.7 * s.glow; ctx.fillText(part, tx, y); ctx.fillText(part, tx, y); }
      else if (s.shadow > 0) { ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = fs * 0.3 * s.shadow; ctx.shadowOffsetY = fs * 0.07 * s.shadow; ctx.fillText(part, tx, y); }
      else ctx.fillText(part, tx, y);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    });
    ctx.restore();
  }

  drawTransitions(ctx, W, H, t) {
    for (let i = 1; i < this.main.length; i++) {
      const c = this.main[i];
      if (c.trans !== 'white') continue;
      const half = Math.max(0.05, Math.min(c.transDur, c.dur, this.main[i - 1].dur) / 2), x = Math.abs(t - c.start);
      if (x < half) { ctx.globalAlpha = 0.95 * (1 - x / half); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    }
  }

  // Fundo desfocado: o próprio vídeo ampliado e borrado (barato: desenha em miniatura e estica)
  drawBlurBg(ctx, W, H, act) {
    const m = this.main.find(act);
    const s = m && this.srcOf(m);
    if (!s) return;
    const tw = Math.max(8, Math.round(W / 14)), th = Math.max(8, Math.round(H / 14));
    if (!this.bgc) this.bgc = document.createElement('canvas');
    if (this.bgc.width !== tw || this.bgc.height !== th) { this.bgc.width = tw; this.bgc.height = th; }
    const x = this.bgc.getContext('2d'), k = Math.max(tw / s.sw, th / s.sh);
    x.drawImage(s.src, (tw - s.sw * k) / 2, (th - s.sh * k) / 2, s.sw * k, s.sh * k);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.bgc, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0, 0, W, H);
  }

  draw(ctx, W, H, t, opts = {}) {
    const p = this.store.p;
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    this.main = this.store.lane(0); this.mainIdx = new Map(this.main.map((c, i) => [c.id, i]));
    const act = (c) => t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6;
    this.bounds.clear();
    if (p.bgMode === 'blur') this.drawBlurBg(ctx, W, H, act);
    const vis = p.clips.filter((c) => (c.lane === 0 || c.lane === 1) && (c.type === 'video' || c.type === 'image') && act(c))
      .sort((a, b) => a.lane - b.lane || a.start - b.start);
    for (const c of vis) this.drawMedia(ctx, W, H, c, t);
    this.drawTransitions(ctx, W, H, t);
    for (const c of p.clips) if (c.type === 'text' && act(c)) this.drawText(ctx, W, H, c, t);
    if (opts.overlay) this.drawSelection(ctx);
    ctx.restore();
  }

  drawSelection(ctx) {
    const c = this.store.selected();
    if (!c) return;
    const b = this.bounds.get(c.id);
    if (!b) return;
    ctx.save();
    ctx.translate(b.cx, b.cy); if (b.rot) ctx.rotate(b.rot * Math.PI / 180);
    const lw = Math.max(1.5, this.W / 300);
    ctx.lineWidth = lw; ctx.strokeStyle = '#8f6bff';
    ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.fillStyle = '#fff';
    const s = lw * 3;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ctx.fillRect(x * b.w / 2 - s, y * b.h / 2 - s, s * 2, s * 2);
    ctx.restore();
  }

  // Clipe visível mais acima no ponto (px do canvas)
  hit(x, y) {
    const t = this.time, p = this.store.p;
    const act = (c) => t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6;
    const order = p.clips.filter((c) => c.lane <= 2 && c.type !== 'audio' && act(c))
      .sort((a, b) => b.lane - a.lane || b.start - a.start);
    for (const c of order) {
      const b = this.bounds.get(c.id);
      if (!b) continue;
      const dx = x - b.cx, dy = y - b.cy, r = -(b.rot || 0) * Math.PI / 180;
      const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return c;
    }
    return null;
  }

  dispose() {
    this.pause(); this.vpool.dispose(); this.apool.dispose();
    for (const b of this.images.values()) { try { b.close(); } catch {} }
    this.images.clear(); this.imgLoading.clear(); this.bounds.clear();
    this.time = 0; this.quality = 1;
  }
}
