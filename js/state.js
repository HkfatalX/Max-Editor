// Max Editor — modelo do projeto, histórico (desfazer/refazer), keyframes e operações de edição (sem DOM)
import { MIN_DUR } from './config.js';

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r3 = (n) => Math.round(n * 1000) / 1000;

export function newProject(name, ratio, owner) {
  const now = Date.now();
  return { v: 2, id: uid(), owner: owner || null, name: name || 'Projeto sem nome', created: now, updated: now, ratio: ratio || '9:16', bg: '#000000', bgMode: 'color', fps: 30, clips: [], thumb: '' };
}

export function makeClip(over) {
  return Object.assign({
    id: uid(), lane: 0, type: 'video', mediaId: null,
    start: 0, dur: 1, in: 0, speed: 1, vol: 1, opacity: 1,
    x: 0, y: 0, scale: 1, rot: 0, flip: false, fit: 'contain',
    filter: 'none', adj: { b: 0, c: 0, s: 0, h: 0 },
    animIn: 'none', animOut: 'none', animDur: 0.5, loop: 'none', beat: { type: 'none', amt: 1, bpm: 0, every: 1, decay: 9, dir: 1 },
    trans: 'none', transDur: 0.6, fadeIn: 0, fadeOut: 0,
    blend: 'normal', mask: 'none', radius: 0.15,
    chroma: { on: false, color: '#00ff00', tol: 0.35, soft: 0.12 },
    fx: { vig: 0, grain: 0, blur: 0, shake: 0, pulse: 0 },
    kf: [],
  }, over || {});
}

export function defaultText(str) {
  return { str: str || 'Toque para editar', size: 0.07, color: '#ffffff', bg: '', bold: true, italic: false, upper: false, stroke: '#000000', strokeW: 0.12, align: 'center', font: 'sans', shadow: 0, glow: 0, glowColor: '#5b8cff', typing: false };
}

// Projetos antigos (v1.0.0) ganham os campos novos sem perder nada
export function upgradeClip(c) {
  const d = makeClip({});
  for (const k of Object.keys(d)) {
    if (!(k in c)) c[k] = d[k];
    else if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) c[k] = Object.assign({}, d[k], c[k]);
  }
  if (!Array.isArray(c.kf)) c.kf = [];
  if (c.type === 'text') c.text = Object.assign(defaultText(), c.text || {});
  return c;
}

// Valores de transformação no instante local lt (segundos desde o início do clipe), com keyframes
export function evalKf(c, lt) {
  const base = { x: c.x, y: c.y, scale: c.scale, rot: c.rot, opacity: c.opacity };
  const k = c.kf;
  if (!k || !k.length) return base;
  const pick = (a) => ({ x: a.x, y: a.y, scale: a.scale, rot: a.rot, opacity: a.opacity });
  if (lt <= k[0].t) return pick(k[0]);
  const last = k[k.length - 1];
  if (lt >= last.t) return pick(last);
  let i = 0;
  while (i < k.length - 2 && lt >= k[i + 1].t) i++;
  const a = k[i], b = k[i + 1];
  const u = (lt - a.t) / Math.max(1e-6, b.t - a.t), e = u * u * (3 - 2 * u);
  const L = (p, q) => p + (q - p) * e;
  return { x: L(a.x, b.x), y: L(a.y, b.y), scale: L(a.scale, b.scale), rot: L(a.rot, b.rot), opacity: L(a.opacity, b.opacity) };
}

const XF = new Set(['x', 'y', 'scale', 'rot', 'opacity']);
const NESTED = new Set(['adj', 'text', 'fx', 'chroma', 'beat']);

export class Store {
  constructor() {
    this.p = null; this.media = new Map(); this.sel = null;
    this.undoS = []; this.redoS = []; this.ls = {};
    this.lastKey = ''; this.lastAt = 0;
    this.timeFn = () => 0;
  }
  on(ev, fn) { (this.ls[ev] || (this.ls[ev] = new Set())).add(fn); return () => this.ls[ev].delete(fn); }
  emit(ev, a) { if (this.ls[ev]) this.ls[ev].forEach((fn) => fn(a)); }

  open(p, media) {
    this.p = p; this.media = media; this.sel = null;
    this.undoS = []; this.redoS = []; this.lastKey = '';
    if (!p.bgMode) p.bgMode = 'color';
    p.clips.forEach(upgradeClip);
    this.normalize();
    this.emit('open');
    this.emit('change', { structural: true, open: true });
  }
  close() { this.p = null; this.media = new Map(); this.sel = null; }

  clip(id) { return this.p ? this.p.clips.find((c) => c.id === id) : null; }
  selected() { return this.sel ? this.clip(this.sel) : null; }
  select(id) { if (this.sel === id) return; this.sel = id; this.emit('select', id); }
  duration() { return this.p ? this.p.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0) : 0; }
  lane(n) { return this.p.clips.filter((c) => c.lane === n).sort((a, b) => a.start - b.start); }
  localTime(c) { return clamp(r3(this.timeFn() - c.start), 0, c.dur); }
  tv(c) { return evalKf(c, this.localTime(c)); } // valores no instante atual

  snap() { const p = this.p; return JSON.stringify({ clips: p.clips, ratio: p.ratio, bg: p.bg, bgMode: p.bgMode, markers: p.markers || [] }); }
  restore(s) {
    const o = JSON.parse(s);
    this.p.clips = o.clips; this.p.ratio = o.ratio; this.p.bg = o.bg; this.p.bgMode = o.bgMode || 'color'; this.p.markers = o.markers || [];
    if (this.sel && !this.clip(this.sel)) this.sel = null;
  }
  get canUndo() { return this.undoS.length > 0; }
  get canRedo() { return this.redoS.length > 0; }
  undo() {
    if (!this.undoS.length) return;
    this.redoS.push(this.snap());
    this.restore(this.undoS.pop());
    this.lastKey = '';
    this.emit('select', this.sel);
    this.emit('change', { structural: true, history: true });
  }
  redo() {
    if (!this.redoS.length) return;
    this.undoS.push(this.snap());
    this.restore(this.redoS.pop());
    this.lastKey = '';
    this.emit('select', this.sel);
    this.emit('change', { structural: true, history: true });
  }

  // Aplica uma mudança; "key" agrupa ajustes contínuos (sliders) em um único passo de desfazer
  mutate(fn, key) {
    const before = this.snap();
    fn(this.p);
    this.normalize();
    const after = this.snap();
    if (before === after) return false;
    const now = performance.now();
    if (!(key && key === this.lastKey && now - this.lastAt < 900)) {
      this.undoS.push(before);
      if (this.undoS.length > 80) this.undoS.shift();
    }
    this.lastKey = key || ''; this.lastAt = now;
    this.redoS = [];
    if (this.sel && !this.clip(this.sel)) { this.sel = null; this.emit('select', null); }
    this.emit('change', { structural: true });
    return true;
  }

  // Trilha principal é "magnética": sem buracos
  normalize() {
    const p = this.p;
    for (const c of p.clips) {
      c.dur = Math.max(MIN_DUR, r3(c.dur));
      c.start = Math.max(0, r3(c.start));
      c.animDur = Math.min(c.animDur, Math.max(0.1, c.dur / 2));
      if (c.lane !== 0) c.trans = 'none';
      if (c.kf && c.kf.length > 1) c.kf.sort((a, b) => a.t - b.t);
    }
    let t = 0;
    for (const c of p.clips.filter((x) => x.lane === 0).sort((a, b) => a.start - b.start)) { c.start = r3(t); t += c.dur; }
    const first = p.clips.filter((x) => x.lane === 0).sort((a, b) => a.start - b.start)[0];
    if (first) first.trans = 'none';
  }

  addClip(c) { this.mutate((p) => { p.clips.push(c); }); this.select(c.id); return c; }
  removeClip(id) { this.mutate((p) => { p.clips = p.clips.filter((c) => c.id !== id); }); }

  // Com keyframes, mexer em posição/escala/rotação/opacidade grava no keyframe do instante atual
  update(id, patch, key) {
    return this.mutate(() => {
      const c = this.clip(id);
      if (!c) return;
      const kfv = {};
      for (const k of Object.keys(patch)) {
        if (XF.has(k) && c.kf && c.kf.length) kfv[k] = patch[k];
        else if (NESTED.has(k)) c[k] = Object.assign({}, c[k], patch[k]);
        else c[k] = patch[k];
      }
      if (Object.keys(kfv).length) this.setKf(c, kfv);
    }, key || ('u:' + id + ':' + Object.keys(patch).join(',')));
  }

  setKf(c, vals) {
    const lt = this.localTime(c);
    let k = c.kf.find((q) => Math.abs(q.t - lt) < 0.04);
    if (!k) { k = Object.assign({ t: lt }, evalKf(c, lt)); c.kf.push(k); c.kf.sort((a, b) => a.t - b.t); }
    Object.assign(k, vals);
  }
  addKf(id) {
    const c = this.clip(id);
    if (!c) return false;
    const lt = this.localTime(c);
    if (c.kf.some((q) => Math.abs(q.t - lt) < 0.04)) return false;
    return this.mutate(() => { c.kf.push(Object.assign({ t: lt }, evalKf(c, lt))); c.kf.sort((a, b) => a.t - b.t); });
  }
  delKfAt(id) {
    const c = this.clip(id);
    if (!c) return false;
    const lt = this.localTime(c);
    const i = c.kf.findIndex((q) => Math.abs(q.t - lt) < 0.08);
    if (i < 0) return false;
    return this.mutate(() => { c.kf.splice(i, 1); });
  }
  clearKf(id) { const c = this.clip(id); if (c && c.kf.length) this.mutate(() => { c.kf = []; }); }
  kfPreset(id, name) {
    const c = this.clip(id);
    if (!c) return;
    const b = { x: c.x, y: c.y, scale: c.scale, rot: c.rot, opacity: c.opacity }, d = c.dur;
    const K = (t, o) => Object.assign({ t }, b, o || {});
    const P = {
      zoomIn: () => [K(0), K(d, { scale: b.scale * 1.3 })],
      zoomOut: () => [K(0, { scale: b.scale * 1.3 }), K(d)],
      panLeft: () => [K(0, { x: b.x + 0.1, scale: b.scale * 1.25 }), K(d, { x: b.x - 0.1, scale: b.scale * 1.25 })],
      panRight: () => [K(0, { x: b.x - 0.1, scale: b.scale * 1.25 }), K(d, { x: b.x + 0.1, scale: b.scale * 1.25 })],
      slideIn: () => [K(0, { x: b.x - 0.7, opacity: 0 }), K(Math.min(0.6, d / 2)), K(d)],
      spinIn: () => [K(0, { rot: b.rot - 180, scale: b.scale * 0.2, opacity: 0 }), K(Math.min(0.8, d / 2)), K(d)],
      bounce: () => [K(0, { y: b.y - 0.3, opacity: 0 }), K(Math.min(0.35, d / 3)), K(Math.min(0.5, d / 2), { y: b.y - 0.06 }), K(Math.min(0.65, d * 0.65)), K(d)],
    };
    if (!P[name]) return;
    this.mutate(() => { c.kf = P[name]().map((k) => Object.assign({}, k, { t: r3(Math.min(d, k.t)) })); });
  }

  split(id, t) {
    const c = this.clip(id);
    if (!c) return false;
    const local = t - c.start;
    if (local < MIN_DUR || c.dur - local < MIN_DUR) return false;
    let newId = null;
    this.mutate((p) => {
      const mid = c.kf.length ? evalKf(c, local) : null;
      const b = JSON.parse(JSON.stringify(c));
      b.id = uid(); newId = b.id;
      b.start = r3(t); b.dur = r3(c.dur - local);
      b.in = r3(c.in + local * c.speed);
      b.animIn = 'none'; b.trans = 'none'; b.fadeIn = 0;
      if (mid) {
        b.kf = [Object.assign({ t: 0 }, mid)].concat(c.kf.filter((k) => k.t > local).map((k) => Object.assign({}, k, { t: r3(k.t - local) })));
        c.kf = c.kf.filter((k) => k.t < local).concat([Object.assign({ t: r3(local) }, mid)]);
      }
      c.dur = r3(local); c.animOut = 'none'; c.fadeOut = 0;
      p.clips.push(b);
    });
    return newId;
  }

  duplicate(id) {
    const c = this.clip(id);
    if (!c) return null;
    let nid = null;
    this.mutate((p) => {
      const b = JSON.parse(JSON.stringify(c));
      b.id = uid(); nid = b.id;
      b.start = c.lane === 0 ? c.start + c.dur - 0.0005 : c.start + c.dur;
      p.clips.push(b);
    });
    if (nid) this.select(nid);
    return nid;
  }

  // Trilha principal: coloca o clipe na posição "index" (0..n-1)
  reorderMain(id, index) {
    this.mutate((p) => {
      const list = p.clips.filter((c) => c.lane === 0).sort((a, b) => a.start - b.start);
      const i = list.findIndex((c) => c.id === id);
      if (i < 0) return;
      const [c] = list.splice(i, 1);
      list.splice(Math.max(0, Math.min(list.length, index)), 0, c);
      let t = 0;
      for (const x of list) { x.start = t; t += x.dur; }
    });
  }

  setRatio(r) { this.mutate((p) => { p.ratio = r; }, 'ratio'); }
  setBg(c) { this.mutate((p) => { p.bg = c; }, 'bg'); }
  setBgMode(m) { this.mutate((p) => { p.bgMode = m; }, 'bgmode'); }
}
