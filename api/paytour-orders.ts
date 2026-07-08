const PT_KEY      = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET   = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
// Cloudflare Worker proxy — evita bloqueio do Bot Fight Mode da Cloudflare em IPs AWS
const PT_BASE      = 'https://paytour-proxy.hibiscusbeachclub.workers.dev';
const PROXY_SECRET = process.env.PAYTOUR_PROXY_SECRET ?? '';
const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';

let ptToken = '';
let ptTokenExpiry = 0;
const memCache = new Map<string, { orders: unknown[]; ts: number }>();
const fetchLock = new Map<string, Promise<unknown[]>>();   // in-flight lock

const TTL_TODAY = 10 * 60 * 1000;   // 10 min
const TTL_OTHER = 60 * 60 * 1000;   // 60 min
const PAGE_SIZE = 50;                // 50 itens/página — 40% menos chamadas
const PAGE_DELAY_MS = 150;           // pausa entre páginas

// ── Redis helpers (Upstash REST) ─────────────────────────────────────────────
async function kvGet(key: string): Promise<{ orders: unknown[]; ts: number } | null> {
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

async function kvSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${ttlSeconds}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

// ── Auth ─────────────────────────────────────────────────────────────────────
function proxyHeaders(extra: Record<string, string> = {}) {
  return { 'x-proxy-secret': PROXY_SECRET, 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.paytour.com.br', ...extra };
}

async function getPtToken() {
  if (ptToken && Date.now() < ptTokenExpiry) return ptToken;
  const creds = Buffer.from(`${PT_KEY}:${PT_SECRET}`).toString('base64');
  const res   = await fetch(`${PT_BASE}/v2/lojas/login?grant_type=application`, {
    method: 'POST',
    headers: proxyHeaders({ Authorization: `Basic ${creds}`, 'Content-Length': '0' }),
  });
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error(`Paytour auth retornou HTML (status ${res.status})`);
  const j = JSON.parse(text) as any;
  if (!j.access_token) throw new Error(`Paytour auth failed`);
  ptToken       = j.access_token;
  ptTokenExpiry = Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000;
  return ptToken;
}

async function paytourGet(path: string) {
  const tk  = await getPtToken();
  const res = await fetch(`${PT_BASE}${path}`, {
    headers: proxyHeaders({ Authorization: `Bearer ${tk}`, Accept: 'application/json' }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error(`Paytour retornou HTML (status ${res.status}) — rate limit`);
  return JSON.parse(text);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Busca pedidos por data de pedido ──────────────────────────────────────────
async function fetchOrders(since: string, until: string) {
  // Paytour armazena datas em BRT (UTC-3); usamos a mesma referência
  const today   = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const isToday = since === today && until === today;
  const maxPage = isToday ? 6 : 30;   // hoje: 6 pág; outros: 30 pág max (1500 pedidos) p/ evitar timeout
  const all: unknown[] = [];
  for (let page = 1; page <= maxPage; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    const data  = await paytourGet(`/v2/pedidos?por_pagina=${PAGE_SIZE}&pagina=${page}`) as any;
    const items = data?.itens ?? [];
    if (!items.length) break;
    let done = false;
    for (const o of items) {
      const d = (o.data_hora_pedido as string).slice(0, 10);
      if (d < since) { done = true; break; }
      if (d <= until) all.push(o);
    }
    if (done) break;
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }
  return all;
}

// ── Busca pedidos por data de visita via parâmetros nativos da API ────────────
// O endpoint /v2/pedidos aceita filtro por data de disponibilidade do produto.
// Isso evita a necessidade de buscar `itens` (que não vem na listagem).
async function fetchOrdersByVisitDate(visitSince: string, visitUntil: string) {
  const all: unknown[] = [];

  // Parâmetros testados com a API do Paytour para filtro por data de visita
  const dateParams = `disponibilidade_data_de=${visitSince}&disponibilidade_data_ate=${visitUntil}`;

  for (let page = 1; page <= 30; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    const data  = await paytourGet(
      `/v2/pedidos?por_pagina=${PAGE_SIZE}&pagina=${page}&${dateParams}`
    ) as any;
    const items = data?.itens ?? [];
    if (page === 1) {
      console.log(`[visita] pg1 total_paginas=${data?.info?.total_paginas} count=${items.length} params=${dateParams}`);
    }
    if (!items.length) break;
    for (const o of items) all.push(o);
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }

  console.log(`[visita] encontrados ${all.length} pedidos para visita ${visitSince}→${visitUntil}`);
  return all;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ orders: [] });

  // Paytour armazena datas em BRT (UTC-3); usamos a mesma referência
  const today   = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const since   = (req.query.since  as string) ?? today;
  const until   = (req.query.until  as string) ?? today;
  const filter  = (req.query.filter as string) ?? 'order';
  const isToday = since === today && until === today;
  const ttl     = isToday ? TTL_TODAY : TTL_OTHER;
  const ttlSec  = Math.floor(ttl / 1000);
  const key     = `pt6:${filter}:${since}_${until}`;

  // L1: memória (mesma instância serverless)
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.ts < ttl) {
    return res.json({ orders: mem.orders });
  }

  // L2: Redis (persiste entre cold starts e instâncias)
  const kv = await kvGet(key);
  if (kv && Date.now() - kv.ts < ttl) {
    memCache.set(key, kv);
    return res.json({ orders: kv.orders });
  }

  // L3: Lock in-flight — se já existe fetch em andamento para esta chave,
  //     aguarda o mesmo resultado em vez de disparar outro request à Paytour
  const existing = fetchLock.get(key);
  if (existing) {
    try {
      const orders = await existing;
      return res.json({ orders });
    } catch {
      if (kv) return res.json({ orders: kv.orders, stale: true });
      return res.status(503).json({ error: 'fetch in progress failed' });
    }
  }

  const fn      = filter === 'visita' ? fetchOrdersByVisitDate : fetchOrders;
  const promise = fn(since, until)
    .then((orders) => {
      const entry = { orders, ts: Date.now() };
      memCache.set(key, entry);
      // Não salva no KV resultado vazio para hoje — evita que rate-limit em branco
      // fique cacheado 10 min e mostre R$ 0 no "Ao Vivo"
      if (orders.length > 0 || !isToday) kvSet(key, entry, ttlSec).catch(() => {});
      fetchLock.delete(key);
      return orders;
    })
    .catch((err) => {
      fetchLock.delete(key);
      throw err;
    });

  fetchLock.set(key, promise);

  try {
    const orders = await promise;
    return res.json({ orders });
  } catch (err: any) {
    if (kv) return res.json({ orders: kv.orders, stale: true });
    console.error('[paytour]', err.message);
    // Sem cache e API indisponível — retorna vazio em vez de 500 para não quebrar a dash
    return res.json({ orders: [], error: err.message, unavailable: true });
  }
}
