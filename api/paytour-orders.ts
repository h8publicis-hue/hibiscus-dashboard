const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'https://api-ha.paytour.com.br';
const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';

let ptToken = '';
let ptTokenExpiry = 0;
const memCache = new Map<string, { orders: unknown[]; ts: number }>();
const TTL_TODAY = 5  * 60 * 1000;  // 5 min
const TTL_OTHER = 30 * 60 * 1000;  // 30 min

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

async function getPtToken() {
  if (ptToken && Date.now() < ptTokenExpiry) return ptToken;
  const creds = Buffer.from(`${PT_KEY}:${PT_SECRET}`).toString('base64');
  const res   = await fetch(`${PT_BASE}/v2/lojas/login?grant_type=application`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.paytour.com.br', 'Content-Length': '0' },
  });
  const j = await res.json() as any;
  if (!j.access_token) throw new Error(`Paytour auth failed`);
  ptToken       = j.access_token;
  ptTokenExpiry = Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000;
  return ptToken;
}

async function paytourGet(path: string) {
  const tk  = await getPtToken();
  const res = await fetch(`${PT_BASE}${path}`, {
    headers: { Authorization: `Bearer ${tk}`, 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.paytour.com.br', Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  return res.json();
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const PAGE_DELAY_MS = 120; // pausa entre páginas para não saturar a Paytour

async function fetchOrders(since: string, until: string) {
  const today   = new Date().toISOString().slice(0, 10);
  const isToday = since === today && until === today;
  const maxPage = isToday ? 10 : 9999;
  const all: unknown[] = [];
  for (let page = 1; page <= maxPage; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    const data  = await paytourGet(`/v2/pedidos?por_pagina=30&pagina=${page}`) as any;
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

// Filtra por data de visita — lookback de 3 meses (reservas antecipadas raras acima disso)
async function fetchOrdersByVisitDate(visitSince: string, visitUntil: string) {
  const cutoff = new Date(visitSince);
  cutoff.setMonth(cutoff.getMonth() - 3);
  const orderCutoff = cutoff.toISOString().slice(0, 10);

  const all: unknown[] = [];
  for (let page = 1; page <= 9999; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    const data  = await paytourGet(`/v2/pedidos?por_pagina=30&pagina=${page}`) as any;
    const items = data?.itens ?? [];
    if (!items.length) break;
    let done = false;
    for (const o of items) {
      const d = (o.data_hora_pedido as string).slice(0, 10);
      if (d < orderCutoff) { done = true; break; }
      const itens = (o.itens ?? []) as any[];
      const hasVisit = itens.some((item: any) => {
        const vd = (item.produto_disponibilidade_data as string)?.slice(0, 10);
        return vd && vd >= visitSince && vd <= visitUntil;
      });
      if (hasVisit) all.push(o);
    }
    if (done) break;
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }
  return all;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ orders: [] });

  const today  = new Date().toISOString().slice(0, 10);
  const since  = (req.query.since  as string) ?? today;
  const until  = (req.query.until  as string) ?? today;
  const filter = (req.query.filter as string) ?? 'order';
  const isToday = since === today && until === today;
  const ttl     = isToday ? TTL_TODAY : TTL_OTHER;
  const ttlSec  = ttl / 1000;
  const key     = `pt:${filter}:${since}_${until}`;

  // L1: in-memory (hot path within same function instance)
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.ts < ttl) {
    return res.json({ orders: mem.orders });
  }

  // L2: Redis (survives cold starts)
  const kv = await kvGet(key);
  if (kv && Date.now() - kv.ts < ttl) {
    memCache.set(key, kv);
    return res.json({ orders: kv.orders });
  }

  try {
    const fn     = filter === 'visita' ? fetchOrdersByVisitDate : fetchOrders;
    const orders = await fn(since, until);
    const entry  = { orders, ts: Date.now() };
    memCache.set(key, entry);
    kvSet(key, entry, ttlSec).catch(() => {});   // async, don't await
    return res.json({ orders });
  } catch (err: any) {
    // Return stale data if available rather than an error
    if (kv) return res.json({ orders: kv.orders, stale: true });
    console.error('[paytour]', err.message);
    return res.status(500).json({ error: String(err) });
  }
}
