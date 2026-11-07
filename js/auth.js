// Max Editor — login com e-mail, senha e nome de usuário único (Supabase Auth via REST, sem bibliotecas)
import { SUPABASE_URL, SUPABASE_KEY, SITE_URL } from './config.js';

const SK = 'maxeditor:auth:v1';
let sess = null;
let refreshing = null;
const subs = new Set();

export class AuthError extends Error {
  constructor(msg, code, status) { super(msg); this.code = code; this.status = status; }
}

function read() { try { sess = JSON.parse(localStorage.getItem(SK) || 'null'); } catch { sess = null; } }
function write(s) {
  sess = s;
  try { if (s) localStorage.setItem(SK, JSON.stringify(s)); else localStorage.removeItem(SK); } catch { /* sem storage */ }
  const u = userOf(sess);
  subs.forEach((f) => { try { f(u); } catch {} });
}

function friendly(status, body) {
  const raw = String((body && (body.msg || body.message || body.error_description || body.error)) || '');
  const code = String((body && (body.error_code || body.code)) || '');
  const t = (raw + ' ' + code).toLowerCase();
  if (t.includes('invalid login') || t.includes('invalid_credentials')) return 'E-mail ou senha incorretos.';
  if (t.includes('email not confirmed') || t.includes('email_not_confirmed')) return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).';
  if (t.includes('already registered') || t.includes('user_already_exists') || t.includes('already been registered')) return 'Já existe uma conta com este e-mail.';
  if (t.includes('database error saving new user') || t.includes('username')) return 'Esse nome de usuário já está em uso ou é inválido.';
  if (t.includes('same_password') || t.includes('different from the old')) return 'A nova senha precisa ser diferente da atual.';
  if (t.includes('weak_password') || t.includes('password should be') || t.includes('password is too')) return 'Senha fraca: use pelo menos 8 caracteres, com letras e números.';
  if (t.includes('rate limit') || t.includes('over_email_send_rate_limit') || t.includes('over_request_rate_limit') || status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (t.includes('email_address_invalid') || t.includes('invalid email') || t.includes('unable to validate email')) return 'E-mail inválido.';
  if (t.includes('signup_disabled') || t.includes('signups not allowed')) return 'Cadastros estão desativados no momento.';
  if (t.includes('otp_expired') || t.includes('expired')) return 'Este link expirou. Peça um novo.';
  return raw ? 'Não foi possível concluir: ' + raw : 'Erro inesperado (código ' + status + ').';
}

async function call(path, { method = 'POST', body, token } = {}) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 15000);
  let res;
  try {
    res = await fetch(SUPABASE_URL + path, {
      method,
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    throw new AuthError('Sem conexão com a internet. Tente novamente.', 'network', 0);
  } finally { clearTimeout(to); }
  let data = null;
  try { const txt = await res.text(); data = txt ? JSON.parse(txt) : null; } catch { data = null; }
  if (!res.ok) throw new AuthError(friendly(res.status, data), (data && (data.error_code || data.code)) || 'http', res.status);
  return data;
}

function userOf(s) {
  if (!s || !s.user) return null;
  const u = s.user;
  return { id: u.id, email: u.email, username: (u.user_metadata && u.user_metadata.username) || String(u.email || '').split('@')[0], created: u.created_at };
}
function fromToken(d) {
  return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user };
}

async function refresh() {
  if (!sess || !sess.refresh_token) throw new AuthError('Sessão expirada.', 'no_session', 401);
  if (!refreshing) {
    refreshing = call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: sess.refresh_token } })
      .then((d) => { write(fromToken(d)); return sess; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export const Auth = {
  user() { return userOf(sess); },
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },

  // Carrega a sessão salva; renova se estiver perto de vencer. Sem internet mantém a sessão salva.
  async init() {
    read();
    if (sess && sess.expires_at - 60 < Date.now() / 1000) {
      try { await refresh(); }
      catch (e) { if (e.status === 400 || e.status === 401 || e.status === 403) write(null); }
    }
    setInterval(() => {
      if (sess && sess.expires_at - 300 < Date.now() / 1000) refresh().catch((e) => { if (e.status === 400 || e.status === 401 || e.status === 403) write(null); });
    }, 4 * 60 * 1000);
    return this.user();
  },

  async accessToken() {
    if (!sess) throw new AuthError('Você não está conectado.', 'no_session', 401);
    if (sess.expires_at - 30 < Date.now() / 1000) await refresh();
    return sess.access_token;
  },

  async usernameAvailable(name) {
    const r = await call('/rest/v1/rpc/username_available', { body: { name } });
    return r === true;
  },

  async signUp({ email, password, username }) {
    const res = await call('/auth/v1/signup', { body: { email, password, data: { username } } });
    if (res && res.access_token) { write(fromToken(res)); return { signedIn: true }; }
    const u = res && (res.user || res);
    if (u && Array.isArray(u.identities) && u.identities.length === 0) throw new AuthError('Já existe uma conta com este e-mail.', 'user_already_exists', 422);
    return { signedIn: false };
  },

  async signIn({ email, password }) {
    const d = await call('/auth/v1/token?grant_type=password', { body: { email, password } });
    write(fromToken(d));
    return this.user();
  },

  async signOut() {
    const token = sess && sess.access_token;
    write(null);
    if (token) { try { await call('/auth/v1/logout', { token }); } catch { /* já saiu localmente */ } }
  },

  async recover(email) {
    await call('/auth/v1/recover?redirect_to=' + encodeURIComponent(SITE_URL), { body: { email } });
  },

  async updatePassword(password) {
    const token = await this.accessToken();
    await call('/auth/v1/user', { method: 'PUT', token, body: { password } });
  },

  // Links do e-mail (confirmar conta / recuperar senha) voltam para o site com tokens no #hash
  async handleHash() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw || !/(access_token|error)=/.test(raw)) return null;
    const q = new URLSearchParams(raw);
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    if (q.get('error')) return { error: friendly(400, { error_code: q.get('error_code') || '', error_description: (q.get('error_description') || '').replace(/\+/g, ' ') }) };
    const access = q.get('access_token');
    if (!access) return null;
    try {
      const user = await call('/auth/v1/user', { method: 'GET', token: access });
      write({ access_token: access, refresh_token: q.get('refresh_token'), expires_at: Math.floor(Date.now() / 1000) + Number(q.get('expires_in') || 3600), user });
      return { type: q.get('type') || 'signup' };
    } catch (e) { return { error: e.message }; }
  },
};

export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s).trim());
