// Max Editor — configuração central
export const APP_NAME = 'Max Editor';
export const REPO = 'HkfatalX/Max-Editor';
export const SITE_URL = 'https://hkfatalx.github.io/Max-Editor/';
export const REMOTE_VERSION_URL = SITE_URL + 'version.json';
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/MaxEditor.apk`;

// Supabase (projeto "max-editor"). A chave "anon" é pública por design; a segurança vem das regras (RLS) no banco.
export const SUPABASE_URL = 'https://kzjdhyqkywlsivxlsufl.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6amRoeXFreXdsc2l2eGxzdWZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MzU0MzMsImV4cCI6MjEwOTUxMTQzM30.ezRDwbg87mNtkXXk_ppJOXpyao3wrJTPPsRkN_5RXko';
export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;

export const RATIOS = [
  { id: '9:16', w: 9, h: 16, hint: 'TikTok · Reels · Shorts' },
  { id: '16:9', w: 16, h: 9, hint: 'YouTube · TV' },
  { id: '1:1', w: 1, h: 1, hint: 'Feed quadrado' },
  { id: '4:5', w: 4, h: 5, hint: 'Feed retrato' },
  { id: '3:4', w: 3, h: 4, hint: 'Retrato' },
  { id: '4:3', w: 4, h: 3, hint: 'Clássico' },
  { id: '21:9', w: 21, h: 9, hint: 'Cinema' },
];

// 0 = trilha principal (magnética), 1 = sobreposição, 2 = texto/adesivos, 3 = áudio
export const LANES = [
  { id: 0, name: 'Vídeo', icon: 'video' },
  { id: 1, name: 'Sobrepor', icon: 'layers' },
  { id: 2, name: 'Texto', icon: 'text' },
  { id: 3, name: 'Áudio', icon: 'music' },
];

export const MIN_DUR = 0.1;
export const IMAGE_DUR = 3;

export function isNative() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch { return false; }
}

export function parseRatio(id) {
  const [w, h] = String(id).split(':').map(Number);
  return { w: w > 0 ? w : 9, h: h > 0 ? h : 16 };
}

// Classifica o aparelho para escolher a qualidade inicial da prévia
export function deviceTier() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (mem <= 3 || cores <= 4) return 'low';
  if (mem <= 4 || cores <= 6) return 'mid';
  return 'high';
}
export const PREVIEW_LONG = { low: 480, mid: 640, high: 960 };

export function fmtTime(t, frac = true) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = frac ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
  return `${String(m).padStart(2, '0')}:${ss}`;
}
