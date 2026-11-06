// Max Editor — modelo do projeto, histórico (desfazer/refazer) e operações de edição (sem DOM)
import { MIN_DUR } from './config.js';

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const r3 = (n) => Math.round(n * 1000) / 1000;

export function newProject(name, ratio) {
  const now = Date.now();
  return { v: 1, id: uid(), name: name || 'Projeto sem nome', created: now, updated: now, ratio: ratio || '9:16', bg: '#000000', fps: 30, clips: [], thumb: '' };
}

export function makeClip(over) {
  return Object.assign({
    id: uid(), lane: 0, type: 'video', mediaId: null,
    start: 0, dur: 1, in: 0, speed: 1, vol: 1, opacity: 1,
    x: 0, y: 0, scale: 1, rot: 0, flip: false, fit: 'contain',
    filter: 'none', adj: { b: 0, c: 0, s: 0, h: 0, blur: 0 },
    animIn: 'none', animOut: 'none', animDur: 0.5,
    trans: 'none', transDur: 0.6, fadeIn: 0, fadeOut: 0,
  }, over || {});
}

export function defaultText(str) {
  return { str: str || 'Toque para editar', size: 0.07, color: '#ffffff', bg: '', bold: true, italic: false, stroke: '#000000', strokeW: 0.12, align: 'center', font: 'sans' };
}

export class Store {
  constructor() {
    this.p = null; this.media = new Map(); this.sel = null;
    this.undoS = []; this.redoS = []; this.ls = {};
    this.lastKey = ''; this.lastAt = 0;
  }
  on(ev, fn) { (this.ls[ev] || (this.ls[ev] = new Set())).add(fn); return () => this.ls[ev].delete(fn); }
  emit(ev, a) { if (this.ls[ev]) this.ls[ev].forEach((fn) => fn(a)); }

  open(p, media) {
    this.p = p; this.media = media; this.sel = null;
    this.undoS = []; this.redoS = []; this.lastKey = '';
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

  snap() { const p = this.p; return JSON.stringify({ clips: p.clips, ratio: p.ratio, bg: p.bg }); }
  restore(s) {
    const o = JSON.parse(s);
    this.p.clips = o.clips; this.p.ratio = o.ratio; this.p.bg = o.bg;
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
    if (this.sel && !this.clip(this.sel)) this.sel = null;
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
    }
    let t = 0;
    for (const c of p.clips.filter((x) => x.lane === 0).sort((a, b) => a.start - b.start)) { c.start = r3(t); t += c.dur; }
    const first = p.clips.filter((x) => x.lane === 0).sort((a, b) => a.start - b.start)[0];
    if (first) first.trans = 'none';
  }

  addClip(c) { this.mutate((p) => { p.clips.push(c); }); this.select(c.id); return c; }
  removeClip(id) { this.mutate((p) => { p.clips = p.clips.filter((c) => c.id !== id); }); }

  update(id, patch, key) {
    return this.mutate(() => {
      const c = this.clip(id);
      if (!c) return;
      for (const k of Object.keys(patch)) {
        if (k === 'adj' || k === 'text') c[k] = Object.assign({}, c[k], patch[k]);
        else c[k] = patch[k];
      }
    }, key || ('u:' + id + ':' + Object.keys(patch).join(',')));
  }

  split(id, t) {
    const c = this.clip(id);
    if (!c) return false;
    const local = t - c.start;
    if (local < MIN_DUR || c.dur - local < MIN_DUR) return false;
    let newId = null;
    this.mutate((p) => {
      const b = JSON.parse(JSON.stringify(c));
      b.id = uid(); newId = b.id;
      b.start = r3(t); b.dur = r3(c.dur - local);
      b.in = r3(c.in + local * c.speed);
      b.animIn = 'none'; b.trans = 'none'; b.fadeIn = 0;
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
}
