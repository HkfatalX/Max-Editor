// Max Editor — salvar arquivo exportado (navegador/PC e APK Android)
import { isNative } from './config.js';
import { plugin } from './permissions.js';

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function safeName(name) {
  return String(name || 'video').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'video';
}

export async function saveVideo(blob, filename, onProgress) {
  if (!isNative()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { where: 'pasta Downloads do navegador' };
  }
  const FS = plugin('Filesystem'), Share = plugin('Share');
  if (!FS) throw new Error('Plugin de arquivos indisponível');
  try { if (FS.requestPermissions) await FS.requestPermissions(); } catch { /* Android 11+ não precisa */ }
  const CH = 3 * 1024 * 1024; // múltiplo de 3 → base64 concatenável
  async function write(dir, path) {
    for (let off = 0, first = true; off < blob.size; off += CH, first = false) {
      const data = toBase64(await blob.slice(off, Math.min(blob.size, off + CH)).arrayBuffer());
      if (first) await FS.writeFile({ path, data, directory: dir, recursive: true });
      else await FS.appendFile({ path, data, directory: dir });
      if (onProgress) onProgress(Math.min(1, (off + CH) / blob.size));
    }
    return (await FS.getUri({ path, directory: dir })).uri;
  }
  let uri, where;
  try { uri = await write('DOCUMENTS', 'MaxEditor/' + filename); where = 'Documentos/MaxEditor'; }
  catch { uri = await write('CACHE', filename); where = 'cache do app (use Compartilhar para guardar)'; }
  if (Share) { try { await Share.share({ title: filename, url: uri, dialogTitle: 'Salvar ou compartilhar vídeo' }); } catch { /* usuário fechou */ } }
  return { where };
}
