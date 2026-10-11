// Check-in: dados via API oficial Paytour — GET /v2/atividades?data_de=hoje&data_ate=hoje
// Não depende de PHPSESSID nem loja. Usa as mesmas credenciais de app já configuradas.

const PT_BASE     = 'https://api.paytour.com.br';
const PT_KEY      = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET   = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PROXY_SECRET = process.env.PAYTOUR_PROXY_SECRET   ?? '';
const KV_URL      = process.env.KV_REST_API_URL         ?? '';
const KV_TOKEN    = process.env.KV_REST_API_TOKEN       ?? '';

const CACHE_TTL   = 5 * 60 * 1000; // 5 min
const KV_TTL_SEC  = 5 * 60;

export interface CheckinData {
  reservados:    number;
  sessionActive: boolean;
  checkins?:     number;
  pendentes?:    number;
  disponiveis?:  number;
  total?:        number;
  ts:            number;
  stale?:        boolean;
}

let memCache: { data: CheckinData; ts: number } | null = null;

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

// ── Paytour token ─────────────────────────────────────────────────────────────
let ptTokenCache: { token: string; exp: number } | null = null;

function proxyHeaders(extra: Record<string, string> = {}) {
  return {
    'x-proxy-secret': PROXY_SECRET,
    'User-Agent': 'Mozilla/5.0',
    Origin: 'https://app.paytour.com.br',
    ...extra,
  };
}

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
    if (attempt < 3) {
      ptTokenCache = null;
      await new Promise(res => setTimeout(res, 1000 * attempt));
      return getPtToken(attempt + 1);
    }
    throw new Error(`Paytour auth retornou bloqueio (${r.status})`);
  }
  const j = JSON.parse(text) as any;
  const token = j.access_token ?? '';
  if (!token) throw new Error('getPtToken: sem access_token');
  ptTokenCache = { token, exp: Date.now() + (j.expires_in ?? 1800) * 1000 };
  return token;
}

// ── Vagas disponíveis via /passeios/{id}/horarios?dia=hoje ────────────────────
async function fetchVagasPorProduto(produtoId: string, dia: string, token: string): Promise<number | null> {
  try {
    const r = await fetch(`${PT_BASE}/v2/passeios/${produtoId}/horarios?dia=${dia}`, {
      headers: proxyHeaders({ Authorization: `Bearer ${token}`, Accept: 'application/json' }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const j = await r.json() as any;
    const slots: any[] = Array.isArray(j) ? j : (j?.data ?? j?.horarios ?? []);
    // Soma vagas de todos os horários do dia (normalmente 1 slot/dia para day use)
    const total = slots.reduce((acc: number, s: any) => {
      const v = s?.vagas ?? s?.vagas_disponiveis ?? s?.disponivel ?? s?.disponivel_venda ?? null;
      return v != null ? acc + Number(v) : acc;
    }, 0);
    return slots.length > 0 ? total : null;
  } catch { return null; }
}

// ── Fetch atividades do dia ───────────────────────────────────────────────────
async function fetchCheckin(): Promise<CheckinData> {
  const today = todayBRT();
  const token = await getPtToken();

  const r = await fetch(`${PT_BASE}/v2/atividades?data_de=${today}&data_ate=${today}`, {
    headers: proxyHeaders({ Authorization: `Bearer ${token}`, Accept: 'application/json' }),
    signal: AbortSignal.timeout(15_000),
  });

  if (r.status === 401 || r.status === 403) {
    ptTokenCache = null;
    throw new Error(`atividades: ${r.status}`);
  }
  if (!r.ok) throw new Error(`atividades: ${r.status}`);

  const atividades = await r.json() as any[];
  if (!Array.isArray(atividades)) throw new Error('atividades: resposta inesperada');

  const reservados = atividades.length;
  const checkins   = atividades.filter(a => a.utilizado && String(a.utilizado) !== '0').length;
  const pendentes  = reservados - checkins;

  // Disponíveis: soma vagas dos horários do dia por produto_id
  let disponiveis: number | undefined;
  const prodIds = [...new Set(atividades.map((a: any) => String(a.produto_id)).filter(Boolean))];
  if (prodIds.length > 0) {
    const vagas = await Promise.all(prodIds.map(id => fetchVagasPorProduto(id, today, token)));
    const total = vagas.reduce((acc, v) => acc != null && v != null ? acc + v : acc ?? v, null as number | null);
    if (total != null) disponiveis = total;
  }

  return {
    reservados,
    sessionActive: true,
    checkins,
    pendentes,
    ...(disponiveis != null ? { disponiveis } : {}),
    ts: Date.now(),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const cacheKey = `checkin-v3:${todayBRT()}`;
  const fresh = req.query?.fresh === '1';

  if (!fresh && memCache && Date.now() - memCache.ts < CACHE_TTL) return res.json(memCache.data);

  if (!fresh) {
    const kv = await kvGet(cacheKey) as CheckinData | null;
    if (kv && Date.now() - kv.ts < CACHE_TTL) {
      memCache = { data: kv, ts: kv.ts };
      return res.json(kv);
    }
  }

  try {
    const data = await fetchCheckin();
    memCache = { data, ts: data.ts };
    kvSet(cacheKey, data);
    return res.json(data);
  } catch (err: any) {
    console.error('[checkin]', err.message);
    if (memCache) return res.json({ ...memCache.data, stale: true });
    return res.status(503).json({ error: err.message, reservados: 0, sessionActive: false, ts: Date.now() });
  }
}
