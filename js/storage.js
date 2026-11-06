// Max Editor — armazenamento local (IndexedDB) + espelho síncrono anti-crash (localStorage)
const DB_NAME = 'maxeditor';
const DB_VER = 1;
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('media')) {
          const m = d.createObjectStore('media', { keyPath: 'id' });
          m.createIndex('projectId', 'projectId');
        }
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      r.onsuccess = () => {
        const d = r.result;
        d.onversionchange = () => { d.close(); dbp = null; };
        res(d);
      };
      r.onerror = () => { dbp = null; rej(r.error); };
    });
  }
  return dbp;
}

function run(stores, mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(stores, mode);
    let out;
    try { out = fn(t); } catch (e) { try { t.abort(); } catch {} rej(e); return; }
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transação cancelada'));
  }));
}

export const storage = {
  async saveProject(p) {
    const rec = JSON.parse(JSON.stringify(p));
    return run('projects', 'readwrite', (t) => t.objectStore('projects').put(rec));
  },
  async loadProject(id) {
    return run('projects', 'readonly', (t) => t.objectStore('projects').get(id));
  },
  async listProjects() {
    const all = await run('projects', 'readonly', (t) => t.objectStore('projects').getAll());
    return (all || []).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  },
  async deleteProject(id) {
    await run(['projects', 'media'], 'readwrite', (t) => {
      t.objectStore('projects').delete(id);
      const store = t.objectStore('media');
      const cur = store.index('projectId').openKeyCursor(IDBKeyRange.only(id));
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { store.delete(c.primaryKey); c.continue(); }
      };
    });
    clearMirror(id);
  },
  async putMedia(rec) {
    return run('media', 'readwrite', (t) => t.objectStore('media').put(rec));
  },
  async getMedia(id) {
    return run('media', 'readonly', (t) => t.objectStore('media').get(id));
  },
  async deleteMedia(id) {
    return run('media', 'readwrite', (t) => t.objectStore('media').delete(id));
  },
  async estimate() {
    try { return await navigator.storage.estimate(); } catch { return null; }
  },
};

// ---- Espelho síncrono: sobrevive a fechamento/crash porque localStorage grava na hora ----
const RK = 'maxeditor:mirror:';
export function mirrorProject(p) {
  try {
    const { thumb, ...lite } = p;
    localStorage.setItem(RK + p.id, JSON.stringify(lite));
  } catch { /* cota cheia: o IndexedDB continua valendo */ }
}
export function readMirror(id) {
  try { const s = localStorage.getItem(RK + id); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function clearMirror(id) {
  try { localStorage.removeItem(RK + id); } catch {}
}

const OPEN_KEY = 'maxeditor:open-project';
export const session = {
  setOpen(id) { try { localStorage.setItem(OPEN_KEY, id); } catch {} },
  clearOpen() { try { localStorage.removeItem(OPEN_KEY); } catch {} },
  getOpen() { try { return localStorage.getItem(OPEN_KEY); } catch { return null; } },
};

export const prefs = {
  get(k, d) { try { const v = localStorage.getItem('maxeditor:pref:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('maxeditor:pref:' + k, JSON.stringify(v)); } catch {} },
};
