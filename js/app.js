// Max Editor — aplicação principal (telas, projetos, autosave, importação, exportação, atualização)
import { APP_NAME, RATIOS, PREVIEW_LONG, isNative, parseRatio, fmtTime, IMAGE_DUR } from './config.js';
import { storage, mirrorProject, readMirror, session, prefs } from './storage.js';
import { Store, newProject } from './state.js';
import { Engine, FILTERS } from './engine.js';
import { Timeline } from './timeline.js';
import { icon } from './icons.js';
import { buildPanel, SHEET_TITLES } from './panels.js';
import { importFiles, loadProjectMedia, freeMedia, clipFromMedia, textClip } from './media.js';
import { exportVideo, exportSize, pickMime, extFor } from './export.js';
import { saveVideo, safeName } from './files.js';
import { checkUpdate, applyUpdate, runningVersion } from './updater.js';
import { $, $$, h, esc, toast, modal, confirmBox, promptBox, chips, btn, pushBack, removeBack } from './ui.js';

const store = new Store();
const engine = new Engine(store);
let tl = null, editorBack = null, sheetBack = null, sheetKind = null, lastRatio = '';
let dirty = false, saveTimer = 0, recovered = false;
const cv = $('#cv');

// ======================= util =======================
$$('[data-ic]').forEach((el) => { el.innerHTML = icon(el.dataset.ic); });
const fmtDate = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const projDuration = (p) => p.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);

// ======================= tela inicial =======================
async function renderHome() {
  let list = [];
  try { list = await storage.listProjects(); } catch (e) { console.error(e); toast('Não consegui ler os projetos salvos'); }
  const grid = $('#projList'); grid.innerHTML = '';
  $('#projEmpty').hidden = list.length > 0;
  $('#projCount').textContent = list.length ? `${list.length} projeto${list.length > 1 ? 's' : ''}` : '';
  for (const p of list) {
    const card = h('div', { class: 'proj' });
    const open = h('button', { class: 'proj', style: 'width:100%;border:0;background:none', type: 'button', onclick: () => openProject(p.id) });
    open.innerHTML = `<div class="th" style="${p.thumb ? `background-image:url(${p.thumb})` : ''}">${p.thumb ? '' : icon('video')}</div>
      <div class="meta"><b>${esc(p.name)}</b><small>${p.ratio} · ${fmtTime(projDuration(p), false)} · ${fmtDate(p.updated)}</small></div>`;
    const more = h('button', { class: 'icon-btn more', 'aria-label': 'Opções', type: 'button', html: icon('more'), onclick: (e) => { e.stopPropagation(); projectMenu(p); } });
    card.append(open, more); grid.append(card);
  }
}
function showHome() { $('#editor').hidden = true; $('#home').hidden = false; renderHome(); }

function projectMenu(p) {
  const m = modal({ title: p.name, actions: [
    { label: 'Fechar' },
    { label: 'Renomear', onClick: async () => { const n = await promptBox('Renomear projeto', p.name); if (n) { const rec = await storage.loadProject(p.id); rec.name = n; await storage.saveProject(rec); renderHome(); } } },
    { label: 'Excluir', cls: 'danger', onClick: async () => { if (await confirmBox(`Excluir “${p.name}”? Isso apaga as mídias dele também.`, 'Excluir', true)) { await storage.deleteProject(p.id); if (session.getOpen() === p.id) session.clearOpen(); renderHome(); toast('Projeto excluído'); } } },
  ] });
  void m;
}

function newProjectDialog() {
  let ratio = prefs.get('lastRatio', '9:16');
  const name = h('input', { class: 'field', type: 'text', maxlength: '60', value: `Projeto ${new Date().toLocaleDateString('pt-BR')}` });
  const grid = h('div', { class: 'ratio-grid' });
  const draw = () => {
    grid.innerHTML = '';
    for (const r of RATIOS) {
      const b = h('button', { class: 'ratio' + (r.id === ratio ? ' on' : ''), type: 'button' },
        h('i', { class: 'rbox', style: `aspect-ratio:${r.w}/${r.h};${r.w >= r.h ? 'width:34px' : 'height:34px'}` }), h('b', {}, r.id), h('small', {}, r.hint));
      b.addEventListener('click', () => { ratio = r.id; draw(); });
      grid.append(b);
    }
  };
  draw();
  const body = h('div', {}, h('div', { class: 'sec-t' }, 'Nome'), name, h('div', { class: 'sec-t', style: 'margin-top:14px' }, 'Proporção (dá pra mudar depois)'), grid);
  modal({ title: 'Novo projeto', body, wide: true, actions: [
    { label: 'Cancelar' },
    { label: 'Criar projeto', cls: 'primary', onClick: async () => {
      prefs.set('lastRatio', ratio);
      const p = newProject(name.value.trim() || 'Projeto', ratio);
      try { await storage.saveProject(p); } catch (e) { toast('Não consegui criar o projeto (sem espaço?)'); return false; }
      setTimeout(() => openProject(p.id), 50);
    } },
  ] });
}

// ======================= abrir / fechar editor =======================
async function openProject(id, opts = {}) {
  let rec;
  try { rec = await storage.loadProject(id); } catch (e) { console.error(e); }
  if (!rec) { toast('Projeto não encontrado'); session.clearOpen(); showHome(); return; }
  let p = rec; recovered = false;
  const mir = readMirror(id);
  if (mir && (mir.updated || 0) > (rec.updated || 0) && Array.isArray(mir.clips)) { p = Object.assign({}, rec, mir); recovered = true; }
  const media = await loadProjectMedia(p);
  const before = p.clips.length;
  p.clips = p.clips.filter((c) => c.type === 'text' || media.has(c.mediaId));
  const lost = before - p.clips.length;

  $('#home').hidden = true; $('#editor').hidden = false;
  const q = prefs.get('previewQ', 'auto');
  engine.maxLong = PREVIEW_LONG[q === 'auto' ? engine.tier : q] || PREVIEW_LONG.mid;
  engine.quality = 1;
  engine.attach(cv);
  store.open(p, media);
  lastRatio = p.ratio; fitCanvas(); engine.resize();
  engine.seek(0);
  if (store.duration() > 0) tl.fit();
  session.setOpen(id);
  editorBack = pushBack((fromBack) => closeEditor(fromBack));
  refreshUi(); renderToolbar();
  if (recovered) { markDirty(); toast('Projeto recuperado do último salvamento automático'); }
  else if (opts.auto) toast('Reabrimos o projeto em que você estava');
  if (lost) toast(`${lost} clipe(s) removido(s): mídia não encontrada`, 4000);
}

async function closeEditor(fromBack) {
  if (!store.p) return;
  engine.pause();
  await flush();
  if (!fromBack && editorBack) removeBack(editorBack);
  editorBack = null;
  closeSheet(true);
  freeMedia(store.media);
  engine.dispose(); store.close();
  session.clearOpen();
  showHome();
}

// ======================= autosave =======================
function setSaveState(s) {
  const el = $('#saveState');
  el.className = 'save-state' + (s === 'saving' || s === 'pending' ? ' saving' : s === 'error' ? ' err' : '');
  el.textContent = s === 'saved' ? 'Salvo' : s === 'error' ? 'Erro ao salvar' : 'Salvando…';
}
function markDirty() {
  if (!store.p) return;
  dirty = true; setSaveState('pending');
  store.p.updated = Date.now(); mirrorProject(store.p);
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700);
}
function pickThumb() {
  const c = store.lane(0)[0] || store.p.clips.find((x) => x.mediaId);
  const m = c && store.media.get(c.mediaId);
  return (m && m.thumb) || '';
}
async function saveNow() {
  if (!store.p || !dirty) return;
  clearTimeout(saveTimer);
  const p = store.p; p.updated = Date.now(); p.thumb = pickThumb(); dirty = false; setSaveState('saving');
  try { await storage.saveProject(p); if (!dirty) setSaveState('saved'); }
  catch (e) { dirty = true; setSaveState('error'); console.error('autosave', e); }
}
async function flush() { if (!store.p) return; if (dirty) { mirrorProject(store.p); await saveNow(); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) { flush(); if (engine.playing && !engine.exporting) engine.pause(); } });
window.addEventListener('pagehide', () => { flush(); });
window.addEventListener('beforeunload', () => { if (store.p && dirty) mirrorProject(store.p); flush(); });
document.addEventListener('freeze', () => { flush(); });
setInterval(() => { if (dirty) saveNow(); }, 15000);

// ======================= UI do editor =======================
function fitCanvas() {
  if (!store.p) return;
  const wrap = $('#canvasWrap'), { w, h: hh } = parseRatio(store.p.ratio);
  const bw = wrap.clientWidth, bh = wrap.clientHeight;
  if (!bw || !bh) return;
  let cw = bw, ch = bw * hh / w;
  if (ch > bh) { ch = bh; cw = bh * w / hh; }
  cv.style.width = Math.floor(cw) + 'px'; cv.style.height = Math.floor(ch) + 'px';
}
new ResizeObserver(() => fitCanvas()).observe($('#canvasWrap'));

function refreshUi() {
  if (!store.p) return;
  $('#projName').textContent = store.p.name;
  $('#btnUndo').disabled = !store.canUndo; $('#btnRedo').disabled = !store.canRedo;
  $('#btnRatio').textContent = store.p.ratio;
  $('#emptyHint').hidden = store.p.clips.length > 0;
  updateTime();
}
function updateTime() { $('#timeLabel').textContent = `${fmtTime(engine.time)} / ${fmtTime(store.duration())}`; }

tl = new Timeline($('#timeline'), store, engine);
tl.onTime = updateTime;

store.on('change', (e) => {
  if (!store.p) return;
  if (store.p.ratio !== lastRatio) { lastRatio = store.p.ratio; fitCanvas(); engine.resize(); }
  const dur = store.duration();
  if (engine.time > dur) engine.seek(dur);
  engine.requestRender();
  refreshUi();
  if (!(e && e.open)) markDirty();
  if (e && e.history) { if (sheetKind) openSheet(sheetKind, true); renderToolbar(); }
});
store.on('select', (id) => {
  const c = id && store.clip(id);
  if (c && (engine.time < c.start - 1e-3 || engine.time >= c.start + c.dur)) engine.seek(c.start + Math.min(0.05, c.dur / 2));
  if (sheetKind && sheetKind !== 'ratio') closeSheet();
  renderToolbar(); engine.requestRender();
});
engine.on('state', () => { $('#btnPlay').innerHTML = icon(engine.playing ? 'pause' : 'play'); $('#btnPlay').setAttribute('aria-label', engine.playing ? 'Pausar' : 'Reproduzir'); });
engine.on('degrade', () => toast('Prévia ajustada automaticamente para manter a fluidez'));

$('#btnPlay').addEventListener('click', () => { if (store.duration() > 0) engine.toggle(); });
$('#btnUndo').addEventListener('click', () => store.undo());
$('#btnRedo').addEventListener('click', () => store.redo());
$('#btnHome').addEventListener('click', () => closeEditor(false));
$('#btnRatio').addEventListener('click', () => openSheet('ratio'));
$('#btnZoomIn').addEventListener('click', () => tl.zoom(1.4));
$('#btnZoomOut').addEventListener('click', () => tl.zoom(1 / 1.4));
$('#btnFit').addEventListener('click', () => tl.fit());
$('#btnExport').addEventListener('click', openExport);
$('#btnEmptyAdd').addEventListener('click', () => pick('main'));
$('#projName').addEventListener('click', async () => {
  const n = await promptBox('Nome do projeto', store.p.name);
  if (n && n !== store.p.name) { store.p.name = n; refreshUi(); markDirty(); }
});
$('#sheetClose').addEventListener('click', () => closeSheet());

// ----- barra de ferramentas -----
function renderToolbar() {
  const tb = $('#toolbar'); tb.innerHTML = '';
  if (!store.p) return;
  const c = store.selected();
  const add = (ic, label, fn, cls = '') => { const b = h('button', { class: 'tool ' + cls, type: 'button' }); b.innerHTML = icon(ic) + `<span>${label}</span>`; b.addEventListener('click', fn); tb.append(b); };
  if (!c) {
    add('video', 'Mídia', () => pick('main'));
    add('layers', 'Sobrepor', () => pick('overlay'));
    add('music', 'Áudio', () => pick('audio'));
    add('mic', 'Voz', recordVoice);
    add('text', 'Texto', addText);
    add('ratio', 'Proporção', () => openSheet('ratio'));
    return;
  }
  add('close', 'Fechar', () => store.select(null), 'back');
  add('split', 'Dividir', splitSelected);
  if (c.type === 'text') add('edit', 'Texto', () => openSheet('text'));
  if (c.type === 'video' || c.type === 'audio') add('volume', 'Volume', () => openSheet('volume'));
  if (c.type === 'video' || c.type === 'audio') add('speed', 'Velocidade', () => openSheet('speed'));
  if (c.type === 'video' || c.type === 'image') add('filter', 'Filtros', () => openSheet('filters'));
  if (c.type !== 'audio') add('adjust', 'Ajustes', () => openSheet('adjust'));
  if (c.type !== 'audio') add('anim', 'Animação', () => openSheet('anim'));
  if (c.lane === 0) add('trans', 'Transição', () => openSheet('trans'));
  add('copy', 'Duplicar', () => store.duplicate(c.id));
  add('trash', 'Excluir', () => { store.removeClip(c.id); toast('Clipe excluído (dá pra desfazer)'); }, 'danger');
}
function splitSelected() {
  const c = store.selected(); if (!c) return;
  if (!store.split(c.id, engine.time)) toast('Posicione a linha branca dentro do clipe para dividir');
}
function addText() {
  const c = textClip(engine.time);
  store.addClip(c);
  openSheet('text');
}

// ----- painéis (folha inferior / lateral no PC) -----
function openSheet(kind, silent) {
  sheetKind = kind;
  const panel = buildPanel(kind, { store, engine, openSheet: (k) => openSheet(k, true) });
  $('#sheetBody').replaceChildren(panel);
  $('#sheetTitle').textContent = SHEET_TITLES[kind] || '';
  $('#sheet').hidden = false; $('#editor').classList.add('sheet-open');
  if (!sheetBack && !silent) sheetBack = pushBack((fromBack) => closeSheet(true, fromBack));
  else if (!sheetBack) sheetBack = pushBack((fromBack) => closeSheet(true, fromBack));
}
function closeSheet(noRender, fromBack) {
  if (sheetBack) { const f = sheetBack; sheetBack = null; if (!fromBack) removeBack(f); }
  sheetKind = null;
  $('#sheet').hidden = true; $('#editor').classList.remove('sheet-open');
  $('#sheetBody').replaceChildren(h('p', { class: 'note' }, 'Selecione um clipe na timeline para ver as opções de edição.'));
  $('#sheetTitle').textContent = 'Propriedades';
  if (!noRender) engine.requestRender();
}
$('#sheetBody').replaceChildren(h('p', { class: 'note' }, 'Selecione um clipe na timeline para ver as opções de edição.'));
$('#sheetTitle').textContent = 'Propriedades';

// ======================= importação =======================
const fileIn = $('#fileIn');
let pendingTarget = 'main', pendingAt = null;
function pick(target, at) {
  pendingTarget = target; pendingAt = at == null ? null : at;
  fileIn.accept = target === 'audio' ? 'audio/*' : 'video/*,image/*';
  fileIn.value = '';
  fileIn.click();
}
fileIn.addEventListener('change', () => { const f = Array.from(fileIn.files || []); if (f.length) addFiles(f, pendingTarget, pendingAt); });
$('#stage').addEventListener('dragover', (e) => e.preventDefault());
$('#stage').addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files), 'main'); });

async function addFiles(files, target, at) {
  if (!store.p) return;
  engine.pause();
  const { media, errors } = await importFiles(files, store, (i, n, name) => { if (i < n) toast(`Importando ${i + 1}/${n}: ${name}`, 60000); });
  let last = null;
  if (media.length) {
    const head = at == null ? engine.time : at;
    store.mutate((p) => {
      let tMain = store.lane(0).reduce((m, c) => Math.max(m, c.start + c.dur), 0), tHead = head;
      for (const m of media) {
        const lane = m.kind === 'audio' ? 3 : target === 'overlay' ? 1 : 0;
        const c = clipFromMedia(m, lane, lane === 0 ? tMain : tHead);
        p.clips.push(c); last = c;
        if (lane === 0) tMain += c.dur; else tHead += c.dur;
      }
    });
    if (store.duration() > 0 && media.length) tl.fit();
    toast(`${media.length} arquivo${media.length > 1 ? 's' : ''} adicionado${media.length > 1 ? 's' : ''}`);
  } else $('#toast').classList.remove('show');
  if (errors.length) modal({ title: 'Alguns arquivos não foram adicionados', body: `<ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`, actions: [{ label: 'Ok', cls: 'primary' }] });
  void last;
}

// ======================= gravação de voz =======================
async function recordVoice() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') { toast('Gravação de voz não está disponível neste aparelho'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { modal({ title: 'Microfone bloqueado', body: '<p>Para gravar sua voz, permita o acesso ao microfone nas configurações do app (ou do navegador) e tente de novo.</p>', actions: [{ label: 'Entendi', cls: 'primary' }] }); return; }
  const mt = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } });
  const rec = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);
  const chunks = []; const startAt = engine.time; const t0 = performance.now();
  let cancelled = false;
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop()); engine.pause();
    if (cancelled || !chunks.length) return;
    const type = (rec.mimeType || mt || 'audio/webm').split(';')[0];
    const f = new File([new Blob(chunks, { type })], `Voz ${new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-')}.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type });
    await addFiles([f], 'audio', startAt);
  };
  const lbl = h('p', { html: '<span class="rec-dot"></span><b id="recT">00:00.0</b>' });
  const iv = setInterval(() => { const e = $('#recT'); if (e) e.textContent = fmtTime((performance.now() - t0) / 1000); }, 100);
  const m = modal({ title: 'Gravando voz', body: h('div', {}, lbl, h('p', { class: 'note' }, 'A prévia toca junto para você acompanhar. Use fone para evitar eco.')), dismissible: false, actions: [
    { label: 'Cancelar', onClick: () => { cancelled = true; clearInterval(iv); rec.stop(); } },
    { label: 'Parar e adicionar', cls: 'primary', onClick: () => { clearInterval(iv); rec.stop(); } },
  ] });
  void m;
  rec.start(250);
  if (store.duration() > 0) { engine.seek(startAt); engine.play(); }
}

// ======================= exportação =======================
function openExport() {
  if (!store.p || store.duration() <= 0) { toast('Adicione algo ao projeto antes de exportar'); return; }
  const mime = pickMime();
  if (!mime) { modal({ title: 'Exportação indisponível', body: '<p>Este navegador não suporta gravar vídeo (MediaRecorder). Use o Chrome/Edge ou o app Android.</p>', actions: [{ label: 'Ok', cls: 'primary' }] }); return; }
  engine.pause();
  let res = prefs.get('exRes', engine.tier === 'low' ? 480 : 720), fps = prefs.get('exFps', 30);
  const info = h('p', { class: 'note' });
  const upd = () => { const s = exportSize(store.p.ratio, res); info.textContent = `${s.W}×${s.H} · ${fps} fps · ${extFor(mime).toUpperCase()} · exporta em tempo real (~${fmtTime(store.duration(), false)}). Mantenha o app aberto.`; };
  const body = h('div', {},
    h('div', { class: 'sec-t' }, 'Qualidade'), chips([[480, '480p · rápido'], [720, '720p · HD'], [1080, '1080p · Full HD']], res, (v) => { res = v; prefs.set('exRes', v); upd(); }),
    h('div', { class: 'sec-t' }, 'Quadros por segundo'), chips([[24, '24'], [30, '30'], [60, '60']], fps, (v) => { fps = v; prefs.set('exFps', v); upd(); }),
    info, engine.tier === 'low' ? h('p', { class: 'note' }, 'Dica: em aparelhos mais fracos prefira 480p/720p e 30 fps.') : null);
  upd();
  modal({ title: 'Exportar vídeo', body, actions: [{ label: 'Cancelar' }, { label: 'Exportar', cls: 'primary', onClick: () => { setTimeout(() => runExport(res, fps), 30); } }] });
}

async function runExport(shortSide, fps) {
  await flush();
  const signal = { cancelled: false };
  const bar = h('i'); const lbl = h('p', { class: 'note' }, 'Preparando…');
  const m = modal({ title: 'Exportando…', body: h('div', {}, h('div', { class: 'progress' }, bar), lbl, h('p', { class: 'note' }, 'Não feche nem troque de app até terminar.')), dismissible: false, actions: [{ label: 'Cancelar', onClick: () => { signal.cancelled = true; } }] });
  let out = null, err = null;
  try {
    out = await exportVideo(engine, { shortSide, fps, signal, onProgress: (p) => { bar.style.width = Math.round(p * 100) + '%'; lbl.textContent = `${Math.round(p * 100)}%`; } });
  } catch (e) { err = e; console.error(e); }
  m.close();
  if (signal.cancelled) { toast('Exportação cancelada'); return; }
  if (err || !out || !out.blob.size) { modal({ title: 'Não deu certo', body: `<p>${esc((err && err.message) || 'O vídeo saiu vazio.')}</p><p class="note">Tente uma qualidade menor (480p) e feche outros apps.</p>`, actions: [{ label: 'Ok', cls: 'primary' }] }); return; }
  const name = `${safeName(store.p.name)}.${extFor(out.mime)}`;
  try {
    toast('Salvando arquivo…', 60000);
    const r = await saveVideo(out.blob, name);
    modal({ title: 'Vídeo pronto! 🎬', body: `<p><b>${esc(name)}</b> (${(out.blob.size / 1048576).toFixed(1)} MB)</p><p class="note">Salvo em: ${esc(r.where)}.</p>`, actions: [{ label: 'Ok', cls: 'primary' }] });
  } catch (e) { console.error(e); modal({ title: 'Não consegui salvar o arquivo', body: `<p>${esc(e.message || e)}</p>`, actions: [{ label: 'Ok', cls: 'primary' }] }); }
  $('#toast').classList.remove('show');
}

// ======================= gestos no canvas =======================
const G = { ptrs: new Map(), mode: null, id: null, o: null, raf: 0, pend: null };
function cpt(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
function applyG() {
  G.raf = 0; if (!G.pend || !store.p) return;
  store.update(G.id, G.pend, 'gesture:' + G.gid); G.pend = null;
}
cv.addEventListener('pointerdown', (e) => {
  if (!store.p || engine.exporting) return;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  G.ptrs.set(e.pointerId, cpt(e));
  if (G.ptrs.size === 1) {
    const hit = engine.hit(G.ptrs.get(e.pointerId).x, G.ptrs.get(e.pointerId).y);
    store.select(hit ? hit.id : null);
    const c = store.selected();
    if (c && c.type !== 'audio') { G.mode = 'drag'; G.id = c.id; G.gid = Date.now(); G.start = G.ptrs.get(e.pointerId); G.o = { x: c.x, y: c.y, scale: c.scale, rot: c.rot }; }
    else G.mode = null;
  } else if (G.ptrs.size === 2 && G.id) {
    const [a, b] = [...G.ptrs.values()], c = store.clip(G.id);
    if (!c) return;
    G.mode = 'pinch'; G.gid = Date.now(); G.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; G.a0 = Math.atan2(b.y - a.y, b.x - a.x); G.o = { x: c.x, y: c.y, scale: c.scale, rot: c.rot };
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!G.ptrs.has(e.pointerId) || !G.mode) return;
  G.ptrs.set(e.pointerId, cpt(e));
  if (G.mode === 'drag') {
    const p = G.ptrs.get(e.pointerId);
    G.pend = { x: G.o.x + (p.x - G.start.x) / engine.W, y: G.o.y + (p.y - G.start.y) / engine.H };
  } else if (G.mode === 'pinch' && G.ptrs.size >= 2) {
    const [a, b] = [...G.ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    G.pend = { scale: Math.min(4, Math.max(0.1, G.o.scale * d / G.d0)), rot: Math.round(((G.o.rot + (ang - G.a0) * 180 / Math.PI + 540) % 360) - 180) };
  }
  if (G.pend && !G.raf) G.raf = requestAnimationFrame(applyG);
});
const endG = (e) => {
  G.ptrs.delete(e.pointerId);
  if (G.pend) applyG();
  if (G.ptrs.size === 0) { G.mode = null; if (sheetKind === 'adjust') openSheet('adjust', true); }
  else if (G.ptrs.size === 1 && G.mode === 'pinch') { const c = store.selected(); if (c) { G.mode = 'drag'; G.start = [...G.ptrs.values()][0]; G.o = { x: c.x, y: c.y, scale: c.scale, rot: c.rot }; G.gid = Date.now(); } }
};
cv.addEventListener('pointerup', endG); cv.addEventListener('pointercancel', endG);
cv.addEventListener('wheel', (e) => {
  const c = store.selected(); if (!c || c.type === 'audio') return;
  e.preventDefault(); store.update(c.id, { scale: Math.min(4, Math.max(0.1, c.scale * (e.deltaY < 0 ? 1.06 : 1 / 1.06))) }, 'wheel:' + c.id);
}, { passive: false });

// ======================= atalhos de teclado =======================
window.addEventListener('keydown', (e) => {
  if (!store.p || $('#editor').hidden) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
  if ($('#modals').children.length) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); engine.toggle(); }
  else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
  else if (mod && k === 'y') { e.preventDefault(); store.redo(); }
  else if (mod && k === 'd') { e.preventDefault(); const c = store.selected(); if (c) store.duplicate(c.id); }
  else if (k === 's' && !mod) { splitSelected(); }
  else if (k === 'delete' || k === 'backspace') { const c = store.selected(); if (c) { e.preventDefault(); store.removeClip(c.id); } }
  else if (k === 'escape') store.select(null);
  else if (k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); engine.pause(); engine.seek(engine.time + (k === 'arrowleft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30)); }
  else if (k === '+' || k === '=') tl.zoom(1.25);
  else if (k === '-') tl.zoom(1 / 1.25);
});

// ======================= atualizações =======================
let dismissedVersion = null, lastCheck = 0;
async function runUpdateCheck(manual) {
  if (engine.exporting) return;
  lastCheck = Date.now();
  try {
    const info = await checkUpdate();
    if (info) { if (manual || dismissedVersion !== info.version) showUpdate(info); }
    else if (manual) toast('Você já está na versão mais recente ✓');
  } catch { if (manual) toast('Não consegui verificar agora (sem internet?)'); }
}
function showUpdate(info) {
  if ($('#modals .update-modal')) return;
  const notes = (info.notes || []).map((n) => `<li>${esc(n)}</li>`).join('');
  const m = modal({ title: `Nova versão ${info.version} disponível 🚀`, body: `<p>Você está na ${esc(info.current)}.${isNative() ? ' Toque em Atualizar para baixar o novo APK e instalar por cima (seus projetos continuam).' : ' Atualize para ter as novidades.'}</p>${notes ? `<ul>${notes}</ul>` : ''}`, actions: [
    { label: 'Depois', onClick: () => { dismissedVersion = info.version; } },
    { label: 'Atualizar agora', cls: 'primary', onClick: async () => { await flush(); applyUpdate(info); } },
  ] });
  m.el.classList.add('update-modal');
}
setTimeout(() => runUpdateCheck(false), 4000);
setInterval(() => { if (!document.hidden) runUpdateCheck(false); }, 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 10 * 60 * 1000) runUpdateCheck(false); });

// ======================= configurações =======================
$('#btnSettings').addEventListener('click', async () => {
  const ver = await runningVersion();
  const est = await storage.estimate();
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const mb = (n) => (n / 1048576).toFixed(0) + ' MB';
  const q = prefs.get('previewQ', 'auto');
  const body = h('div', {},
    h('div', { class: 'row' }, h('div', {}, h('b', {}, `${APP_NAME} v${ver}`), h('div', { class: 'note' }, isNative() ? 'App Android (APK)' : 'Site / PWA')), btn('Verificar update', 'refresh', () => runUpdateCheck(true), 'small')),
    h('div', { class: 'row' }, h('div', {}, h('b', {}, 'Armazenamento'), h('div', { class: 'note' }, est ? `${mb(est.usage || 0)} usados de ${mb(est.quota || 0)} · dados ${persisted ? 'protegidos' : 'não protegidos'}` : 'indisponível')),
      persisted ? null : btn('Proteger', 'check', async () => { try { const ok = await navigator.storage.persist(); toast(ok ? 'Dados protegidos contra limpeza automática ✓' : 'O navegador não permitiu agora'); } catch { toast('Não suportado aqui'); } }, 'small')),
    h('div', { class: 'sec-t', style: 'margin-top:12px' }, 'Qualidade da prévia (não afeta a exportação)'),
    chips([['auto', 'Automática'], [480, 'Leve'], [640, 'Média'], [960, 'Alta']], q, (v) => { prefs.set('previewQ', v); toast('Vale a partir do próximo projeto que você abrir'); }),
    h('p', { class: 'note' }, 'Dica: a prévia reduz sozinha se o aparelho começar a engasgar.'));
  modal({ title: 'Configurações', body, wide: true, actions: [{ label: 'Fechar', cls: 'primary' }] });
});

// ======================= instalação PWA e permissões =======================
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (!isNative()) $('#btnInstall').hidden = false; });
$('#btnInstall').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; $('#btnInstall').hidden = true; });
window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; });

function firstRun() {
  if (prefs.get('onboarded', false)) return;
  modal({ title: 'Bem-vindo ao Max Editor 👋', dismissible: false, body: `
    <p>Para funcionar direitinho, o app usa:</p>
    <ul>
      <li><b>Armazenamento protegido</b> — guarda seus projetos e mídias para o sistema não apagar sozinho.</li>
      <li><b>Arquivos</b> — você escolhe quais vídeos/fotos/áudios importar pelo seletor do sistema (não lemos nada além disso).</li>
      <li><b>Microfone</b> — só é pedido quando você tocar em “Voz” para gravar narração.</li>
    </ul>`, actions: [
    { label: 'Agora não', onClick: () => { prefs.set('onboarded', true); } },
    { label: 'Permitir armazenamento', cls: 'primary', onClick: async () => { prefs.set('onboarded', true); try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {} } },
  ] });
}

// ======================= início =======================
$('#btnNew').addEventListener('click', newProjectDialog);
if ('serviceWorker' in navigator && !isNative() && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
runningVersion().then((v) => { $('#verLabel').textContent = 'v' + v; });
window.__maxEditor = { store, engine }; // útil para testes e depuração

(async function boot() {
  const last = session.getOpen();
  if (last) {
    try { if (await storage.loadProject(last)) { await openProject(last, { auto: true }); return; } } catch (e) { console.error(e); }
    session.clearOpen();
  }
  showHome();
  setTimeout(firstRun, 700);
})();
void FILTERS; void IMAGE_DUR;
