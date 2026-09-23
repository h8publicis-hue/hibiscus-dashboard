// Check-in: Paytour API (sempre) + loja opcional (sessão para check-ins físicos).
// Auto-login com LOJA_ADMIN_EMAIL + LOJA_ADMIN_PASSWORD quando sessão expira.

const LOJA_BASE       = 'https://paytour-proxy.hibiscusbeachclub.workers.dev/loja';
const PT_BASE         = 'https://api.paytour.com.br';
const PT_KEY          = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET       = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PROXY_SECRET    = process.env.PAYTOUR_PROXY_SECRET    ?? '';
const KV_URL          = process.env.KV_REST_API_URL         ?? '';
const KV_TOKEN        = process.env.KV_REST_API_TOKEN       ?? '';
const LOJA_EMAIL      = process.env.LOJA_ADMIN_EMAIL        ?? '';
const LOJA_PASSWORD   = process.env.LOJA_ADMIN_PASSWORD     ?? '';
const CACHE_TTL    = 30 * 60 * 1000;
const KV_TTL_SEC   = 30 * 60;
const SESSION_KV   = 'checkin:session';

let activeSession = process.env.PAYTOUR_LOJA_SESSION ?? '';
let memCache: { data: CheckinData; ts: number } | null = null;

export interface CheckinData {
  reservados: number;     // da API Paytour (sempre disponível)
  sessionActive: boolean; // loja session ativa?
  disponiveis?: number;   // da loja (opcional)
  checkins?: number;      // da loja (opcional)
  pendentes?: number;     // da loja (opcional)
  total?: number;         // da loja (opcional)
  ts: number;
  stale?: boolean;
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

// ── Paytour API helpers ───────────────────────────────────────────────────────
function proxyHeaders(extra: Record<string, string> = {}) {
  return {
    'x-proxy-secret': PROXY_SECRET,
    'User-Agent': 'Mozilla/5.0',
    Origin: 'https://app.paytour.com.br',
    ...extra,
  };
}

let ptTokenCache: { token: string; exp: number } | null = null;

async function getPtToken(attempt = 1): Promise<string> {
  if (ptTokenCache && Date.now() < ptTokenCache.exp - 30_000) return ptTokenCache.token;
  const creds = Buffer.from(`${PT_KEY}:${PT_SECRET}`).toString('base64');
  const r = await fetch(`${PT_BASE}/v2/lojas/login?grant_type=application`, {
    method: 'POST',
    headers: proxyHeaders({ Authorization: `Basic ${creds}`, 'Content-Length': '0' }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await r.text();
  if (text.trim().startsWith('<') || r.status === 403) {
    console.warn(`[checkin] getPtToken HTML/403 attempt=${attempt} status=${r.status}`);
    if (attempt < 3) {
      ptTokenCache = null;
      await new Promise(res => setTimeout(res, 1000 * attempt));
      return getPtToken(attempt + 1);
    }
    throw new Error(`[checkin] Paytour auth retornou HTML (status ${r.status})`);
  }
  const j = JSON.parse(text) as any;
  const token = j.access_token ?? '';
  if (!token) throw new Error('getPtToken: sem access_token');
  ptTokenCache = { token, exp: Date.now() + (j.expires_in ?? 1800) * 1000 };
  return token;
}

async function getPaytourReservados(attempt = 1): Promise<number> {
  const today = todayBRT();
  const token = await getPtToken();
  const url = `${PT_BASE}/v2/pedidos?status=aprovado&disponibilidade_data_de=${today}&disponibilidade_data_ate=${today}&por_pagina=1&pagina=1`;
  const r = await fetch(url, {
    headers: proxyHeaders({ Authorization: `Bearer ${token}`, Accept: 'application/json' }),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401 || r.status === 403) {
    console.warn(`[checkin] getPaytourReservados ${r.status} attempt=${attempt}`);
    if (attempt < 3) {
      ptTokenCache = null;
      await new Promise(res => setTimeout(res, 800 * attempt));
      return getPaytourReservados(attempt + 1);
    }
    throw new Error(`getPaytourReservados: ${r.status}`);
  }
  if (!r.ok) throw new Error(`getPaytourReservados: ${r.status}`);
  const j = await r.json() as any;
  return Number(j?.info?.total ?? j?.itens?.length ?? 0);
}

// ── Loja session + auto-login ─────────────────────────────────────────────────
async function lojaAutoLogin(): Promise<string> {
  if (!LOJA_EMAIL || !LOJA_PASSWORD) throw new Error('Credenciais LOJA_ADMIN_EMAIL/PASSWORD não configuradas');

  // Endpoints conhecidos da loja Paytour (tenta em ordem)
  const attempts = [
    { path: '/admin/auth/login',    body: JSON.stringify({ email: LOJA_EMAIL, password: LOJA_PASSWORD }), ct: 'application/json' },
    { path: '/admin/auth/login',    body: JSON.stringify({ email: LOJA_EMAIL, senha: LOJA_PASSWORD }),    ct: 'application/json' },
    { path: '/admin/login',         body: `email=${encodeURIComponent(LOJA_EMAIL)}&password=${encodeURIComponent(LOJA_PASSWORD)}`, ct: 'application/x-www-form-urlencoded' },
    { path: '/admin/usuarios/login',body: JSON.stringify({ email: LOJA_EMAIL, password: LOJA_PASSWORD }), ct: 'application/json' },
  ];

  for (const ep of attempts) {
    let r: Response;
    try {
      r = await fetch(`${LOJA_BASE}${ep.path}`, {
        method: 'POST',
        headers: {
          'x-proxy-secret': PROXY_SECRET,
          'Content-Type': ep.ct,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json, text/html, */*',
        },
        body: ep.body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch { continue; }

    // PHPSESSID no Set-Cookie
    const setCookie = r.headers.get('set-cookie') ?? '';
    const match = setCookie.match(/PHPSESSID=([^;,\s]+)/i);
    if (match?.[1]) {
      const session = match[1];
      activeSession = session;
      await kvSet(SESSION_KV, session, 23 * 60 * 60);
      console.log(`[checkin] auto-login OK via ${ep.path} (status ${r.status})`);
      return session;
    }

    // Fallback: PHPSESSID no corpo (alguns setups retornam no JSON)
    const text = await r.text().catch(() => '');
    const bodyMatch = text.match(/PHPSESSID[=:][\s"']*([a-zA-Z0-9]+)/i);
    if (bodyMatch?.[1]) {
      const session = bodyMatch[1];
      activeSession = session;
      await kvSet(SESSION_KV, session, 23 * 60 * 60);
      console.log(`[checkin] auto-login body OK via ${ep.path}`);
      return session;
    }

    console.warn(`[checkin] auto-login ${ep.path} status=${r.status} setCookie="${setCookie.slice(0,80)}"`);
  }

  throw new Error('Auto-login falhou — nenhum endpoint retornou PHPSESSID');
}

async function getSession(): Promise<string> {
  if (activeSession) return activeSession;
  const kv = await kvGet(SESSION_KV) as string | null;
  if (kv) { activeSession = kv; return kv; }
  // Sem sessão salva — tenta auto-login
  if (LOJA_EMAIL && LOJA_PASSWORD) {
    try { return await lojaAutoLogin(); } catch (e: any) { console.warn('[checkin] auto-login inicial falhou:', e.message); }
  }
  return '';
}

function lojaFetch(path: string, session: string) {
  return fetch(`${LOJA_BASE}${path}`, {
    headers: {
      'x-proxy-secret': PROXY_SECRET,
      Cookie: `PHPSESSID=${session}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://loja.hibiscusbeachclub.com.br/admin/checkin',
    },
    signal: AbortSignal.timeout(10_000),
  });
}

function isSessionExpired(text: string, status: number): boolean {
  if (status === 401 || status === 403) return true;
  if (text.trim().startsWith('<')) return true;
  return false;
}

// ── Fetch data ────────────────────────────────────────────────────────────────
async function fetchCheckin(): Promise<CheckinData> {
  const today = todayBRT();
  const start = `${today}T00:00:00.000-03:00`;
  const end   = `${today}T23:59:59.000-03:00`;

  // Paytour API — sempre funciona via Worker
  const reservados = await getPaytourReservados();

  // Loja — opcional, só se houver PHPSESSID
  const session = await getSession();
  if (!session) return { reservados, sessionActive: false, ts: Date.now() };

  const calRes = await lojaFetch(
    `/admin/calendario?passeoIds=&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&isCheckin=1`,
    session,
  );
  const rawText = await calRes.text();

  if (isSessionExpired(rawText, calRes.status)) {
    activeSession = '';
    await kvSet(SESSION_KV, '', 1);
    // Tenta auto-login e refaz a chamada uma vez
    if (LOJA_EMAIL && LOJA_PASSWORD) {
      try {
        const newSession = await lojaAutoLogin();
        const retryRes  = await lojaFetch(
          `/admin/calendario?passeoIds=&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&isCheckin=1`,
          newSession,
        );
        const retryText = await retryRes.text();
        if (!isSessionExpired(retryText, retryRes.status)) {
          // Continua com retryText — reassina variáveis locais
          const retryItems = JSON.parse(retryText) as any[];
          if (Array.isArray(retryItems)) {
            const dayuse2 = retryItems.find((i: any) => i.type === 'faixa') ?? retryItems[0];
            if (dayuse2) {
              const total2       = Number(dayuse2.total      ?? 0);
              const lojaRes2     = Number(dayuse2.reservados ?? 0);
              const vRes2 = await lojaFetch(`/admin/checkin/vouchers-by-availability/${dayuse2.id}`, newSession);
              let checkins2 = 0;
              if (vRes2.ok) {
                const vData2 = await vRes2.json() as any;
                checkins2 = (vData2?.vouchers ?? []).filter((v: any) => v.utilizado === true).length;
              }
              return { reservados: lojaRes2, sessionActive: true, disponiveis: total2 - lojaRes2, checkins: checkins2, pendentes: lojaRes2 - checkins2, total: total2, ts: Date.now() };
            }
          }
        }
      } catch (e: any) { console.warn('[checkin] auto-login pós-expiração falhou:', e.message); }
    }
    return { reservados, sessionActive: false, ts: Date.now() };
  }

  const items = JSON.parse(rawText) as any[];
  if (!Array.isArray(items)) return { reservados, sessionActive: false, ts: Date.now() };

  const dayuse = items.find((i: any) => i.type === 'faixa') ?? items[0];
  if (!dayuse) return { reservados, sessionActive: false, ts: Date.now() };

  const total       = Number(dayuse.total      ?? 0);
  const lojaRes     = Number(dayuse.reservados ?? 0);
  const disponiveis = total - lojaRes;

  const vRes = await lojaFetch(`/admin/checkin/vouchers-by-availability/${dayuse.id}`, session);
  let checkins = 0;
  if (vRes.ok) {
    const vData = await vRes.json() as any;
    const vouchers: any[] = vData?.vouchers ?? [];
    checkins = vouchers.filter((v: any) => v.utilizado === true).length;
  }

  return {
    reservados: lojaRes,   // da loja — correto para o dia, não o histórico Paytour
    sessionActive: true,
    disponiveis,
    checkins,
    pendentes: lojaRes - checkins,
    total,
    ts: Date.now(),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // GET ?action=keepalive → ping para renovar sessão (chamado pelo cron)
  if (req.method === 'GET' && req.query?.action === 'keepalive') {
    const session = await getSession();
    if (!session) return res.status(503).json({ ok: false, error: 'Sem sessão ativa' });
    try {
      const today = todayBRT();
      const r = await lojaFetch(
        `/admin/calendario?passeoIds=&start=${encodeURIComponent(today + 'T00:00:00.000-03:00')}&end=${encodeURIComponent(today + 'T23:59:59.000-03:00')}&isCheckin=1`,
        session,
      );
      const text = await r.text();
      const alive = !isSessionExpired(text, r.status);
      if (alive) {
        await kvSet(`checkin:${today}`, '', 1); // invalida cache para dados frescos
      }
      await kvSet('checkin:keepalive', { ok: alive, ts: Date.now() });
      return res.json({ ok: alive, ts: new Date().toISOString(), message: alive ? 'Sessão ativa' : 'Sessão expirada' });
    } catch (err: any) {
      return res.status(200).json({ ok: false, error: String(err) });
    }
  }

  // POST → salva PHPSESSID
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      const user = body.login ?? body.email ?? '';
      const pass = body.senha ?? '';
      if (!user || !pass) return res.status(400).json({ ok: false, error: 'login e senha obrigatórios' });

      const session = user === '__phpsessid__' ? pass : (() => { throw new Error('Use PHPSESSID direto'); })();

      // Valida
      const today = todayBRT();
      const testRes = await lojaFetch(
        `/admin/calendario?passeoIds=&start=${encodeURIComponent(today + 'T00:00:00.000-03:00')}&end=${encodeURIComponent(today + 'T23:59:59.000-03:00')}&isCheckin=1`,
        session,
      );
      const testText = await testRes.text();
      console.log('[checkin] validação status:', testRes.status, 'url:', testRes.url, 'body[:100]:', testText.slice(0, 100));
      if (isSessionExpired(testText, testRes.status)) {
        throw new Error('Sessão inválida — PHPSESSID não autenticado. Faça login no Paytour primeiro.');
      }

      activeSession = session;
      await kvSet(SESSION_KV, session, 23 * 60 * 60);
      memCache = null;
      // Invalida cache do dia e busca dados frescos imediatamente
      await kvSet(`checkin:${todayBRT()}`, '', 1);
      const freshData = await fetchCheckin();
      memCache = { data: freshData, ts: freshData.ts };
      kvSet(`checkin:${todayBRT()}`, freshData);
      return res.json({ ok: true, session: session.slice(0, 8) + '...', data: freshData });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e.message });
    }
  }

  // DELETE → limpa sessão
  if (req.method === 'DELETE') {
    activeSession = '';
    await kvSet(SESSION_KV, '', 1);
    memCache = null;
    return res.json({ ok: true });
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
    return res.status(503).json({ error: err.message });
  }
}
