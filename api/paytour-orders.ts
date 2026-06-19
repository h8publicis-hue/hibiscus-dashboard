const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'https://api-ha.paytour.com.br';

let ptToken = '';
let ptTokenExpiry = 0;
const memCache = new Map<string, { orders: unknown[]; ts: number }>();
const TTL_TODAY = 2 * 60 * 1000;
const TTL_OTHER = 10 * 60 * 1000;

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

async function fetchOrders(since: string, until: string) {
  const today   = new Date().toISOString().slice(0, 10);
  const isToday = since === today && until === today;
  const maxPage = isToday ? 10 : 9999;
  const all: unknown[] = [];
  for (let page = 1; page <= maxPage; page++) {
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

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ orders: [] });

  const today = new Date().toISOString().slice(0, 10);
  const since = (req.query.since as string) ?? today;
  const until = (req.query.until as string) ?? today;
  const key   = `${since}_${until}`;
  const ttl   = (since === today && until === today) ? TTL_TODAY : TTL_OTHER;

  const cached = memCache.get(key);
  if (cached) {
    if (Date.now() - cached.ts > ttl) {
      fetchOrders(since, until).then((orders) => memCache.set(key, { orders, ts: Date.now() })).catch(() => {});
    }
    return res.json({ orders: cached.orders, stale: Date.now() - cached.ts > ttl });
  }

  try {
    const orders = await fetchOrders(since, until);
    memCache.set(key, { orders, ts: Date.now() });
    return res.json({ orders });
  } catch (err: any) {
    console.error('[paytour]', err.message);
    return res.status(500).json({ error: String(err) });
  }
}
