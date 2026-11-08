// Max Editor — aplicação principal (telas, projetos, autosave, importação, exportação, atualização)
import { APP_NAME, RATIOS, PREVIEW_LONG, isNative, parseRatio, fmtTime, IMAGE_DUR } from './config.js';
import { storage, mirrorProject, readMirror, session, prefs } from './storage.js';
import { Store, newProject, uid } from './state.js';
import { Engine, FILTERS } from './engine.js';
import { Timeline } from './timeline.js';
import { icon } from './icons.js';
import { buildPanel, SHEET_TITLES } from './panels.js';
import { importFiles, loadProjectMedia, freeMedia, clipFromMedia, textClip } from './media.js';
import { exportVideo, exportSize, pickMime, extFor } from './export.js';
import { saveVideo, safeName } from './files.js';
import { checkUpdate, applyUpdate, runningVersion } from './updater.js';
import { analyze } from './analyze.js';
import { Auth, validEmail } from './auth.js';
import { TEMPLATES } from './templates.js';
import { storageInfo, permStatus, requestPerms, allGranted, neededAliases, PERM_INFO, openSettings, notify } from './permissions.js';
import { USERNAME_RE } from './config.js';
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
  const me = ownerId();
  try { list = (await storage.listProjects()).filter((p) => !p.owner || p.owner === me); } catch (e) { console.error(e); toast('Não consegui ler os projetos salvos'); }
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
function showHome() { $('#editor').hidden = true; $('#auth').hidden = true; $('#perms').hidden = true; $('#home').hidden = false; setHomeTab(homeTab); renderHome(); }

function projectMenu(p) {
  const m = modal({ title: p.name, actions: [
    { label: 'Fechar' },
    { label: 'Duplicar', onClick: async () => { const rec = await storage.loadProject(p.id); const c = JSON.parse(JSON.stringify(rec)); c.id = uid(); c.name = rec.name + ' (cópia)'; c.created = c.updated = Date.now(); c.owner = ownerId();
        const ids = new Set(c.clips.map((x) => x.mediaId).filter(Boolean)); const map = {};
        try { for (const id of ids) { const m = await storage.getMedia(id); if (m) { const nid = uid(); map[id] = nid; await storage.putMedia(Object.assign({}, m, { id: nid, projectId: c.id })); } } } catch (e) { toast('Sem espaço para duplicar'); return; }
        c.clips.forEach((x) => { if (x.mediaId && map[x.mediaId]) x.mediaId = map[x.mediaId]; }); c.clips.forEach((x) => { x.id = uid(); });
        await storage.saveProject(c); renderHome(); toast('Projeto duplicado'); } },
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
      const p = newProject(name.value.trim() || 'Projeto', ratio, ownerId());
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
  for (const m of media.values()) { if (m.kind === 'audio') analyze(m).then(() => { if (tl && store.p) tl.render(); }); queueStrip(m); }
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
  $('#emptyHint').hidden = true;
  updateTime();
}
function updateTime() { $('#timeLabel').textContent = `${fmtTime(engine.time)} / ${fmtTime(store.duration())}`; }

tl = new Timeline($('#timeline'), store, engine);
tl.onTime = updateTime;
tl.onAddMain = () => addMenu();
tl.onTransition = (id) => { store.select(id); openSheet('trans'); };

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
  if (sheetKind && sheetKind !== 'ratio' && sheetKind !== 'stickers' && sheetKind !== 'captions' && sheetKind !== 'ai') closeSheet();
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
    const atHead = () => { const t = engine.time; const c = store.p.clips.filter((x) => (x.type === 'video' || x.type === 'image') && t >= x.start - 1e-6 && t < x.start + x.dur).sort((a, b) => a.lane - b.lane)[0]; if (!c) { toast('Coloque a linha branca sobre um clipe'); return false; } store.select(c.id); return true; };
    add('filter', 'Filtros', () => { if (atHead()) openSheet('filters'); });
    add('fx', 'Efeitos', () => { if (atHead()) openSheet('effects'); });
    add('music', 'Batida', () => { if (atHead()) openSheet('beat'); });
    add('bot', 'Assistente', () => openSheet('ai'));
    add('spark', 'Inteligente', () => openSheet('smart'));
    add('smile', 'Adesivos', () => openSheet('stickers'));
    add('captions', 'Legendas', () => openSheet('captions'));
    add('ratio', 'Projeto', () => openSheet('ratio'));
    return;
  }
  add('close', 'Fechar', () => store.select(null), 'back');
  add('bot', 'Assistente', () => openSheet('ai'));
  add('split', 'Dividir', splitSelected);
  if (c.type === 'video' || c.type === 'audio') add('spark', 'Inteligente', () => openSheet('smart'));
  if (c.type === 'text') add('edit', 'Texto', () => openSheet('text'));
  if (c.type === 'video' || c.type === 'audio') add('volume', 'Volume', () => openSheet('volume'));
  if (c.type === 'video' || c.type === 'audio') add('speed', 'Velocidade', () => openSheet('speed'));
  if (c.type === 'video' || c.type === 'image') add('filter', 'Filtros', () => openSheet('filters'));
  if (c.type !== 'audio') add('adjust', 'Ajustes', () => openSheet('adjust'));
  if (c.type !== 'audio') add('anim', 'Animação', () => openSheet('anim'));
  if (c.type !== 'audio') add('music', 'Batida', () => openSheet('beat'));
  if (c.type === 'video' || c.type === 'audio') add('volume', c.vol === 0 ? 'Ativar áudio' : 'Silenciar', () => { store.update(c.id, { vol: c.vol === 0 ? 1 : 0 }); renderToolbar(); });
  if (c.type !== 'audio') add('fx', 'Efeitos', () => openSheet('effects'));
  if (c.type !== 'audio') add('diamond', 'Keyframes', () => openSheet('keyframes'));
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
  const panel = buildPanel(kind, { store, engine, toast, pickBg, freeze: freezeFrame, saveFrame, closeSheet: () => closeSheet(), openSheet: (k) => openSheet(k, true) });
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
function addMenu() {
  const m = modal({ title: 'Adicionar', body: h('div', { class: 'addmenu' },
    ...[['video', 'Vídeo', 'video/*', 'main'], ['image', 'Foto', 'image/*', 'main'], ['music', 'Áudio / música', 'audio/*', 'audio'], ['layers', 'Sobrepor (vídeo ou foto)', 'video/*,image/*', 'overlay'], ['image', 'Foto de fundo', 'image/*', 'bg']].map(([ic, label, acc, tg]) => {
      const b = h('button', { class: 'addopt', type: 'button', html: icon(ic) }, h('span', {}, label));
      b.addEventListener('click', () => { m.close(); if (tg === 'bg') pickBg(); else pick(tg, null, acc); });
      return b;
    })) });
}
async function pickBg() {
  const f = await pickFiles('image/*'); if (!f.length) return;
  const { media, errors } = await importFiles([f[0]], store);
  if (!media.length) { toast(errors[0] || 'Não consegui abrir a foto'); return; }
  store.mutate((p) => { p.bgMedia = media[0].id; p.bgMode = 'image'; }); engine.loadImage(media[0].id); toast('Foto de fundo definida ✓');
}
function pick(target, at, accept) {
  pendingTarget = target; pendingAt = at == null ? null : at;
  fileIn.accept = accept || (target === 'audio' ? 'audio/*' : 'video/*,image/*');
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
    for (const m of media) { if (m.kind === 'audio') analyze(m).then(() => { if (tl && store.p) tl.render(); }); queueStrip(m); }
    if (store.duration() > 0 && media.length) tl.fit();
    toast(`${media.length} arquivo${media.length > 1 ? 's' : ''} adicionado${media.length > 1 ? 's' : ''}`);
  } else $('#toast').classList.remove('show');
  if (errors.length) modal({ title: 'Alguns arquivos não foram adicionados', body: `<ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`, actions: [{ label: 'Ok', cls: 'primary' }] });
  void last;
}

// ======================= faixa de miniaturas (filmstrip) =======================
const stripQ = []; let stripBusy = false;
function queueStrip(m) { if (m.kind !== 'video' || m.strip || m.stripTried) return; m.stripTried = true; stripQ.push(m); if (!stripBusy) runStrip(); }
async function runStrip() {
  stripBusy = true;
  while (stripQ.length) { const m = stripQ.shift(); try { await makeStrip(m); if (tl && store.p) tl.render(); } catch { /* sem miniaturas: segue com a imagem única */ } }
  stripBusy = false;
}
async function makeStrip(m) {
  const N = Math.min(14, Math.max(4, Math.ceil(m.dur / 2)));
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = m.url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; });
  const fh = 48, fw = Math.round(fh * ((v.videoWidth / v.videoHeight) || 1.78));
  const cn = document.createElement('canvas'); cn.width = fw * N; cn.height = fh; const x = cn.getContext('2d');
  for (let i = 0; i < N; i++) { await new Promise((res) => { v.onseeked = res; v.currentTime = Math.min(Math.max(0, m.dur - 0.05), (i + 0.5) * m.dur / N); }); x.drawImage(v, i * fw, 0, fw, fh); }
  v.removeAttribute('src'); v.load();
  m.strip = cn.toDataURL('image/jpeg', 0.6);
}

// ======================= quadro: congelar / salvar foto =======================
async function freezeFrame() {
  const c = store.selected();
  if (!c || c.type !== 'video') { toast('Selecione um vídeo na timeline'); return; }
  const m = store.media.get(c.mediaId), t = engine.time;
  if (t - c.start < 0.15 || c.start + c.dur - t < 0.15) { toast('Coloque a linha branca no meio do clipe'); return; }
  engine.pause(); toast('Congelando quadro…', 20000);
  try {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = m.url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('vídeo')); });
    await new Promise((res) => { v.onseeked = res; v.currentTime = c.in + (t - c.start) * c.speed; });
    const cn = document.createElement('canvas'); cn.width = v.videoWidth; cn.height = v.videoHeight; cn.getContext('2d').drawImage(v, 0, 0);
    v.removeAttribute('src'); v.load();
    const blob = await new Promise((r) => cn.toBlob(r, 'image/jpeg', 0.92));
    const { media } = await importFiles([new File([blob], 'Quadro congelado.jpg', { type: 'image/jpeg' })], store);
    if (!media.length) throw new Error('importar');
    if (!store.split(c.id, t)) throw new Error('dividir');
    store.mutate((p) => { const im = clipFromMedia(media[0], c.lane, t - 0.001); Object.assign(im, { dur: 2, fit: c.fit, x: c.x, y: c.y, scale: c.scale, rot: c.rot, flip: c.flip, filter: c.filter }); p.clips.push(im); });
    toast('Quadro congelado por 2s ✓');
  } catch (e) { console.error(e); toast('Não consegui congelar este quadro'); }
}
async function saveFrame() {
  if (!store.p) return;
  engine.pause();
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  if (!blob) { toast('Não consegui gerar a foto'); return; }
  try { const r = await saveVideo(blob, `${safeName(store.p.name)}-quadro.png`); toast('Foto salva em: ' + r.where, 4000); } catch (e) { toast('Não consegui salvar a foto'); }
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
    if (document.hidden) notify('Max Editor', 'Seu vídeo está pronto!');
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
  else if (k === 'm' && !mod) { store.mutate((p) => { p.markers = (p.markers || []).concat([+engine.time.toFixed(3)]); }); toast('Marcador adicionado'); }
  else if (k === 'f' && !mod) { freezeFrame(); }
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
  const dev = await storageInfo();
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const mb = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(1).replace('.', ',') + ' GB' : Math.round(n / 1048576) + ' MB');
  const q = prefs.get('previewQ', 'auto');
  const body = h('div', {},
    h('div', { class: 'row' }, h('div', {}, h('b', {}, `${APP_NAME} v${ver}`), h('div', { class: 'note' }, isNative() ? 'App Android (APK)' : 'Site / PWA')), btn('Verificar update', 'refresh', () => runUpdateCheck(true), 'small')),
    h('div', { class: 'row' }, h('div', {}, h('b', {}, 'Armazenamento'), h('div', { class: 'note' }, dev ? `Max Editor usa ${mb(est ? est.usage || 0 : 0)} · Aparelho: ${mb(dev.free)} livres de ${mb(dev.total)}` : est ? `Max Editor usa ${mb(est.usage || 0)} neste navegador · dados ${persisted ? 'protegidos' : 'não protegidos'}` : 'indisponível')),
      persisted || isNative() ? null : btn('Proteger', 'check', async () => { try { const ok = await navigator.storage.persist(); toast(ok ? 'Dados protegidos contra limpeza automática ✓' : 'O navegador não permitiu agora'); } catch { toast('Não suportado aqui'); } }, 'small')),
    h('div', { class: 'sec-t', style: 'margin-top:12px' }, 'Qualidade da prévia (não afeta a exportação)'),
    chips([['auto', 'Automática'], [480, 'Leve'], [640, 'Média'], [960, 'Alta']], q, (v) => { prefs.set('previewQ', v); toast('Vale a partir do próximo projeto que você abrir'); }),
    h('p', { class: 'note' }, 'Dica: a prévia reduz sozinha se o aparelho começar a engasgar.'));
  modal({ title: 'Configurações', body, wide: true, actions: [{ label: 'Fechar', cls: 'primary' }] });
});

// ======================= instalação PWA e permissões =======================
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; });

// ======================= início =======================
$('#btnNew').addEventListener('click', newProjectDialog);
if ('serviceWorker' in navigator && !isNative() && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
runningVersion().then((v) => { $('#verLabel').textContent = 'v' + v; });
window.__maxEditor = { store, engine }; // útil para testes e depuração


// ======================= login / abas / permissões =======================
let homeTab = 'projects', authMode = 'in', lastUid = null;
function ownerId() { const u = Auth.user(); return u ? u.id : null; }

function setHomeTab(n) {
  homeTab = n;
  $('#tabProjects').hidden = n !== 'projects'; $('#tabTemplates').hidden = n !== 'templates'; $('#tabProfile').hidden = n !== 'profile';
  $('.home-hero').hidden = n !== 'projects';
  $$('#homeTabs .htab').forEach((b) => b.classList.toggle('on', b.dataset.t === n));
  if (n === 'templates') renderTemplates();
  if (n === 'profile') renderProfile();
  $('#home').scrollTop = 0;
}
$$('#homeTabs .htab').forEach((b) => b.addEventListener('click', () => setHomeTab(b.dataset.t)));

function pickFiles(accept) {
  return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = accept; i.onchange = () => res(Array.from(i.files || [])); i.oncancel = () => res([]); i.click(); });
}
function renderTemplates() {
  const g = $('#tplList'); g.innerHTML = '';
  for (const t of TEMPLATES) {
    const b = h('button', { class: 'tpl', type: 'button', style: `--g:${t.grad}` }, h('div', { class: 'tpl-art' }, h('span', {}, t.emoji), h('i', {}, t.ratio)), h('div', { class: 'tpl-meta' }, h('b', {}, t.name), h('small', {}, t.desc)));
    b.addEventListener('click', () => useTemplate(t));
    g.append(b);
  }
}
async function useTemplate(t) {
  let files = [];
  if (t.media) { files = await pickFiles('video/*,image/*'); if (!files.length) return; }
  const p = newProject(t.name, t.ratio, ownerId());
  try { await storage.saveProject(p); } catch { toast('Não consegui criar o projeto (sem espaço?)'); return; }
  await openProject(p.id);
  if (!store.p) return;
  toast('Montando o modelo…', 60000);
  let media = [], errors = [];
  if (files.length) ({ media, errors } = await importFiles(files, store));
  if (t.media && !media.length) { toast('Nenhuma mídia válida'); return; }
  t.apply(store, media);
  if (store.duration() > 0) tl.fit();
  engine.seek(0); toast('Modelo pronto! Personalize como quiser.');
  if (errors.length) toast(errors[0], 4000);
}

function renderProfile() {
  const u = Auth.user(); const box = $('#profileBox'); box.innerHTML = '';
  if (!u) return;
  const row = (ic, title, sub, fn, cls = '') => { const r = h('button', { class: 'prow ' + cls, type: 'button', html: icon(ic) }, h('div', {}, h('b', {}, title), sub ? h('small', {}, sub) : null)); r.addEventListener('click', fn); return r; };
  box.append(h('div', { class: 'pcard' }, h('div', { class: 'avatar' }, (u.username || u.email || '?')[0].toUpperCase()), h('div', {}, h('b', {}, u.username ? '@' + u.username : 'Sem nome de usuário'), h('small', {}, u.email))));
  const list = h('div', { class: 'plist' });
  if (isNative()) list.append(row('shield', 'Permissões do app', 'Microfone, mídia e notificações', async () => { const st = await permStatus(); if (st && !allGranted(st)) showPerms(true); else toast('Todas as permissões já estão liberadas ✓'); }));
  list.append(row('gear', 'Configurações', 'Qualidade da prévia, armazenamento, atualização', () => $('#btnSettings').click()));
  list.append(row('refresh', 'Verificar atualização', `Versão instalada: ${$('#verLabel').textContent}`, () => runUpdateCheck(true)));
  list.append(row('star', 'Novidades', 'O que tem de novo', showNews));
  list.append(row('lock', 'Alterar senha', '', async () => {
    const inp = h('input', { class: 'field', type: 'password', placeholder: 'Nova senha (mín. 6)', maxlength: '72', autocomplete: 'new-password' });
    modal({ title: 'Alterar senha', body: inp, actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', onClick: async () => { if (inp.value.length < 6) { toast('Mínimo de 6 caracteres'); return false; } try { await Auth.updatePassword(inp.value); toast('Senha alterada ✓'); } catch (e) { toast(e.message); return false; } } }] });
  }));
  if (installEvt) list.append(row('download', 'Instalar o app', 'Adicionar à tela inicial', installPwa));
  list.append(row('logout', 'Sair da conta', 'Seus projetos ficam salvos neste aparelho', async () => { if (await confirmBox('Sair da conta?', 'Sair', true)) Auth.signOut(); }, 'danger'));
  box.append(list);
}
function showNews() {
  modal({ title: 'Novidades da versão', body: `<ul><li>Conta com e-mail, senha e nome de usuário único</li><li>Abas: Projetos, Modelos e Perfil</li><li>Keyframes, máscaras, mistura, chroma key e efeitos</li><li>Texto com estilos prontos, neon e digitação</li><li>Adesivos, legendas rápidas e fundo desfocado</li><li>Permissões reais no app Android</li></ul>`, actions: [{ label: 'Legal!', cls: 'primary' }] });
}
async function installPwa() { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; }

// ----- tela de login -----
function setAuthMode(m) {
  authMode = m;
  $$('#authTabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('#fUserWrap').hidden = m !== 'up'; $('#fUserHint').textContent = '';
  $('#authGo').textContent = m === 'up' ? 'Criar conta' : 'Entrar';
  $('#authForgot').hidden = m === 'up';
  $('#fPass').autocomplete = m === 'up' ? 'new-password' : 'current-password';
  authMsg('');
}
function authMsg(t, ok) { const e = $('#authMsg'); e.textContent = t; e.className = 'auth-msg' + (ok ? ' ok' : ''); }
$$('#authTabs .tab').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.m)));
$('#togglePass').addEventListener('click', () => { const i = $('#fPass'); i.type = i.type === 'password' ? 'text' : 'password'; });
let hintTimer = 0;
$('#fUser').addEventListener('input', () => {
  const v = $('#fUser').value.trim(), el = $('#fUserHint'); clearTimeout(hintTimer);
  if (!v) { el.textContent = ''; return; }
  if (!USERNAME_RE.test(v)) { el.textContent = '3–20 caracteres: letras, números, _ e .'; el.className = 'hint bad'; return; }
  el.textContent = 'Verificando…'; el.className = 'hint';
  hintTimer = setTimeout(async () => { try { const ok = await Auth.usernameAvailable(v); if ($('#fUser').value.trim() === v) { el.textContent = ok ? '✓ Nome disponível' : 'Já está em uso'; el.className = 'hint ' + (ok ? 'good' : 'bad'); } } catch { el.textContent = ''; } }, 450);
});
$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#fEmail').value.trim(), pass = $('#fPass').value, user = $('#fUser').value.trim();
  if (!validEmail(email)) return authMsg('Digite um e-mail válido.');
  if (authMode === 'up') {
    if (!USERNAME_RE.test(user)) return authMsg('Nome de usuário: 3 a 20 caracteres (letras, números, _ ou .).');
    if (pass.length < 6) return authMsg('A senha precisa ter pelo menos 6 caracteres.');
  } else if (!pass) return authMsg('Digite sua senha.');
  const go = $('#authGo'); go.disabled = true; authMsg('Aguarde…', true);
  try {
    if (authMode === 'up') {
      let free = true; try { free = await Auth.usernameAvailable(user); } catch { /* o servidor também garante */ }
      if (!free) { authMsg('Esse nome de usuário já está em uso. Escolha outro.'); return; }
      const r = await Auth.signUp({ email, password: pass, username: user });
      if (!r.signedIn) { setAuthMode('in'); authMsg('Conta criada! Enviamos um e-mail: abra o link de confirmação e depois entre aqui.', true); }
    } else await Auth.signIn({ email, password: pass });
  } catch (err) { authMsg(err.message || 'Não foi possível continuar.'); }
  finally { go.disabled = false; }
});
$('#authForgot').addEventListener('click', async () => {
  const email = $('#fEmail').value.trim();
  if (!validEmail(email)) return authMsg('Digite seu e-mail acima e toque de novo.');
  try { await Auth.recover(email); authMsg('Se o e-mail existir, enviamos o link para criar uma nova senha.', true); } catch (e) { authMsg(e.message); }
});

// ----- tela de permissões (só no APK) -----
async function showPerms(manual) {
  const st = await permStatus();
  if (!st || allGranted(st)) { if (!manual) showHome(); return; }
  const list = $('#permList'); list.innerHTML = '';
  for (const k of neededAliases(st)) {
    const i = PERM_INFO[k], ok = st[k] === 'granted';
    list.append(h('div', { class: 'perm' + (ok ? ' ok' : '') }, h('span', { class: 'pi', html: icon(i.icon) }), h('div', {}, h('b', {}, i.title), h('small', {}, i.why)), h('em', {}, ok ? '✓' : '')));
  }
  $('#permMsg').textContent = ''; $('#permSettings').hidden = true;
  $('#home').hidden = true; $('#auth').hidden = true; $('#perms').hidden = false;
}
$('#permAllow').addEventListener('click', async () => {
  const st = await requestPerms();
  if (!st || allGranted(st)) { toast('Permissões liberadas ✓'); showHome(); return; }
  const denied = neededAliases(st).filter((k) => st[k] !== 'granted');
  $('#permMsg').textContent = 'Algumas permissões não foram liberadas: ' + denied.map((k) => PERM_INFO[k].title).join(', ') + '. Se o Android não perguntar de novo, abra as configurações e permita manualmente.';
  $('#permSettings').hidden = false;
  showPermsList(st);
});
function showPermsList(st) {
  const list = $('#permList'); list.innerHTML = '';
  for (const k of neededAliases(st)) { const i = PERM_INFO[k], ok = st[k] === 'granted'; list.append(h('div', { class: 'perm' + (ok ? ' ok' : '') }, h('span', { class: 'pi', html: icon(i.icon) }), h('div', {}, h('b', {}, i.title), h('small', {}, i.why)), h('em', {}, ok ? '✓' : ''))); }
}
$('#permSettings').addEventListener('click', () => openSettings());
$('#permSkip').addEventListener('click', () => { prefs.set('permSkipped', true); showHome(); });
document.addEventListener('visibilitychange', async () => { if (!document.hidden && !$('#perms').hidden) { const st = await permStatus(); if (st) { showPermsList(st); if (allGranted(st)) showHome(); } } });

// ----- entrada / saída da conta -----
async function enterApp() {
  if (store.p) return;
  if (isNative() && !prefs.get('permSkipped', false)) { const st = await permStatus(); if (st && !allGranted(st)) { showPerms(); return; } }
  showHome();
}
async function leaveApp() {
  if (store.p) await closeEditor(false);
  $('#home').hidden = true; $('#editor').hidden = true; $('#perms').hidden = true; $('#auth').hidden = false; $('#fPass').value = '';
  setAuthMode('in');
}

(async function boot() {
  const hr = await Auth.handleHash();
  await Auth.init();
  if (hr && hr.error) setTimeout(() => toast(hr.error, 5000), 300);
  const u = Auth.user();
  lastUid = u ? u.id : null;
  Auth.onChange((nu) => { const id = nu ? nu.id : null; if (id === lastUid) return; lastUid = id; if (id) enterApp(); else leaveApp(); });
  if (!u) { setAuthMode('in'); $('#auth').hidden = false; return; }
  if (hr && hr.type === 'recovery') { setTimeout(() => { $('#home').hidden = false; setHomeTab('profile'); toast('Defina uma nova senha em “Alterar senha”', 6000); }, 400); }
  else if (hr && !hr.error) setTimeout(() => toast('E-mail confirmado ✓'), 400);
  session.clearOpen(); // o app sempre abre na tela inicial; o projeto fica salvo e aparece em “Meus projetos”
  enterApp();
})();
void FILTERS; void IMAGE_DUR;
