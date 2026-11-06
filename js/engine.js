// Max Editor — motor de reprodução e renderização (canvas 2D, leve para aparelhos fracos)
import { parseRatio, PREVIEW_LONG, deviceTier } from './config.js';

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
  { id: 'warm', name: 'Quente', css: 'sepia(.25) saturate(1.2) hue-rotate(-10deg)', sw: '#ffa24d' },
  { id: 'cool', name: 'Frio', css: 'saturate(1.1) hue-rotate(15deg) brightness(1.02)', sw: '#4db8ff' },
  { id: 'bw', name: 'P&B', css: 'grayscale(1) contrast(1.1)', sw: '#d0d0d0' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(.55) contrast(.95) brightness(1.05)', sw: '#c9a26b' },
  { id: 'drama', name: 'Drama', css: 'contrast(1.35) saturate(.8) brightness(.92)', sw: '#6b6bff' },
  { id: 'fade', name: 'Fosco', css: 'contrast(.85) brightness(1.1) saturate(.85)', sw: '#b8c4d6' },
  { id: 'cine', name: 'Cinema', css: 'contrast(1.15) saturate(.9) hue-rotate(-6deg) brightness(.96)', sw: '#2fb5a6' },
  { id: 'neon', name: 'Neon', css: 'saturate(1.8) contrast(1.2) hue-rotate(20deg)', sw: '#b14dff' },
];
export const ANIMS_IN = [['none', 'Nenhuma'], ['fade', 'Aparecer'], ['zoom', 'Zoom'], ['pop', 'Pop'], ['left', 'Da esquerda'], ['right', 'Da direita'], ['up', 'Subir']];
export const ANIMS_OUT = [['none', 'Nenhuma'], ['fade', 'Sumir'], ['zoom', 'Zoom'], ['left', 'Para esquerda'], ['right', 'Para direita'], ['down', 'Descer']];
export const TRANSITIONS = [['none', 'Corte seco'], ['fade', 'Escurecer'], ['white', 'Flash branco']];

const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

// p: 0 (início/fim) → 1 (estado normal)
function animState(kind, p) {
  const e = ease(p);
  const r = { a: 1, s: 1, dx: 0, dy: 0 };
  switch (kind) {
    case 'fade': r.a = e; break;
    case 'zoom': r.s = 0.5 + 0.5 * e; r.a = e; break;
    case 'pop': {
      const c1 = 1.70158, c3 = c1 + 1, q = Math.min(1, Math.max(0, p));
      r.s = Math.max(0, 1 + c3 * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2));
      r.a = Math.min(1, q * 3); break;
    }
    case 'left': r.dx = -(1 - e) * 0.6; r.a = e; break;
    case 'right': r.dx = (1 - e) * 0.6; r.a = e; break;
    case 'up': case 'down': r.dy = (1 - e) * 0.25; r.a = e; break;
  }
  return r;
}

function filterCss(c) {
  const f = FILTERS.find((x) => x.id === c.filter);
  const parts = [];
  if (f && f.css) parts.push(f.css);
  const a = c.adj || {};
  if (a.b) parts.push(`brightness(${(1 + a.b / 100).toFixed(3)})`);
  if (a.c) parts.push(`contrast(${(1 + a.c / 100).toFixed(3)})`);
  if (a.s) parts.push(`saturate(${(1 + a.s / 100).toFixed(3)})`);
  if (a.h) parts.push(`hue-rotate(${Math.round(a.h * 1.8)}deg)`);
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

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
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
    this.actx = null; this.master = null; this.monitor = null; this.exportDest = null;
    this.filterOK = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
    this.tick = this.tick.bind(this);
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

  // Combina animação de entrada e saída no instante t
  animAll(c, t) {
    const r = { a: 1, s: 1, dx: 0, dy: 0 };
    const local = t - c.start, rem = c.dur - local;
    if (c.animIn !== 'none' && local < c.animDur) { const s = animState(c.animIn, local / c.animDur); r.s *= s.s; r.a *= s.a; r.dx += s.dx; r.dy += s.dy; }
    if (c.animOut !== 'none' && rem < c.animDur) { const s = animState(c.animOut, rem / c.animDur); r.s *= s.s; r.a *= s.a; r.dx += s.dx; r.dy += s.dy; }
    return r;
  }

  place(c, W, H, sw, sh, t) {
    const base = c.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
    const an = this.animAll(c, t), sc = c.scale * an.s;
    return { cx: W / 2 + (c.x + an.dx) * W, cy: H / 2 + (c.y + an.dy) * H, w: sw * base * sc, h: sh * base * sc, rot: c.rot, a: c.opacity * an.a };
  }

  drawMedia(ctx, W, H, c, t) {
    let src = null, sw = 0, sh = 0;
    if (c.type === 'video') {
      const it = this.vpool.find(c.id);
      if (!it || it.el.readyState < 2 || !it.el.videoWidth) return;
      src = it.el; sw = it.el.videoWidth; sh = it.el.videoHeight;
    } else {
      const bmp = this.images.get(c.mediaId);
      if (!bmp) { this.loadImage(c.mediaId); return; }
      src = bmp; sw = bmp.width; sh = bmp.height;
    }
    const pl = this.place(c, W, H, sw, sh, t);
    this.bounds.set(c.id, pl);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, pl.a));
    ctx.translate(pl.cx, pl.cy);
    if (pl.rot) ctx.rotate(pl.rot * Math.PI / 180);
    if (c.flip) ctx.scale(-1, 1);
    if (this.filterOK) { const f = filterCss(c); if (f) ctx.filter = f; }
    ctx.drawImage(src, -pl.w / 2, -pl.h / 2, pl.w, pl.h);
    ctx.restore();
  }

  drawText(ctx, W, H, c, t) {
    const s = c.text, fs = Math.max(4, s.size * H);
    ctx.save();
    ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? '700' : '400'} ${fs}px ${FONTS[s.font] || FONTS.sans}`;
    ctx.textBaseline = 'middle';
    const lines = wrapLines(ctx, s.str || ' ', W * 0.9);
    const lh = fs * 1.18;
    let bw = 0; for (const l of lines) bw = Math.max(bw, ctx.measureText(l).width);
    const bh = lines.length * lh, pad = fs * 0.3;
    const an = this.animAll(c, t), k = c.scale * an.s;
    const cx = W / 2 + (c.x + an.dx) * W, cy = H / 2 + (c.y + an.dy) * H;
    const w = bw + pad * 2, h = bh + pad;
    this.bounds.set(c.id, { cx, cy, w: w * k, h: h * k, rot: c.rot });
    ctx.globalAlpha = Math.max(0, Math.min(1, c.opacity * an.a));
    ctx.translate(cx, cy);
    if (c.rot) ctx.rotate(c.rot * Math.PI / 180);
    ctx.scale(k, k);
    if (s.bg) { ctx.fillStyle = s.bg; rrect(ctx, -w / 2, -h / 2, w, h, fs * 0.25); ctx.fill(); }
    ctx.textAlign = s.align === 'left' ? 'left' : s.align === 'right' ? 'right' : 'center';
    const tx = s.align === 'left' ? -bw / 2 : s.align === 'right' ? bw / 2 : 0;
    ctx.lineJoin = 'round';
    lines.forEach((l, i) => {
      const y = -bh / 2 + lh * (i + 0.5);
      if (s.strokeW > 0 && s.stroke) { ctx.lineWidth = fs * s.strokeW; ctx.strokeStyle = s.stroke; ctx.strokeText(l, tx, y); }
      ctx.fillStyle = s.color; ctx.fillText(l, tx, y);
    });
    ctx.restore();
  }

  drawTransitions(ctx, W, H, t) {
    const m = this.store.lane(0);
    for (let i = 1; i < m.length; i++) {
      const c = m[i];
      if (c.trans === 'none') continue;
      const d = Math.min(c.transDur, m[i - 1].dur * 2, c.dur * 2);
      const x = Math.abs(t - c.start);
      if (x < d / 2) {
        ctx.globalAlpha = 1 - x / (d / 2);
        ctx.fillStyle = c.trans === 'white' ? '#fff' : '#000';
        ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      }
    }
  }

  draw(ctx, W, H, t, opts = {}) {
    const p = this.store.p;
    ctx.save();
    ctx.globalAlpha = 1; ctx.filter = 'none';
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    const act = (c) => t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6;
    this.bounds.clear();
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
    ctx.lineWidth = lw; ctx.strokeStyle = '#5b8cff';
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
