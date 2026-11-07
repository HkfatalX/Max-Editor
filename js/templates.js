// Max Editor — modelos prontos (começam um projeto já com estilo)
import { makeClip, defaultText } from './state.js';
import { clipFromMedia } from './media.js';

const T = (str, over, text) => makeClip(Object.assign({ lane: 2, type: 'text', start: 0, dur: 3, y: -0.3, animIn: 'pop', text: Object.assign(defaultText(str), text || {}) }, over || {}));

export const TEMPLATES = [
  { id: 'vlog', name: 'Vlog vertical', emoji: '🎬', ratio: '9:16', media: true, grad: 'linear-gradient(135deg,#6a3df0,#ff4d8d)', desc: 'Vários vídeos com fundo desfocado e transições deslizantes.',
    apply(store, media) {
      store.mutate((p) => {
        p.bgMode = 'blur';
        let t = 0;
        media.forEach((m, i) => { const c = clipFromMedia(m, 0, t); c.trans = i ? 'slideL' : 'none'; p.clips.push(c); t += c.dur; });
        p.clips.push(T('MEU VLOG', { dur: Math.min(3, t || 3) }, { upper: true, font: 'display', size: 0.09, glow: 0.8, glowColor: '#ff2bd6' }));
      });
    } },
  { id: 'slideshow', name: 'Slideshow de fotos', emoji: '🖼️', ratio: '9:16', media: true, grad: 'linear-gradient(135deg,#2ec4ff,#6a3df0)', desc: 'Fotos com zoom lento (Ken Burns) e transições suaves.',
    apply(store, media) {
      store.mutate((p) => {
        let t = 0;
        media.forEach((m, i) => { const c = clipFromMedia(m, 0, t); if (m.kind === 'image') c.dur = 3; c.fit = 'cover'; c.loop = i % 2 ? 'zoomout' : 'zoomin'; c.trans = i ? (i % 2 ? 'fade' : 'zoom') : 'none'; p.clips.push(c); t += c.dur; });
      });
    } },
  { id: 'titulo', name: 'Título animado', emoji: '✨', ratio: '16:9', media: false, grad: 'linear-gradient(135deg,#ff9f1c,#ff3b5c)', desc: 'Abertura com texto neon pulsando. Sem precisar de mídia.',
    apply(store) {
      store.mutate((p) => {
        p.bg = '#0a0a1a';
        p.clips.push(T('SEU TÍTULO', { dur: 5, y: -0.05, loop: 'pulse' }, { upper: true, font: 'display', size: 0.16, glow: 1, glowColor: '#8f6bff' }));
        p.clips.push(T('subtítulo aqui', { dur: 5, y: 0.12, animIn: 'fade' }, { size: 0.06, bold: false, shadow: 0.6 }));
      });
    } },
  { id: 'shorts', name: 'Shorts com legenda', emoji: '📱', ratio: '9:16', media: true, grad: 'linear-gradient(135deg,#ff3b5c,#ffe14d)', desc: 'Fundo desfocado, filtro vívido e legenda destacada.',
    apply(store, media) {
      store.mutate((p) => {
        p.bgMode = 'blur';
        let t = 0;
        media.forEach((m) => { const c = clipFromMedia(m, 0, t); c.filter = 'vivid'; p.clips.push(c); t += c.dur; });
        p.clips.push(T('Sua legenda aqui', { dur: Math.max(2, t || 3), y: 0.3, animIn: 'fade' }, { size: 0.055, bg: 'rgba(0,0,0,0.65)', stroke: '', strokeW: 0 }));
      });
    } },
  { id: 'feed', name: 'Feed 4:5', emoji: '📷', ratio: '4:5', media: true, grad: 'linear-gradient(135deg,#3ddc84,#2ec4ff)', desc: 'Retrato para feed, com cores vivas e vinheta suave.',
    apply(store, media) {
      store.mutate((p) => {
        let t = 0;
        media.forEach((m) => { const c = clipFromMedia(m, 0, t); c.fit = 'cover'; c.filter = 'vivid'; c.fx.vig = 0.35; p.clips.push(c); t += c.dur; });
      });
    } },
  { id: 'cinema', name: 'Cinema 21:9', emoji: '🎞️', ratio: '21:9', media: true, grad: 'linear-gradient(135deg,#1b2a49,#2fb5a6)', desc: 'Visual de filme: cor cinematográfica, granulado e vinheta.',
    apply(store, media) {
      store.mutate((p) => {
        let t = 0;
        media.forEach((m) => { const c = clipFromMedia(m, 0, t); c.fit = 'cover'; c.filter = 'cine'; c.fx.vig = 0.5; c.fx.grain = 0.4; p.clips.push(c); t += c.dur; });
        p.clips.push(T('TÍTULO DO FILME', { dur: 3, y: 0.28, animIn: 'fade' }, { size: 0.06, font: 'serif', bold: false, upper: true, shadow: 0.7 }));
      });
    } },
];
