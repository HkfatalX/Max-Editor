// Max Editor — assistente de IA. A chave do Groq fica SÓ no servidor (função "max-ai" do Supabase); o app nunca a vê.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { Auth } from './auth.js';

export async function askAI({ prompt, history = [], context = null }) {
  const token = await Auth.accessToken();
  if (!token) throw new Error('Entre na sua conta para usar a IA.');
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/functions/v1/max-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify({ prompt, history: history.slice(-6), context }),
    });
  } catch { throw new Error('Sem internet para falar com a IA.'); }
  let d = {};
  try { d = await r.json(); } catch { /* resposta vazia */ }
  if (!r.ok) throw new Error(d.error || 'A IA não respondeu agora.');
  return { reply: String(d.reply || ''), actions: Array.isArray(d.actions) ? d.actions : [] };
}
