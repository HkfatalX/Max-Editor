// Max Editor — timeline: cabeça de reprodução fixa no centro; a trilha rola por baixo
import { cached, waveSvg } from './analyze.js';
import { LANES, MIN_DUR, fmtTime } from './config.js';
import { icon } from './icons.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Timeline {
  constructor(root, store, engine) {
    this.store = store; this.engine = engine; this.pps = 60;
    root.innerHTML = `
      <div class="tl-labels"><div class="tl-corner"></div>${LANES.map((l) => `<div class="tl-label" title="${l.name}">${icon(l.icon)}</div>`).join('')}</div>
      <div class="tl-main">
        <canvas class="tl-ruler"></canvas>
        <div class="tl-scroll"><div class="tl-inner">${LANES.map((l) => `<div class="lane" data-lane="${l.id}"></div>`).join('')}</div></div>
        <div class="tl-playhead"></div>
      </div>`;
    this.root = root;
    this.ruler = root.querySelector('.tl-ruler');
    this.scroll = root.querySelector('.tl-scroll');
    this.inner = root.querySelector('.tl-inner');
    this.lanes = [...root.querySelectorAll('.lane')];
    this.programmatic = 0; this.drag = null; this.pointers = new Map(); this.pinch = null;

    this.scroll.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.scroll.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    this.scroll.addEventListener('wheel', (e) => {
      if (e.ctrlKey) { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }
      else if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) { e.preventDefault(); this.scroll.scrollLeft += e.deltaY; }
    }, { passive: false });
    new ResizeObserver(() => { this.layout(); this.drawRuler(); this.syncScroll(); }).observe(this.scroll);

    store.on('change', () => this.render());
    store.on('select', () => this.render());
    engine.on('time', () => { this.syncScroll(); });
    this.render();
  }

  get pad() { return Math.max(60, this.scroll.clientWidth / 2); }
  x(t) { return this.pad + t * this.pps; }

  zoom(f) {
    const t = this.engine.time;
    this.pps = clamp(this.pps * f, 8, 500);
    this.layout(); this.render(); this.syncScroll(true); this.drawRuler();
  }
  fit() {
    const d = this.store.duration();
    if (d > 0) this.pps = clamp((this.scroll.clientWidth * 0.8) / d, 8, 500);
    this.layout(); this.render(); this.syncScroll(true); this.drawRuler();
  }

  layout() {
    if (!this.store.p) return;
    const d = Math.max(this.store.duration(), 1);
    this.inner.style.width = (this.pad * 2 + d * this.pps) + 'px';
  }

  syncScroll(force) {
    const target = this.engine.time * this.pps;
    if (!force && Math.abs(this.scroll.scrollLeft - target) < 0.5) { this.drawRuler(); this.updateTime(); return; }
    this.programmatic = performance.now();
    this.scroll.scrollLeft = target;
    this.drawRuler(); this.updateTime();
  }
  updateTime() { if (this.onTime) this.onTime(this.engine.time); }

  onScroll() {
    if (performance.now() - this.programmatic < 120) { this.drawRuler(); return; }
    if (this.engine.playing) this.engine.pause();
    this.engine.seek(this.scroll.scrollLeft / this.pps);
    this.drawRuler();
  }

  drawRuler() {
    const cv = this.ruler, w = this.scroll.clientWidth, h = 22, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    ctx.strokeStyle = css.getPropertyValue('--line').trim() || '#2a3350';
    ctx.fillStyle = css.getPropertyValue('--muted').trim() || '#8b93a7';
    ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find((s) => s * this.pps >= 64) || 600;
    const sl = this.scroll.scrollLeft, half = this.pad;
    const t0 = Math.max(0, Math.floor(((sl - half) / this.pps) / step) * step), t1 = (sl + w - half) / this.pps;
    for (let t = t0; t <= t1 + step; t += step) {
      const x = Math.round(half + t * this.pps - sl) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, h - 7); ctx.lineTo(x, h); ctx.stroke();
      ctx.fillText(fmtTime(t, step < 1), x + 4, 8);
      const sub = step / 4; // marcas menores
      for (let k = 1; k < 4; k++) { const xx = Math.round(x + k * sub * this.pps); ctx.beginPath(); ctx.moveTo(xx + 0.5, h - 3); ctx.lineTo(xx + 0.5, h); ctx.stroke(); }
    }
  }

  // ---------- desenho dos clipes ----------
  render() {
    if (!this.store.p) return;
    this.layout();
    const sel = this.store.sel;
    for (const lane of this.lanes) {
      const n = +lane.dataset.lane;
      lane.innerHTML = '';
      for (const c of this.store.p.clips.filter((x) => x.lane === n)) lane.appendChild(this.clipEl(c, c.id === sel));
    }
    this.syncScroll(true);
  }

  clipEl(c, selected) {
    const el = document.createElement('div');
    el.className = `clip t-${c.type}${selected ? ' sel' : ''}`;
    el.dataset.id = c.id;
    el.style.left = this.x(c.start) + 'px';
    el.style.width = Math.max(10, c.dur * this.pps) + 'px';
    const m = this.store.media.get(c.mediaId);
    if (m && m.thumb && (c.type === 'video' || c.type === 'image')) el.style.backgroundImage = `url(${m.thumb})`;
    if (c.type === 'audio') { const a = cached(c.mediaId); if (a && a.wave) { const bg = waveSvg(a.wave, c.in, c.in + c.dur * c.speed); if (bg) { el.style.backgroundImage = bg; el.style.backgroundSize = '100% 100%'; el.style.backgroundRepeat = 'no-repeat'; } } }
    let label = '';
    if (c.type === 'text') label = (c.text.str || '').replace(/\n/g, ' ');
    else if (m) label = m.name;
    if (c.speed !== 1) label = `${c.speed}x · ${label}`;
    el.innerHTML = `<span class="cl">${label.replace(/</g, '&lt;')}</span>` +
      (c.trans !== 'none' ? '<i class="tr" title="Transição"></i>' : '') + (c.kf && c.kf.length ? c.kf.map((k) => '<i class="kf" style="left:' + (k.t * this.pps) + 'px"></i>').join('') : '') +
      (selected ? '<i class="h l"></i><i class="h r"></i>' : '');
    return el;
  }

  // ---------- gestos ----------
  onDown(e) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && !this.drag) { // pinça para zoom
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), pps: this.pps };
      return;
    }
    const clipEl = e.target.closest('.clip');
    if (!clipEl) {
      if (e.target.closest('.lane') || e.target === this.inner) this.store.select(null);
      return;
    }
    const id = clipEl.dataset.id, c = this.store.clip(id);
    if (!c) return;
    const isHandle = e.target.classList.contains('h');
    const wasSel = this.store.sel === id;
    if (!wasSel && (e.pointerType === 'mouse' || e.pointerType === 'pen')) this.store.select(id);
    else if (!wasSel) { this._tapId = id; return; } // toque: seleciona no "click" (permite rolar)
    const mode = isHandle ? (e.target.classList.contains('l') ? 'trimL' : 'trimR') : 'move';
    this.drag = { id, mode, x0: e.clientX, orig: JSON.parse(JSON.stringify(c)), moved: false, pid: e.pointerId, el: null };
    if (mode !== 'move' || e.pointerType === 'mouse') e.preventDefault();
    try { this.scroll.setPointerCapture(e.pointerId); } catch {}
  }

  onMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.pps = clamp(this.pinch.pps * d / Math.max(10, this.pinch.d), 8, 500);
      this.layout(); this.render(); this.syncScroll(true);
      e.preventDefault(); return;
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true; e.preventDefault();
    const dt = dx / this.pps;
    const c = d.orig, el = this.root.querySelector(`.clip[data-id="${d.id}"]`);
    if (!el) return;
    d.el = el;
    if (d.mode === 'move') {
      if (c.lane === 0) { el.style.left = this.x(Math.max(0, c.start + dt)) + 'px'; el.style.zIndex = 5; el.style.opacity = 0.85; d.newStart = c.start + dt; }
      else { const s = this.snap(Math.max(0, c.start + dt), c, true); d.newStart = s; el.style.left = this.x(s) + 'px'; }
    } else if (d.mode === 'trimL') {
      const m = this.store.media.get(c.mediaId);
      const minDt = c.type === 'video' || c.type === 'audio' ? -c.in / c.speed : -c.start;
      let q = clamp(dt, Math.max(minDt, -c.start), c.dur - MIN_DUR);
      q = this.snapEdge(c.start + q) - c.start;
      d.q = clamp(q, Math.max(minDt, -c.start), c.dur - MIN_DUR); void m;
      el.style.left = this.x(c.start + d.q) + 'px'; el.style.width = Math.max(10, (c.dur - d.q) * this.pps) + 'px';
    } else {
      const m = this.store.media.get(c.mediaId);
      const maxDur = (c.type === 'video' || c.type === 'audio') && m ? (m.dur - c.in) / c.speed : 3600;
      let nd = clamp(c.dur + dt, MIN_DUR, maxDur);
      nd = clamp(this.snapEdge(c.start + nd) - c.start, MIN_DUR, maxDur);
      d.nd = nd; el.style.width = Math.max(10, nd * this.pps) + 'px';
    }
  }

  snapEdge(t) {
    const thr = 8 / this.pps; const cand = [this.engine.time, 0];
    for (const o of this.store.p.clips) { cand.push(o.start, o.start + o.dur); }
    let best = t, bd = thr;
    for (const v of cand) { const d = Math.abs(v - t); if (d < bd) { bd = d; best = v; } }
    return best;
  }
  snap(start, c) {
    const a = this.snapEdge(start), b = this.snapEdge(start + c.dur) - c.dur;
    return Math.abs(a - start) <= Math.abs(b - start) ? a : b;
  }

  onUp(e, cancelled) {
    this.pointers.delete(e.pointerId);
    if (this.pinch && this.pointers.size < 2) { this.pinch = null; this.drawRuler(); }
    const d = this.drag;
    if (d && e.pointerId === d.pid) {
      this.drag = null;
      try { this.scroll.releasePointerCapture(e.pointerId); } catch {}
      if (d.moved && !cancelled) this.commit(d);
      else this.render();
      this._swallowClick = d.moved;
      return;
    }
  }

  commit(d) {
    const c = d.orig, st = this.store;
    if (d.mode === 'move') {
      if (c.lane === 0) {
        const list = st.lane(0).filter((x) => x.id !== c.id);
        const center = d.newStart + c.dur / 2;
        let idx = 0; for (const o of list) if (o.start + o.dur / 2 < center) idx++;
        st.reorderMain(c.id, idx);
      } else st.update(c.id, { start: Math.max(0, d.newStart) }, 'move:' + c.id);
    } else if (d.mode === 'trimL' && d.q !== undefined) {
      const q = d.q;
      st.update(c.id, { start: c.start + q, dur: c.dur - q, in: c.type === 'video' || c.type === 'audio' ? c.in + q * c.speed : 0 }, 'trim:' + c.id);
    } else if (d.mode === 'trimR' && d.nd !== undefined) {
      st.update(c.id, { dur: d.nd }, 'trim:' + c.id);
    }
    this.render();
  }

  // seleção por toque (click só dispara se não houve rolagem)
  bindClick() {
    this.scroll.addEventListener('click', (e) => {
      if (this._swallowClick) { this._swallowClick = false; return; }
      const clipEl = e.target.closest('.clip');
      if (clipEl && !e.target.classList.contains('h')) this.store.select(clipEl.dataset.id);
    });
  }
}
