// Max Editor — aviso de versão nova (site/PWA e APK)
import { REMOTE_VERSION_URL, APK_URL, isNative } from './config.js';

let running = null;

export function cmpVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchJson(url, ms = 8000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}

// Versão que está rodando agora (arquivo empacotado junto do app)
export async function runningVersion() {
  if (running) return running;
  try { running = (await fetchJson('version.json?t=' + Date.now())).version; } catch { running = '0.0.0'; }
  return running;
}

// Retorna { version, notes, apkUrl } se houver versão mais nova; null se não; lança se offline
export async function checkUpdate() {
  const cur = await runningVersion();
  const remote = await fetchJson(REMOTE_VERSION_URL + '?t=' + Date.now());
  if (remote && remote.version && cmpVersion(remote.version, cur) > 0) {
    return { version: remote.version, notes: remote.notes || [], apkUrl: remote.apkUrl || APK_URL, current: cur };
  }
  return null;
}

export async function applyUpdate(info) {
  if (isNative()) {
    const B = window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    if (B && B.open) { await B.open({ url: info.apkUrl }); return; }
    window.open(info.apkUrl, '_system'); return;
  }
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch { /* sem SW */ }
  location.reload();
}
