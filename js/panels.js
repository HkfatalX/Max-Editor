// Max Editor — painéis de edição (folha inferior no celular / painel lateral no PC)
import { RATIOS } from './config.js';
import { FILTERS, ANIMS_IN, ANIMS_OUT, TRANSITIONS, BEATS, FONT_NAMES, LOOPS, BLENDS, MASKS } from './engine.js';
import { makeClip, defaultText, uid } from './state.js';
import { analyze, beats, silences } from './analyze.js';
import { MIN_DUR } from './config.js';
import { h, slider, chips, swatches, btn, section, tabs, toggle, COLORS } from './ui.js';

const pct = (v) => Math.round(v * 100) + '%';
const fx2 = (v) => v.toFixed(2);

export const SHEET_TITLES = { adjust: 'Ajustes', filters: 'Filtros', effects: 'Efeitos', keyframes: 'Keyframes', speed: 'Velocidade', volume: 'Volume', anim: 'Animações', trans: 'Transição', text: 'Texto', ratio: 'Projeto', stickers: 'Adesivos', captions: 'Legendas rápidas', smart: 'Inteligente', beat: 'Batida' };

const TEXT_PRESETS = [
  ['Clássico', { color: '#ffffff', stroke: '#000000', strokeW: 0.12, bg: '', font: 'sans', bold: true, italic: false, upper: false, shadow: 0, glow: 0 }],
  ['Neon', { color: '#ffffff', stroke: '', strokeW: 0, bg: '', font: 'display', bold: false, upper: true, shadow: 0, glow: 1, glowColor: '#ff2bd6' }],
  ['Comic', { color: '#ffe14d', stroke: '#000000', strokeW: 0.22, bg: '', font: 'display', bold: false, upper: true, shadow: 0.6, glow: 0 }],
  ['Legenda', { color: '#ffffff', stroke: '', strokeW: 0, bg: 'rgba(0,0,0,0.65)', font: 'sans', bold: true, upper: false, shadow: 0, glow: 0 }],
  ['Elegante', { color: '#ffffff', stroke: '', strokeW: 0, bg: '', font: 'serif', italic: true, bold: false, upper: false, shadow: 0.8, glow: 0 }],
  ['Retrô', { color: '#ff9f1c', stroke: '#7a2e00', strokeW: 0.18, bg: '', font: 'display', bold: false, upper: true, shadow: 0.7, glow: 0 }],
  ['Ciano', { color: '#2ec4ff', stroke: '', strokeW: 0, bg: '', font: 'mono', bold: true, upper: true, shadow: 0, glow: 0.9, glowColor: '#2ec4ff' }],
];

const EMOJI = {
  Carinhas: '😀 😂 😍 🥰 😎 🤩 😭 😱 🤔 🙄 😴 🤯 🥳 😇 😈 🤡',
  Gestos: '👍 👎 👏 🙌 🙏 💪 👌 ✌️ 🤞 👀 🫶 🤝',
  Símbolos: '❤️ 🔥 ✨ ⭐ 💯 💥 🎉 🎶 💎 👑 ⚡ 🌈',
  Coisas: '🎬 📸 🎧 🎤 🚀 🏆 🍕 🎮 📱 💡 🌟 🌸',
};


function sortedMarkers(p) { return (p.markers || []).slice().sort((a, b) => a - b); }

// Corta (remove) trechos [a,b] da linha do tempo de um clipe, sem deixar buracos dentro dele
function removeRanges(store, id, ranges) {
  store.mutate((p) => {
    const c = p.clips.find((x) => x.id === id); if (!c) return;
    const end = c.start + c.dur, keeps = []; let pos = c.start;
    for (const [a, b] of ranges) { if (a > pos + MIN_DUR) keeps.push([pos, a]); pos = Math.max(pos, b); }
    if (end > pos + MIN_DUR) keeps.push([pos, end]);
    let run = c.start;
    const out = keeps.map(([a, b], i) => {
      const n = JSON.parse(JSON.stringify(c));
      n.id = uid(); n.start = run; n.dur = b - a; n.in = c.in + (a - c.start) * c.speed; run += n.dur;
      if (i > 0) { n.animIn = 'none'; n.trans = 'none'; n.fadeIn = 0; }
      if (i < keeps.length - 1) { n.animOut = 'none'; n.fadeOut = 0; }
      return n;
    });
    p.clips = p.clips.filter((x) => x.id !== id).concat(out);
  });
}

// acha uma fonte de áudio (selecionado, trilha de áudio ou 1º vídeo), detecta batidas e grava como marcadores
async function detectMarkers(store) {
  const sel = store.selected();
  const ok = (x) => x && (x.type === 'audio' || x.type === 'video');
  const src = ok(sel) ? sel : (store.p.clips.find((x) => x.type === 'audio') || store.p.clips.filter((x) => x.type === 'video').sort((a, b) => a.start - b.start)[0]);
  if (!src) return -1;
  const a = await analyze(store.media.get(src.mediaId));
  if (!a) return -2;
  const mk = beats(a.env).filter((t) => t >= src.in && t <= src.in + src.dur * src.speed).map((t) => +(src.start + (t - src.in) / src.speed).toFixed(3));
  store.mutate((p) => { p.markers = mk; });
  return mk.length;
}
const BEAT_MSG = { '-1': 'Adicione uma música ou vídeo com áudio primeiro.', '-2': 'Não consegui ler o áudio deste arquivo.', 0: 'Nenhuma batida clara encontrada. Use o BPM manual.' };

function buildBeat(root, ctx) {
  const { store, toast } = ctx;
  const c = store.selected();
  const cur = () => store.clip(c.id) || c;
  const setB = (patch) => store.update(c.id, { beat: patch }, 'beat');
  const info = h('p', { class: 'note' });
  const refresh = () => { const n = (store.p.markers || []).length; info.textContent = cur().beat.bpm > 0 ? `Usando BPM manual: ${cur().beat.bpm}.` : n ? `${n} batida(s) detectada(s) — marcadas em amarelo.` : 'Ainda sem batidas. Toque em “Detectar batidas” ou use o BPM manual.'; };
  refresh();
  const apply = (type, all) => {
    store.mutate((p) => { for (const x of p.clips) if ((all ? x.type !== 'audio' : x.id === c.id)) x.beat = Object.assign({}, x.beat, { type }); });
  };
  root.append(
    section('Auto HeadBop (1 toque)', h('div', { class: 'btn-row' }, btn('HeadBop em todos os clipes', 'spark', async () => {
      toast('Analisando música…', 15000);
      const n = await detectMarkers(store);
      if (n <= 0 && !(cur().beat.bpm > 0)) { toast(BEAT_MSG[n] || BEAT_MSG[0], 4500); return; }
      apply('bop', true); toast('HeadBop aplicado ✓'); ctx.openSheet('beat');
    }, 'primary')), h('p', { class: 'note' }, 'Detecta o ritmo da música e faz o vídeo “pular” em cada batida.')),
    section('Efeito na batida', chips(BEATS, cur().beat.type, (id) => apply(id, false)),
      slider({ label: 'Força', min: 0.2, max: 2, step: 0.05, value: cur().beat.amt, fmt: (v) => Math.round(v * 100) + '%', onInput: (v) => setB({ amt: v }) }),
      h('div', { class: 'btn-row' }, btn('Aplicar em todos', 'layers', () => { store.mutate((p) => { for (const x of p.clips) if (x.type !== 'audio') x.beat = Object.assign({}, x.beat, { type: cur().beat.type, amt: cur().beat.amt, bpm: cur().beat.bpm }); }); toast('Aplicado em todos os clipes'); }))),
    section('De onde vêm as batidas',
      h('div', { class: 'btn-row' }, btn('Detectar batidas', 'music', async () => { const n = await detectMarkers(store); if (n > 0) setB({ bpm: 0 }); toast(n > 0 ? `${n} batidas marcadas` : (BEAT_MSG[n] || BEAT_MSG[0]), 4000); refresh(); }),
        btn('Marcador aqui', 'diamond', () => { store.mutate((p) => { p.markers = (p.markers || []).concat([+ctx.engine.time.toFixed(3)]).sort((a, b) => a - b); }); refresh(); }),
        btn('Limpar', 'close', () => { store.mutate((p) => { p.markers = []; }); refresh(); })),
      slider({ label: 'BPM manual', min: 0, max: 200, step: 1, value: cur().beat.bpm, fmt: (v) => (v ? v + ' BPM' : 'auto'), onInput: (v) => { setB({ bpm: v }); refresh(); } }),
      info));
}

function buildSmart(root, ctx) {
  const { store, engine, toast } = ctx;
  const c = store.selected();
  const hasAudio = c && (c.type === 'video' || c.type === 'audio');
  let step = 1, sens = 0.05;
  const mediaOf = (cl) => store.media.get(cl.mediaId);

  if (hasAudio) {
    const status = h('p', { class: 'note' }, 'Analisa o áudio do clipe selecionado no seu aparelho. Nada é enviado.');
    root.append(section('Batidas (sincronizar com a música)',
      h('div', { class: 'btn-row' },
        btn('Detectar batidas', 'spark', async () => {
          const cl = store.clip(c.id), m = mediaOf(cl);
          status.textContent = 'Analisando áudio…';
          const a = await analyze(m);
          if (!a) { status.textContent = 'Não consegui ler o áudio deste arquivo.'; return; }
          const src = beats(a.env).filter((t) => t >= cl.in && t <= cl.in + cl.dur * cl.speed).map((t) => +(cl.start + (t - cl.in) / cl.speed).toFixed(3));
          store.mutate((p) => { p.markers = src; });
          status.textContent = src.length ? `${src.length} batida(s) marcada(s) em amarelo na timeline.` : 'Nenhuma batida clara encontrada. Tente uma música com ritmo mais marcado.';
        }, 'primary'),
        btn('Marcador aqui', 'diamond', () => { store.mutate((p) => { p.markers = (p.markers || []).concat([+engine.time.toFixed(3)]); }); toast('Marcador adicionado'); }),
        btn('Limpar', 'close', () => store.mutate((p) => { p.markers = []; }))),
      slider({ label: 'A cada', min: 1, max: 8, step: 1, value: step, fmt: (v) => v + ' batida' + (v > 1 ? 's' : ''), onInput: (v) => { step = v; } }),
      h('div', { class: 'btn-row' }, btn('Cortar clipes nas batidas', 'split', () => {
        const mk = sortedMarkers(store.p);
        if (mk.length < 2) { toast('Detecte as batidas primeiro'); return; }
        const cuts = [0].concat(mk);
        store.mutate((p) => {
          const main = p.clips.filter((x) => x.lane === 0).sort((a, b) => a.start - b.start);
          main.forEach((cl, i) => {
            const a = cuts[i * step], b = cuts[(i + 1) * step];
            if (a === undefined || b === undefined) return;
            let d = b - a; const m = mediaOf(cl);
            if (cl.type === 'video' && m && m.dur) d = Math.min(d, (m.dur - cl.in) / cl.speed);
            cl.dur = Math.max(MIN_DUR, d);
          });
        });
        toast('Clipes ajustados ao ritmo ✓');
      }, 'primary')),
      status));

    root.append(section('Remover silêncio (cortes automáticos)',
      slider({ label: 'Sensib.', min: 0.02, max: 0.15, step: 0.005, value: sens, fmt: (v) => (v <= 0.04 ? 'baixa' : v <= 0.08 ? 'média' : 'alta'), onInput: (v) => { sens = v; } }),
      h('div', { class: 'btn-row' }, btn('Remover silêncios', 'trash', async () => {
        const cl = store.clip(c.id), m = mediaOf(cl);
        if (cl.kf && cl.kf.length) { toast('Remova os keyframes deste clipe antes'); return; }
        toast('Analisando…', 20000);
        const a = await analyze(m);
        if (!a) { toast('Não consegui ler o áudio deste arquivo'); return; }
        const ranges = silences(a.env, sens).map(([x, y]) => [cl.start + (Math.max(x, cl.in) - cl.in) / cl.speed, cl.start + (Math.min(y, cl.in + cl.dur * cl.speed) - cl.in) / cl.speed]).filter(([x, y]) => y - x >= 0.3);
        if (!ranges.length) { toast('Nenhum silêncio encontrado'); return; }
        const gain = ranges.reduce((t, [x, y]) => t + (y - x), 0);
        removeRanges(store, cl.id, ranges); store.select(null);
        toast(`${ranges.length} corte(s): −${gain.toFixed(1)}s (dá pra desfazer)`);
      })),
      h('p', { class: 'note' }, 'Ótimo para vídeos de fala: tira as pausas. Se cortar demais, desfaça e diminua a sensibilidade.')));
  }

  const q = [];
  if (c && c.type === 'video') q.push(btn('Congelar quadro', 'image', () => ctx.freeze()));
  q.push(btn('Salvar quadro como foto', 'download', () => ctx.saveFrame()));
  root.append(section('Quadro', h('div', { class: 'btn-row' }, ...q), h('p', { class: 'note' }, 'Congelar cria uma foto do quadro atual (2s) no meio do vídeo. Atalhos no PC: F congela, M marca.')));
  if (!hasAudio) root.append(h('p', { class: 'note' }, 'Selecione um vídeo ou áudio na timeline para usar Batidas e Remover silêncio.'));
}

export function buildPanel(kind, ctx) {
  const { store, engine } = ctx;
  const c = store.selected();
  const cur = () => (c ? store.clip(c.id) || c : null);
  const set = (patch, key) => store.update(c.id, patch, key);
  const root = h('div', { class: 'panel' });
  const needsClip = ['beat', 'adjust', 'filters', 'effects', 'keyframes', 'speed', 'volume', 'anim', 'trans', 'text'];

  if (needsClip.includes(kind) && !c) { root.append(h('p', { class: 'note' }, 'Selecione um clipe para editar.')); return root; }

  if (kind === 'adjust') {
    const visual = c.type === 'video' || c.type === 'image';
    const defs = [{ id: 'basic', label: 'Básico', build: () => {
      const tv = store.tv(cur());
      const box = h('div', {},
        slider({ label: 'Escala', min: 0.1, max: 4, step: 0.01, value: tv.scale, fmt: pct, onInput: (v) => set({ scale: v }, 'scale') }),
        slider({ label: 'Rotação', min: -180, max: 180, step: 1, value: Math.round(tv.rot), fmt: (v) => v + '°', onInput: (v) => set({ rot: v }, 'rot') }),
        slider({ label: 'Opacidade', min: 0, max: 100, step: 1, value: Math.round(tv.opacity * 100), fmt: (v) => v + '%', onInput: (v) => set({ opacity: v / 100 }, 'opacity') }));
      const row = h('div', { class: 'btn-row' });
      if (visual) {
        row.append(btn(cur().fit === 'cover' ? 'Ajustar à tela' : 'Preencher tela', 'fit', () => { set({ fit: cur().fit === 'cover' ? 'contain' : 'cover' }); ctx.openSheet('adjust'); }),
          btn('Espelhar', 'flip', () => set({ flip: !cur().flip })));
      }
      row.append(btn('Girar 90°', 'rotate', () => { set({ rot: ((Math.round(store.tv(cur()).rot) + 90 + 180) % 360) - 180 }); ctx.openSheet('adjust'); }),
        btn('Centralizar', 'fit', () => { set({ x: 0, y: 0, scale: c.lane === 1 ? 0.5 : 1, rot: 0 }); ctx.openSheet('adjust'); }));
      box.append(row); return box;
    } }];
    if (visual) {
      defs.push({ id: 'color', label: 'Cor', build: () => h('div', {}, ...[['b', 'Brilho'], ['c', 'Contraste'], ['s', 'Saturação'], ['h', 'Matiz']].map(([k, label]) =>
        slider({ label, min: -100, max: 100, step: 1, value: cur().adj[k], onInput: (v) => set({ adj: { [k]: v } }, 'adj' + k) }))) });
      defs.push({ id: 'mask', label: 'Máscara', build: () => h('div', {},
        chips(MASKS, cur().mask, (id) => { set({ mask: id }); }),
        slider({ label: 'Cantos', min: 0, max: 0.5, step: 0.01, value: cur().radius, fmt: pct, onInput: (v) => set({ radius: v }, 'radius') }),
        h('p', { class: 'note' }, 'Recorta o clipe em formas. “Cantos” vale para Arredondado.')) });
      defs.push({ id: 'blend', label: 'Mistura', build: () => h('div', {}, chips(BLENDS, cur().blend, (id) => set({ blend: id })),
        h('p', { class: 'note' }, 'Mistura o clipe com o que está embaixo — use em clipes da trilha “Sobrepor”.')) });
    }
    root.append(tabs('adjust', defs));
  }

  else if (kind === 'filters') {
    root.append(section('Filtros', chips(FILTERS.map((f) => [f.id, f.name, f.sw]), c.filter, (id) => set({ filter: id }))));
    if (!engine.filterOK) root.append(h('p', { class: 'note' }, 'Este navegador não suporta filtros no canvas. No APK e no Chrome funcionam normalmente.'));
  }

  else if (kind === 'effects') {
    const f = () => cur().fx;
    const fxs = [['vig', 'Vinheta'], ['grain', 'Granulado'], ['blur', 'Desfoque'], ['shake', 'Tremor'], ['pulse', 'Pulsar']];
    const defs = [
      { id: 'fx', label: 'Efeitos', build: () => h('div', {}, ...fxs.map(([k, label]) => slider({ label, min: 0, max: 1, step: 0.01, value: f()[k], fmt: pct, onInput: (v) => set({ fx: { [k]: v } }, 'fx' + k) })),
        h('p', { class: 'note' }, 'Dica: em aparelho fraco use poucos efeitos ao mesmo tempo; o Desfoque é o mais pesado.')) },
      { id: 'loop', label: 'Movimento', build: () => h('div', {}, section('Movimento contínuo', chips(LOOPS, cur().loop, (id) => set({ loop: id }))),
        h('p', { class: 'note' }, 'Ótimo para fotos (efeito Ken Burns) e adesivos.')) },
    ];
    if (c.type === 'video' || c.type === 'image') defs.push({ id: 'chroma', label: 'Fundo verde', build: () => h('div', {},
      toggle('Remover cor de fundo (chroma key)', cur().chroma.on, (v) => { set({ chroma: { on: v } }); }),
      section('Cor a remover', swatches(['#00ff00', '#00b140', '#0047bb', '#ffffff', '#000000'], cur().chroma.color, (col) => set({ chroma: { color: col } }))),
      slider({ label: 'Tolerância', min: 0.05, max: 0.9, step: 0.01, value: cur().chroma.tol, fmt: pct, onInput: (v) => set({ chroma: { tol: v } }, 'ctol') }),
      slider({ label: 'Suavizar', min: 0, max: 0.4, step: 0.01, value: cur().chroma.soft, fmt: pct, onInput: (v) => set({ chroma: { soft: v } }, 'csoft') }),
      h('p', { class: 'note' }, 'Funciona melhor com fundo uniforme e bem iluminado. Em celular fraco, a prévia usa resolução menor.')) });
    root.append(tabs('effects', defs));
  }

  else if (kind === 'keyframes') {
    const info = h('p', { class: 'note' });
    const refresh = () => { const k = cur().kf; info.textContent = k.length ? `${k.length} keyframe(s): ${k.map((q) => q.t.toFixed(1) + 's').join(' · ')}` : 'Sem keyframes. Adicione um ponto e mude posição/escala/rotação em outro instante.'; };
    refresh();
    const go = (dir) => {
      const cc = cur(), lt = store.localTime(cc);
      const ks = cc.kf.map((q) => q.t);
      const t = dir > 0 ? ks.find((x) => x > lt + 0.05) : [...ks].reverse().find((x) => x < lt - 0.05);
      if (t !== undefined) engine.seek(cc.start + t);
    };
    root.append(section('Animar com keyframes',
      h('div', { class: 'btn-row' },
        btn('Adicionar aqui', 'diamond', () => { if (!store.addKf(c.id)) ctx.toast('Já existe um keyframe aqui'); ctx.openSheet('keyframes'); }, 'primary'),
        btn('Remover aqui', 'trash', () => { store.delKfAt(c.id); ctx.openSheet('keyframes'); }),
        btn('Limpar', 'close', () => { store.clearKf(c.id); ctx.openSheet('keyframes'); })),
      h('div', { class: 'btn-row' }, btn('◀ Anterior', '', () => go(-1)), btn('Próximo ▶', '', () => go(1))), info));
    root.append(section('Prontos (como no Alight Motion)', h('div', { class: 'btn-row' },
      ...[['zoomIn', 'Zoom +'], ['zoomOut', 'Zoom −'], ['panLeft', 'Pan ←'], ['panRight', 'Pan →'], ['slideIn', 'Entrar'], ['spinIn', 'Giro'], ['bounce', 'Quicar']].map(([id, n]) => btn(n, '', () => { store.kfPreset(c.id, id); ctx.openSheet('keyframes'); })))));
    const tv = store.tv(c);
    root.append(section('Valores neste instante',
      slider({ label: 'Escala', min: 0.1, max: 4, step: 0.01, value: tv.scale, fmt: pct, onInput: (v) => set({ scale: v }, 'kscale') }),
      slider({ label: 'Rotação', min: -360, max: 360, step: 1, value: Math.round(tv.rot), fmt: (v) => v + '°', onInput: (v) => set({ rot: v }, 'krot') }),
      slider({ label: 'Opacidade', min: 0, max: 100, step: 1, value: Math.round(tv.opacity * 100), fmt: (v) => v + '%', onInput: (v) => set({ opacity: v / 100 }, 'kop') })));
  }

  else if (kind === 'speed') {
    const apply = (v) => { const now = cur(); set({ speed: v, dur: Math.max(0.1, (now.dur * now.speed) / v) }); };
    root.append(section('Velocidade',
      slider({ label: 'Velocidade', min: 0.25, max: 4, step: 0.05, value: c.speed, fmt: (v) => v.toFixed(2) + 'x', onChange: apply }),
      h('div', { class: 'btn-row' }, ...[0.25, 0.5, 1, 1.5, 2, 3, 4].map((v) => btn(v + 'x', '', () => { apply(v); ctx.openSheet('speed'); })))));
    root.append(h('p', { class: 'note' }, 'Ao mudar a velocidade a duração do clipe se ajusta automaticamente.'));
  }

  else if (kind === 'volume') {
    root.append(section('Volume',
      slider({ label: 'Volume', min: 0, max: 200, step: 1, value: Math.round(c.vol * 100), fmt: (v) => v + '%', onInput: (v) => set({ vol: v / 100 }, 'vol') }),
      slider({ label: 'Surgir', min: 0, max: 5, step: 0.1, value: c.fadeIn, fmt: (v) => v.toFixed(1) + 's', onInput: (v) => set({ fadeIn: v }, 'fi') }),
      slider({ label: 'Sumir', min: 0, max: 5, step: 0.1, value: c.fadeOut, fmt: (v) => v.toFixed(1) + 's', onInput: (v) => set({ fadeOut: v }, 'fo') }),
      h('div', { class: 'btn-row' }, btn('Silenciar', 'volume', () => { set({ vol: 0 }); ctx.openSheet('volume'); }), btn('100%', '', () => { set({ vol: 1 }); ctx.openSheet('volume'); }))));
  }

  else if (kind === 'anim') {
    root.append(tabs('anim', [
      { id: 'in', label: 'Entrada', build: () => chips(ANIMS_IN, cur().animIn, (id) => { set({ animIn: id }); engine.seek(c.start); }) },
      { id: 'out', label: 'Saída', build: () => chips(ANIMS_OUT, cur().animOut, (id) => { set({ animOut: id }); engine.seek(Math.max(c.start, c.start + c.dur - cur().animDur * 0.5)); }) },
      { id: 'loop', label: 'Contínua', build: () => chips(LOOPS, cur().loop, (id) => set({ loop: id })) },
    ]));
    root.append(section('', slider({ label: 'Duração', min: 0.1, max: Math.max(0.2, Math.min(2, c.dur / 2)), step: 0.05, value: Math.min(c.animDur, Math.max(0.2, c.dur / 2)), fmt: (v) => v.toFixed(2) + 's', onInput: (v) => set({ animDur: v }, 'ad') })));
  }

  else if (kind === 'trans') {
    if (c.lane !== 0) root.append(h('p', { class: 'note' }, 'Transições valem só para clipes da trilha principal.'));
    else if (store.lane(0)[0].id === c.id) root.append(h('p', { class: 'note' }, 'A transição fica entre dois clipes: selecione o segundo clipe (ou um posterior).'));
    else {
      root.append(section('Transição antes deste clipe', chips(TRANSITIONS, c.trans, (id) => { set({ trans: id }); engine.seek(Math.max(0, c.start - 0.25)); })));
      root.append(section('', slider({ label: 'Duração', min: 0.2, max: 2, step: 0.1, value: c.transDur, fmt: (v) => v.toFixed(1) + 's', onInput: (v) => set({ transDur: v }, 'td') })));
    }
  }

  else if (kind === 'text') {
    if (c.type !== 'text') { root.append(h('p', { class: 'note' }, 'Selecione um texto.')); return root; }
    const T = () => cur().text;
    const setT = (patch, key) => set({ text: patch }, key || 'txt');
    root.append(tabs('text', [
      { id: 'txt', label: 'Texto', build: () => {
        const area = h('textarea', { class: 'field', rows: '3', maxlength: '300', placeholder: 'Digite o texto…' });
        area.value = T().str;
        area.addEventListener('input', () => setT({ str: area.value }, 'txtstr'));
        return h('div', {}, area, section('Estilos prontos', chips(TEXT_PRESETS.map((p) => [p[0], p[0]]), '', (name) => { setT(TEXT_PRESETS.find((p) => p[0] === name)[1]); ctx.openSheet('text'); })));
      } },
      { id: 'style', label: 'Estilo', build: () => h('div', {},
        slider({ label: 'Tamanho', min: 0.02, max: 0.3, step: 0.005, value: T().size, fmt: (v) => Math.round(v * 100), onInput: (v) => setT({ size: v }, 'tsize') }),
        h('div', { class: 'btn-row' },
          btn('Negrito', '', (e) => { const v = !T().bold; setT({ bold: v }); e.currentTarget.classList.toggle('on', v); }, T().bold ? 'on' : ''),
          btn('Itálico', '', (e) => { const v = !T().italic; setT({ italic: v }); e.currentTarget.classList.toggle('on', v); }, T().italic ? 'on' : ''),
          btn('MAIÚSC.', '', (e) => { const v = !T().upper; setT({ upper: v }); e.currentTarget.classList.toggle('on', v); }, T().upper ? 'on' : ''),
          btn('Esq.', '', () => setT({ align: 'left' })), btn('Centro', '', () => setT({ align: 'center' })), btn('Dir.', '', () => setT({ align: 'right' }))),
        chips(Object.keys(FONT_NAMES).map((k) => [k, FONT_NAMES[k]]), T().font, (id) => setT({ font: id })),
        section('Cor', swatches(COLORS, T().color, (col) => setT({ color: col }, 'tcol'))),
        section('Fundo', swatches(COLORS, T().bg, (col) => setT({ bg: col }, 'tbg'), true)),
        section('Contorno', swatches(COLORS, T().stroke, (col) => setT({ stroke: col }, 'tst')),
          slider({ label: 'Espessura', min: 0, max: 0.3, step: 0.01, value: T().strokeW, fmt: (v) => Math.round(v * 100), onInput: (v) => setT({ strokeW: v }, 'tsw') }))) },
      { id: 'fx', label: 'Efeitos', build: () => h('div', {},
        slider({ label: 'Sombra', min: 0, max: 1, step: 0.01, value: T().shadow, fmt: pct, onInput: (v) => setT({ shadow: v }, 'tsh') }),
        slider({ label: 'Brilho neon', min: 0, max: 1, step: 0.01, value: T().glow, fmt: pct, onInput: (v) => setT({ glow: v }, 'tgl') }),
        section('Cor do brilho', swatches(['#5b8cff', '#ff2bd6', '#2ec4ff', '#3ddc84', '#ffe14d', '#ff3b5c'], T().glowColor, (col) => setT({ glowColor: col }, 'tglc'))),
        toggle('Efeito de digitação', T().typing, (v) => setT({ typing: v })),
        section('Entrada', chips(ANIMS_IN, cur().animIn, (id) => { set({ animIn: id }); engine.seek(c.start); })),
        section('Movimento', chips(LOOPS, cur().loop, (id) => set({ loop: id })))) },
    ]));
  }

  else if (kind === 'ratio') {
    const p = store.p;
    root.append(tabs('ratio', [
      { id: 'ratio', label: 'Proporção', build: () => {
        const grid = h('div', { class: 'ratio-grid' });
        for (const r of RATIOS) {
          const b = h('button', { class: 'ratio' + (p.ratio === r.id ? ' on' : ''), type: 'button' },
            h('i', { class: 'rbox', style: `aspect-ratio:${r.w}/${r.h};${r.w >= r.h ? 'width:34px' : 'height:34px'}` }), h('b', {}, r.id), h('small', {}, r.hint));
          b.addEventListener('click', () => { store.setRatio(r.id); ctx.openSheet('ratio'); });
          grid.append(b);
        }
        const box = h('div', {}, grid);
        const first = store.lane(0).find((x) => store.media.get(x.mediaId) && store.media.get(x.mediaId).w);
        if (first) {
          const m = store.media.get(first.mediaId);
          box.append(h('div', { class: 'btn-row' }, btn('Igual ao 1º vídeo', 'video', () => { const g = (a, b) => (b ? g(b, a % b) : a); const d = g(m.w, m.h); store.setRatio(`${m.w / d}:${m.h / d}`); ctx.openSheet('ratio'); })));
        }
        return box;
      } },
      { id: 'bg', label: 'Fundo', build: () => h('div', {},
        chips([['color', 'Cor sólida'], ['blur', 'Vídeo desfocado']], p.bgMode, (id) => store.setBgMode(id)),
        section('Cor de fundo', swatches(['#000000', '#ffffff', '#0b1020', '#1b1b1b', '#ff3b5c', '#2ec4ff', '#3ddc84', '#ffe14d', '#8f6bff'], p.bg, (col) => store.setBg(col))),
        h('p', { class: 'note' }, '“Vídeo desfocado” preenche as faixas pretas com o próprio vídeo borrado, como no CapCut.')) },
    ]));
  }

  else if (kind === 'stickers') {
    root.append(tabs('stickers', Object.keys(EMOJI).map((cat) => ({ id: cat, label: cat, build: () => {
      const g = h('div', { class: 'emoji-grid' });
      for (const e of EMOJI[cat].split(' ')) {
        const b = h('button', { class: 'emoji', type: 'button' }, e);
        b.addEventListener('click', () => {
          store.addClip(makeClip({ lane: 2, type: 'text', start: engine.time, dur: 3, y: 0, animIn: 'pop', text: Object.assign(defaultText(e), { size: 0.16, stroke: '', strokeW: 0, bold: false }) }));
        });
        g.append(b);
      }
      return g;
    } }))));
  }

  else if (kind === 'captions') {
    const ta = h('textarea', { class: 'field', rows: '5', placeholder: 'Uma frase por linha.\nCada linha vira uma legenda, uma depois da outra.' });
    let dur = 2.5;
    root.append(section('Legendas rápidas', ta,
      slider({ label: 'Por frase', min: 1, max: 6, step: 0.5, value: dur, fmt: (v) => v.toFixed(1) + 's', onInput: (v) => { dur = v; } }),
      h('div', { class: 'btn-row' }, btn('Criar legendas', 'captions', () => {
        const lines = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
        if (!lines.length) { ctx.toast('Escreva pelo menos uma frase'); return; }
        store.mutate((pr) => {
          let t = engine.time;
          for (const l of lines) { pr.clips.push(makeClip({ lane: 2, type: 'text', start: t, dur, y: 0.3, animIn: 'fade', animDur: 0.2, text: Object.assign(defaultText(l), { size: 0.055, bg: 'rgba(0,0,0,0.6)', stroke: '', strokeW: 0 }) })); t += dur; }
        });
        ctx.toast(`${lines.length} legenda(s) criada(s)`); ctx.closeSheet();
      }, 'primary')),
      h('p', { class: 'note' }, 'Depois toque em cada legenda na timeline para ajustar texto, tempo e estilo.')));
  }

  else if (kind === 'smart') buildSmart(root, ctx);
  else if (kind === 'beat') buildBeat(root, ctx);

  else root.append(h('p', { class: 'note' }, 'Selecione um clipe para editar.'));
  return root;
}
