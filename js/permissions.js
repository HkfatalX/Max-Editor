// Max Editor — permissões nativas do Android (só no APK; o site não precisa de nenhuma)
import { isNative } from './config.js';

// Acha um plugin Capacitor mesmo sem bundler
export function plugin(name) {
  const C = window.Capacitor;
  if (!C) return null;
  if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
  if (typeof C.registerPlugin === 'function') { try { return C.registerPlugin(name); } catch { /* sem */ } }
  return null;
}

export const PERM_INFO = {
  mic: { icon: 'mic', title: 'Microfone', why: 'Gravar sua voz (narração) direto no editor.' },
  media: { icon: 'image', title: 'Fotos, vídeos e áudio', why: 'Acessar a galeria para importar suas mídias.' },
  storage: { icon: 'image', title: 'Arquivos e mídia', why: 'Acessar a galeria para importar suas mídias.' },
  notifications: { icon: 'info', title: 'Notificações', why: 'Avisar quando a exportação do vídeo terminar.' },
};

// { sdk, mic, media|storage, notifications } com valores 'granted' | 'denied' | 'prompt'; null no site
export async function permStatus() {
  if (!isNative()) return null;
  const p = plugin('MaxPermissions');
  if (!p) return null;
  try { return await p.check(); } catch { return null; }
}

export function neededAliases(st) { return st && st.sdk >= 33 ? ['mic', 'media', 'notifications'] : ['mic', 'storage']; }
export const allGranted = (st) => !st || neededAliases(st).every((a) => st[a] === 'granted');

export async function requestPerms() {
  const p = plugin('MaxPermissions');
  const st = await permStatus();
  if (!p || !st) return null;
  try { return await p.request({ aliases: neededAliases(st) }); } catch { return permStatus(); }
}
export async function storageInfo() { const p = plugin('MaxPermissions'); if (!p || !isNative()) return null; try { return await p.storageInfo(); } catch { return null; } }
export function openSettings() { const p = plugin('MaxPermissions'); if (p) p.openSettings().catch(() => {}); }
export function notify(title, body) { const p = plugin('MaxPermissions'); if (p) p.notify({ title, body }).catch(() => {}); }
