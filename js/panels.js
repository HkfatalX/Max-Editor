// Max Editor — painéis de edição (folhas inferiores / painel lateral no PC)
import { RATIOS } from './config.js';
import { FILTERS, ANIMS_IN, ANIMS_OUT, TRANSITIONS, FONT_NAMES } from './engine.js';
import { h, slider, chips, swatches, btn, section, COLORS } from './ui.js';

const pct = (v) => Math.round(v * 100) + '%';

export function buildPanel(kind, ctx) {
  const { store, engine } = ctx;
  const c = store.selected();
  const cur = () => (c ? store.clip(c.id) || c : null); // estado atual (o objeto muda após desfazer)
  const set = (patch, key) => store.update(c.id, patch, key);
  const root = h('div', { class: 'panel' });

  if (kind === 'adjust' && c) {
    const visual = c.type === 'video' || c.type === 'image';
    root.append(section('Posição e tamanho',
      slider({ label: 'Escala', min: 0.1, max: 4, step: 0.01, value: c.scale, fmt: pct, onInput: (v) => set({ scale: v }, 'scale') }),
      slider({ label: 'Rotação', min: -180, max: 180, step: 1, value: c.rot, fmt: (v) => v + '°', onInput: (v) => set({ rot: v }, 'rot') }),
      slider({ label: 'Opacidade', min: 0, max: 100, step: 1, value: Math.round(c.opacity * 100), fmt: (v) => v + '%', onInput: (v) => set({ opacity: v / 100 }, 'opacity') }),
    ));
    if (visual) {
      root.append(section('Cor',
        ...[['b', 'Brilho'], ['c', 'Contraste'], ['s', 'Saturação'], ['h', 'Matiz']].map(([k, label]) =>
          slider({ label, min: -100, max: 100, step: 1, value: c.adj[k], onInput: (v) => set({ adj: { [k]: v } }, 'adj' + k) })),
      ));
      root.append(section('', h('div', { class: 'btn-row' },
        btn(c.fit === 'cover' ? 'Ajustar à tela' : 'Preencher tela', 'fit', () => { set({ fit: cur().fit === 'cover' ? 'contain' : 'cover' }); ctx.openSheet('adjust'); }),
        btn('Espelhar', 'flip', () => { set({ flip: !cur().flip }); }),
        btn('Girar 90°', 'rotate', () => { set({ rot: ((cur().rot + 90 + 180) % 360) - 180 }); ctx.openSheet('adjust'); }),
      )));
    }
    root.append(h('div', { class: 'btn-row' }, btn('Centralizar', 'fit', () => { set({ x: 0, y: 0, scale: c.lane === 1 ? 0.5 : 1, rot: 0 }); ctx.openSheet('adjust'); })));
  }

  else if (kind === 'filters' && c) {
    root.append(section('Filtros', chips(FILTERS.map((f) => [f.id, f.name, f.sw]), c.filter, (id) => set({ filter: id }))));
    if (!engine.filterOK) root.append(h('p', { class: 'note' }, 'Este navegador não suporta filtros no canvas. No APK e no Chrome funcionam normalmente.'));
  }

  else if (kind === 'speed' && c) {
    const media = store.media.get(c.mediaId);
    const apply = (v) => {
      const now = cur();
      const span = now.dur * now.speed; // trecho de origem se mantém; a duração na timeline muda
      set({ speed: v, dur: Math.max(0.1, span / v) });
    };
    const s = slider({ label: 'Velocidade', min: 0.25, max: 4, step: 0.05, value: c.speed, fmt: (v) => v.toFixed(2) + 'x', onChange: (v) => { apply(v); } });
    root.append(section('Velocidade', s, h('div', { class: 'btn-row' }, ...[0.5, 1, 1.5, 2, 3].map((v) => btn(v + 'x', '', () => { apply(v); ctx.openSheet('speed'); })))));
    if (media && c.type === 'video') root.append(h('p', { class: 'note' }, 'Ao mudar a velocidade a duração do clipe se ajusta automaticamente.'));
  }

  else if (kind === 'volume' && c) {
    root.append(section('Volume',
      slider({ label: 'Volume', min: 0, max: 200, step: 1, value: Math.round(c.vol * 100), fmt: (v) => v + '%', onInput: (v) => set({ vol: v / 100 }, 'vol') }),
      slider({ label: 'Surgir', min: 0, max: 5, step: 0.1, value: c.fadeIn, fmt: (v) => v.toFixed(1) + 's', onInput: (v) => set({ fadeIn: v }, 'fi') }),
      slider({ label: 'Sumir', min: 0, max: 5, step: 0.1, value: c.fadeOut, fmt: (v) => v.toFixed(1) + 's', onInput: (v) => set({ fadeOut: v }, 'fo') }),
    ));
  }

  else if (kind === 'anim' && c) {
    root.append(section('Entrada', chips(ANIMS_IN.map((a) => [a[0], a[1]]), c.animIn, (id) => { set({ animIn: id }); engine.seek(c.start); })));
    root.append(section('Saída', chips(ANIMS_OUT.map((a) => [a[0], a[1]]), c.animOut, (id) => { set({ animOut: id }); engine.seek(Math.max(c.start, c.start + c.dur - c.animDur * 0.5)); })));
    root.append(section('', slider({ label: 'Duração', min: 0.1, max: Math.max(0.2, Math.min(2, c.dur / 2)), step: 0.05, value: Math.min(c.animDur, Math.max(0.2, c.dur / 2)), fmt: (v) => v.toFixed(2) + 's', onInput: (v) => set({ animDur: v }, 'ad') })));
  }

  else if (kind === 'trans' && c && c.lane === 0) {
    const first = store.lane(0)[0];
    if (first && first.id === c.id) root.append(h('p', { class: 'note' }, 'A transição fica entre dois clipes: selecione o segundo clipe (ou um posterior).'));
    else {
      root.append(section('Transição antes deste clipe', chips(TRANSITIONS, c.trans, (id) => { set({ trans: id }); engine.seek(Math.max(0, c.start - 0.25)); })));
      root.append(section('', slider({ label: 'Duração', min: 0.2, max: 2, step: 0.1, value: c.transDur, fmt: (v) => v.toFixed(1) + 's', onInput: (v) => set({ transDur: v }, 'td') })));
    }
  }

  else if (kind === 'text' && c && c.type === 'text') {
    const t = c.text;
    const setT = (patch, key) => set({ text: patch }, key || 'txt');
    const area = h('textarea', { class: 'field', rows: '3', maxlength: '300', placeholder: 'Digite o texto…' });
    area.value = t.str;
    area.addEventListener('input', () => setT({ str: area.value }, 'txtstr'));
    root.append(section('Texto', area));
    root.append(section('Estilo',
      slider({ label: 'Tamanho', min: 0.02, max: 0.3, step: 0.005, value: t.size, fmt: (v) => Math.round(v * 100), onInput: (v) => setT({ size: v }, 'tsize') }),
      h('div', { class: 'btn-row' },
        btn('Negrito', '', (e) => { const v = !cur().text.bold; setT({ bold: v }); e.currentTarget.classList.toggle('on', v); }, t.bold ? 'on' : ''),
        btn('Itálico', '', (e) => { const v = !cur().text.italic; setT({ italic: v }); e.currentTarget.classList.toggle('on', v); }, t.italic ? 'on' : ''),
        btn('Esq.', '', () => setT({ align: 'left' })), btn('Centro', '', () => setT({ align: 'center' })), btn('Dir.', '', () => setT({ align: 'right' })),
      ),
      chips(Object.keys(FONT_NAMES).map((k) => [k, FONT_NAMES[k]]), t.font, (id) => setT({ font: id })),
    ));
    root.append(section('Cor do texto', swatches(COLORS, t.color, (col) => setT({ color: col }, 'tcol'))));
    root.append(section('Fundo', swatches(COLORS, t.bg, (col) => setT({ bg: col }, 'tbg'), true)));
    root.append(section('Contorno', swatches(COLORS, t.stroke, (col) => setT({ stroke: col }, 'tst')),
      slider({ label: 'Espessura', min: 0, max: 0.3, step: 0.01, value: t.strokeW, fmt: (v) => Math.round(v * 100), onInput: (v) => setT({ strokeW: v }, 'tsw') })));
  }

  else if (kind === 'ratio') {
    const p = store.p;
    const grid = h('div', { class: 'ratio-grid' });
    for (const r of RATIOS) {
      const b = h('button', { class: 'ratio' + (p.ratio === r.id ? ' on' : ''), type: 'button' },
        h('i', { class: 'rbox', style: `aspect-ratio:${r.w}/${r.h};${r.w >= r.h ? 'width:34px' : 'height:34px'}` }),
        h('b', {}, r.id), h('small', {}, r.hint));
      b.addEventListener('click', () => { store.setRatio(r.id); ctx.openSheet('ratio'); });
      grid.append(b);
    }
    root.append(section('Proporção do vídeo', grid));
    const first = store.lane(0).find((x) => store.media.get(x.mediaId) && store.media.get(x.mediaId).w);
    if (first) {
      const m = store.media.get(first.mediaId);
      root.append(h('div', { class: 'btn-row' }, btn('Igual ao 1º vídeo', 'video', () => {
        const g = (a, b) => (b ? g(b, a % b) : a); const d = g(m.w, m.h);
        store.setRatio(`${m.w / d}:${m.h / d}`);
        ctx.openSheet('ratio');
      })));
    }
    root.append(section('Cor de fundo', swatches(['#000000', '#ffffff', '#0b1020', '#1b1b1b', '#ff3b5c', '#2ec4ff', '#3ddc84', '#ffe14d'], p.bg, (col) => store.setBg(col))));
  }

  else root.append(h('p', { class: 'note' }, 'Selecione um clipe para editar.'));
  return root;
}

export const SHEET_TITLES = { adjust: 'Ajustes', filters: 'Filtros', speed: 'Velocidade', volume: 'Volume', anim: 'Animações', trans: 'Transição', text: 'Texto', ratio: 'Proporção e fundo' };
