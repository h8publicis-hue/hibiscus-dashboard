// Check-in online via painel Paytour (loja.hibiscusbeachclub.com.br).
// Auto-login: quando a sessão expira, faz login automático e renova o PHPSESSID.

const LOJA_BASE  = 'https://loja.hibiscusbeachclub.com.br';
const LOJA_USER  = process.env.PAYTOUR_LOJA_USER    ?? '';
const LOJA_PASS  = process.env.PAYTOUR_LOJA_PASS    ?? '';
const KV_URL     = process.env.KV_REST_API_URL       ?? '';
const KV_TOKEN   = process.env.KV_REST_API_TOKEN     ?? '';
const CACHE_TTL  = 5 * 60 * 1000;
const KV_TTL_SEC = 5 * 60;
const SESSION_KV = 'checkin:session';

// Sessão ativa em memória (persiste enquanto a instância serverless vive)
let activeSession = process.env.PAYTOUR_LOJA_SESSION ?? '';
let memCache: { data: CheckinData; ts: number } | null = null;

export interface CheckinData {
  reservados: number;
  disponiveis: number;
  checkins: number;
  pendentes: number;
  total: number;
  ts: number;
}

// ── KV helpers ────────────────────────────────────────────────────────────────
async function kvGet(key: string) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const j = await r.json() as any;
    const raw = j?.result;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}

async function kvSet(key: string, value: unknown, ttlSec = KV_TTL_SEC) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${ttlSec}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

function todayBRT(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ── Auto-login ────────────────────────────────────────────────────────────────
async function doLogin(): Promise<string> {
  if (!LOJA_USER || !LOJA_PASS) throw new Error('Credenciais não configuradas (PAYTOUR_LOJA_USER / PAYTOUR_LOJA_PASS)');

  // Passo 1: GET na página de login — PHP cria a sessão e envia PHPSESSID via Set-Cookie
  const getRes = await fetch(`${LOJA_BASE}/admin/login`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });

  // Captura o PHPSESSID inicial e qualquer token CSRF da página
  const getCookies  = getRes.headers.get('set-cookie') ?? '';
  const initSession = getCookies.match(/PHPSESSID=([^;]+)/i)?.[1] ?? '';
  const html        = await getRes.text();
  const csrfToken   = html.match(/name=["']?_token["']?\s+(?:type=["']hidden["']\s+)?value=["']([^"']+)["']/i)?.[1]
                   ?? html.match(/name=["']?csrf_token["']?\s+(?:type=["']hidden["']\s+)?value=["']([^"']+)["']/i)?.[1]
                   ?? '';

  // Passo 2: POST com credenciais — PHP valida e a sessão inicial torna-se autenticada
  // Campos confirmados via debug: "login" e "senha"; endpoint: /admin (não /admin/login)
  const bodyFields: Record<string, string> = { login: LOJA_USER, senha: LOJA_PASS };
  if (csrfToken) bodyFields['_token'] = csrfToken;

  const postRes = await fetch(`${LOJA_BASE}/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,*/*',
      Referer: `${LOJA_BASE}/admin/login`,
      Cookie: initSession ? `PHPSESSID=${initSession}` : '',
    },
    body: new URLSearchParams(bodyFields).toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });

  // Após POST bem-sucedido, o initSession já fica autenticado (sem novo cookie)
  const postCookies = postRes.headers.get('set-cookie') ?? '';
  const newSession  = postCookies.match(/PHPSESSID=([^;]+)/i)?.[1] ?? initSession;

  if (!newSession) throw new Error('Auto-login falhou — sem PHPSESSID na resposta');

  // Login aceito = 302 para /admin; falha = qualquer referência a /login
  const location = postRes.headers.get('location') ?? '';
  if (location.includes('login')) {
    throw new Error('Auto-login rejeitado — credenciais inválidas');
  }

  console.log('[checkin] auto-login OK, sessão:', newSession.slice(0, 8) + '...');
  return newSession;
}

async function getSession(): Promise<string> {
  // 1. Usa sessão em memória
  if (activeSession) return activeSession;

  // 2. Busca no KV (persiste entre instâncias)
  const kv = await kvGet(SESSION_KV) as string | null;
  if (kv) { activeSession = kv; return kv; }

  // 3. Auto-login
  const newSession = await doLogin();
  activeSession = newSession;
  await kvSet(SESSION_KV, newSession, 23 * 60 * 60); // 23h no KV
  return newSession;
}

// ── Loja fetch com sessão dinâmica ────────────────────────────────────────────
function lojaFetch(path: string, session: string) {
  return fetch(`${LOJA_BASE}${path}`, {
    headers: {
      Cookie: `PHPSESSID=${session}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${LOJA_BASE}/admin/checkin`,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

function isSessionExpired(text: string, status: number): boolean {
  if (status === 401 || status === 403) return true;
  if (text.trim().startsWith('<')) return true;
  return false;
}

// ── Fetch check-in com auto-retry após login ──────────────────────────────────
async function fetchCheckin(): Promise<CheckinData> {
  const today = todayBRT();
  const start = `${today}T00:00:00.000-03:00`;
  const end   = `${today}T23:59:59.000-03:00`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getSession();

    const calRes = await lojaFetch(
      `/admin/calendario?passeoIds=&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&isCheckin=1`,
      session,
    );

    const rawText = await calRes.text();

    if (isSessionExpired(rawText, calRes.status)) {
      console.log('[checkin] sessão expirada, tentando auto-login...');
      // Limpa sessão e força novo login na próxima iteração
      activeSession = '';
      await kvSet(SESSION_KV, '', 1);
      if (attempt === 1) throw new Error('Sessão expirada e auto-login falhou');
      continue;
    }

    const items = JSON.parse(rawText) as any[];
    if (!Array.isArray(items)) throw new Error('Resposta inesperada do calendário');

    const dayuse = items.find((i: any) => i.type === 'faixa') ?? items[0];
    if (!dayuse) throw new Error('Nenhum item de day use encontrado');

    const disponibilidadeId = dayuse.id;
    const total      = Number(dayuse.total     ?? 0);
    const reservados = Number(dayuse.reservados ?? 0);
    const disponiveis = total - reservados;

    const vRes = await lojaFetch(`/admin/checkin/vouchers-by-availability/${disponibilidadeId}`, session);
    let checkins = 0;
    if (vRes.ok) {
      const vData = await vRes.json() as any;
      const vouchers: any[] = vData?.vouchers ?? [];
      checkins = vouchers.filter((v: any) => v.utilizado === true).length;
    }

    return { reservados, disponiveis, checkins, pendentes: reservados - checkins, total, ts: Date.now() };
  }

  throw new Error('Não foi possível buscar check-in após retentativas');
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // POST /api/checkin → login manual pelo dashboard
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      const user = body.login ?? body.email ?? '';
      const pass = body.senha ?? '';
      if (!user || !pass) return res.status(400).json({ ok: false, error: 'login e senha obrigatórios' });

      // Usa doLogin() com as credenciais fornecidas — sobrescreve env vars temporariamente
      const origUser = process.env.PAYTOUR_LOJA_USER;
      const origPass = process.env.PAYTOUR_LOJA_PASS;
      (process.env as any).PAYTOUR_LOJA_USER = user;
      (process.env as any).PAYTOUR_LOJA_PASS = pass;

      let session: string;
      try {
        session = await doLogin();
      } finally {
        (process.env as any).PAYTOUR_LOJA_USER = origUser;
        (process.env as any).PAYTOUR_LOJA_PASS = origPass;
      }

      activeSession = session;
      await kvSet(SESSION_KV, session, 23 * 60 * 60);
      memCache = null; // força busca com sessão nova
      return res.json({ ok: true, session: session.slice(0, 8) + '...' });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e.message });
    }
  }

  const cacheKey = `checkin:${todayBRT()}`;

  if (memCache && Date.now() - memCache.ts < CACHE_TTL) return res.json(memCache.data);

  const kv = await kvGet(cacheKey) as CheckinData | null;
  if (kv && Date.now() - kv.ts < CACHE_TTL) {
    memCache = { data: kv, ts: kv.ts };
    return res.json(kv);
  }

  try {
    const data = await fetchCheckin();
    memCache = { data, ts: data.ts };
    kvSet(cacheKey, data);
    return res.json(data);
  } catch (err: any) {
    console.error('[checkin]', err.message);
    if (memCache) return res.json({ ...memCache.data, stale: true });
    const sessionExpired = err.message?.toLowerCase().includes('expirada') ||
                           err.message?.toLowerCase().includes('login');
    return res.status(503).json({ error: err.message, sessionExpired });
  }
}
