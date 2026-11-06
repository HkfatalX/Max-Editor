// Max Editor — utilitários de interface: toasts, diálogos, botão "voltar" e controles de formulário
import { icon } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k of Object.keys(attrs || {})) {
    const v = attrs[k];
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

// ---------- botão voltar (Android/navegador): pilha de "fechadores" ----------
const backStack = [];
let ignorePop = 0;
export function pushBack(fn) {
  backStack.push(fn);
  try { history.pushState({ b: backStack.length }, ''); } catch {}
  return fn;
}
export function removeBack(fn) {
  const i = backStack.lastIndexOf(fn);
  if (i < 0) return;
  backStack.splice(i, 1);
  ignorePop++;
  try { history.back(); } catch { ignorePop = 0; }
}
window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  const fn = backStack.pop();
  if (fn) fn(true);
});

// ---------- toasts ----------
let toastTimer = 0;
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- diálogo modal ----------
export function modal({ title, body, actions = [], dismissible = true, wide = false }) {
  const root = $('#modals');
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' });
  if (title) box.append(h('h3', {}, title));
  const content = h('div', { class: 'modal-body' });
  if (typeof body === 'string') content.innerHTML = body; else if (body) content.append(body);
  box.append(content);
  let closed = false, backFn = null;
  const api = {
    el: box, content,
    close(fromBack) {
      if (closed) return; closed = true;
      back.remove();
      if (!fromBack) removeBack(backFn);
      if (api.onClose) api.onClose();
    },
  };
  if (actions.length) {
    const bar = h('div', { class: 'modal-actions' });
    for (const a of actions) {
      bar.append(h('button', { class: 'btn ' + (a.cls || ''), onclick: () => { if (!a.onClick || a.onClick(api) !== false) api.close(); } }, a.label));
    }
    box.append(bar);
  }
  back.append(box); root.append(back);
  if (dismissible) back.addEventListener('pointerdown', (e) => { if (e.target === back) api.close(); });
  backFn = pushBack((fromBack) => { if (dismissible) api.close(fromBack); else { pushBack(backFn); } });
  return api;
}

export function confirmBox(message, okLabel = 'Confirmar', danger = false) {
  return new Promise((res) => {
    let answered = false;
    const m = modal({ title: message, actions: [
      { label: 'Cancelar', onClick: () => { answered = true; res(false); } },
      { label: okLabel, cls: danger ? 'danger' : 'primary', onClick: () => { answered = true; res(true); } },
    ] });
    m.onClose = () => { if (!answered) res(false); };
  });
}

export function promptBox(title, value = '', okLabel = 'Salvar') {
  return new Promise((res) => {
    const input = h('input', { type: 'text', class: 'field', value, maxlength: '60' });
    let answered = false;
    const m = modal({ title, body: input, actions: [
      { label: 'Cancelar', onClick: () => { answered = true; res(null); } },
      { label: okLabel, cls: 'primary', onClick: () => { answered = true; res(input.value.trim() || value); } },
    ] });
    m.onClose = () => { if (!answered) res(null); };
    setTimeout(() => { input.focus(); input.select(); }, 60);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { answered = true; res(input.value.trim() || value); m.close(); } });
  });
}

// ---------- controles reutilizáveis ----------
export function slider({ label, min, max, step, value, fmt = (v) => v, onInput, onChange }) {
  const val = h('span', { class: 'sv' }, fmt(value));
  const inp = h('input', { type: 'range', min, max, step, value });
  inp.addEventListener('input', () => { const v = parseFloat(inp.value); val.textContent = fmt(v); if (onInput) onInput(v); });
  if (onChange) inp.addEventListener('change', () => onChange(parseFloat(inp.value)));
  return h('label', { class: 'sl' }, h('span', { class: 'sn' }, label), inp, val);
}

export function chips(options, current, onPick) {
  const wrap = h('div', { class: 'chips' });
  for (const o of options) {
    const [id, name, color] = o;
    const b = h('button', { class: 'chip' + (id === current ? ' on' : ''), type: 'button' },
      color ? h('i', { class: 'dot', style: `background:${color}` }) : null, name);
    b.addEventListener('click', () => { $$('.chip', wrap).forEach((x) => x.classList.remove('on')); b.classList.add('on'); onPick(id); });
    wrap.append(b);
  }
  return wrap;
}

export function swatches(colors, current, onPick, allowNone) {
  const wrap = h('div', { class: 'swatches' });
  const list = allowNone ? [''].concat(colors) : colors;
  for (const col of list) {
    const b = h('button', { class: 'sw' + (col === current ? ' on' : '') + (col === '' ? ' none' : ''), type: 'button', style: col ? `background:${col}` : '', 'aria-label': col || 'nenhum' });
    b.addEventListener('click', () => { $$('.sw', wrap).forEach((x) => x.classList.remove('on')); b.classList.add('on'); onPick(col); });
    wrap.append(b);
  }
  const pick = h('input', { type: 'color', class: 'sw-pick', value: /^#/.test(current || '') ? current : '#ffffff', 'aria-label': 'cor personalizada' });
  pick.addEventListener('input', () => { $$('.sw', wrap).forEach((x) => x.classList.remove('on')); onPick(pick.value); });
  wrap.append(pick);
  return wrap;
}

export function btn(label, ic, onClick, cls = '') {
  const b = h('button', { class: 'btn ' + cls, type: 'button' });
  b.innerHTML = (ic ? icon(ic) : '') + `<span>${esc(label)}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

export function section(title, ...kids) { return h('div', { class: 'sec' }, title ? h('div', { class: 'sec-t' }, title) : null, ...kids); }

export const COLORS = ['#ffffff', '#000000', '#ff3b5c', '#ff9f1c', '#ffe14d', '#3ddc84', '#2ec4ff', '#5b8cff', '#b14dff', '#ff6ec7'];
