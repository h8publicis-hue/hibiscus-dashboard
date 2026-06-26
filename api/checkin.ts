// Check-in online via painel Paytour (loja.hibiscusbeachclub.com.br).
// Usa PHPSESSID armazenado como env var — renovar quando a sessão expirar.

const LOJA_BASE   = 'https://loja.hibiscusbeachclub.com.br';
const PHPSESSID   = process.env.PAYTOUR_LOJA_SESSION ?? '';
const KV_URL      = process.env.KV_REST_API_URL      ?? '';
const KV_TOKEN    = process.env.KV_REST_API_TOKEN    ?? '';
const CACHE_TTL   = 5 * 60 * 1000;   // 5 min em memória
const KV_TTL_SEC  = 5 * 60;

let memCache: { data: CheckinData; ts: number } | null = null;

interface CheckinData {
  realizados: number;
  total: number;
  pendentes: number;
  produtos: { nome: string; realizados: number; total: number }[];
  ts: number;
}

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

async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${KV_TTL_SEC}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

function todayBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

async function fetchCheckin(): Promise<CheckinData> {
  const today = todayBRT();
  const start = `${today}T00:00:00.000-03:00`;
  const end   = `${today}T23:59:59.000-03:00`;
  const url   = `${LOJA_BASE}/admin/calendario?passeoIds=&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&isCheckin=1`;

  const res = await fetch(url, {
    headers: {
      Cookie: `PHPSESSID=${PHPSESSID}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${LOJA_BASE}/admin/checkin`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = await res.json() as any[];

  if (!Array.isArray(items)) throw new Error('Session expirada — renovar PAYTOUR_LOJA_SESSION');

  // Filtra só produtos de day use (exclui massagens e itens sem total relevante)
  // Agrupa por produto para mostrar no bloco
  const map: Record<string, { realizados: number; total: number }> = {};
  for (const item of items) {
    const nome = String(item.nome ?? '');
    if (!map[nome]) map[nome] = { realizados: 0, total: 0 };
    map[nome].realizados += Number(item.reservados ?? 0);
    map[nome].total      += Number(item.total ?? 0);
  }

  const produtos = Object.entries(map).map(([nome, v]) => ({ nome, ...v }));
  const realizados = produtos.reduce((s, p) => s + p.realizados, 0);
  const total      = produtos.reduce((s, p) => s + p.total, 0);

  return { realizados, total, pendentes: total - realizados, produtos, ts: Date.now() };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  if (!PHPSESSID) return res.status(503).json({ error: 'PAYTOUR_LOJA_SESSION não configurado' });

  const cacheKey = `checkin:${todayBRT()}`;

  // Memória
  if (memCache && Date.now() - memCache.ts < CACHE_TTL) {
    return res.json(memCache.data);
  }

  // Redis
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
    return res.status(500).json({ error: err.message });
  }
}
