// Faturamento do mês corrente — soma pedidos aprovados via Paytour API.
// Filtra por data de pedido (data_hora_pedido), máx 10 páginas por requisição.
// Cache Redis 1h — sem impacto no WiFi após primeira carga.

const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'https://api-ha.paytour.com.br';
const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';
const TTL       = 60 * 60 * 1000;
const PAGE_SIZE = 50;

let ptToken = ''; let ptTokenExpiry = 0;
let memCache: { revenue: number; ts: number } | null = null;

async function kvGet(key: string) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    const j = await r.json() as any;
    const raw = j?.result;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}
async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${Math.floor(TTL/1000)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

async function getPtToken() {
  if (ptToken && Date.now() < ptTokenExpiry) return ptToken;
  const creds = Buffer.from(`${PT_KEY}:${PT_SECRET}`).toString('base64');
  const res = await fetch(`${PT_BASE}/v2/lojas/login?grant_type=application`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.paytour.com.br', 'Content-Length': '0' },
  });
  const j = await res.json() as any;
  if (!j.access_token) throw new Error('Paytour auth failed');
  ptToken = j.access_token;
  ptTokenExpiry = Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000;
  return ptToken;
}

async function paytourGet(path: string) {
  const tk = await getPtToken();
  const res = await fetch(`${PT_BASE}${path}`, {
    headers: { Authorization: `Bearer ${tk}`, 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.paytour.com.br', Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  return res.json();
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function calcRevenue(since: string, until: string): Promise<{ revenue: number; count: number }> {
  let revenue = 0; let count = 0;
  for (let page = 1; page <= 10; page++) {
    if (page > 1) await sleep(200);
    const data  = await paytourGet(`/v2/pedidos?por_pagina=${PAGE_SIZE}&pagina=${page}`) as any;
    const items: any[] = data?.itens ?? [];
    if (page === 1) console.log(`[fat] pg1 total_pag=${data?.info?.total_paginas} count=${items.length}`);
    if (!items.length) break;
    let pastRange = false;
    for (const o of items) {
      const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
      if (d < since) { pastRange = true; break; }
      if (d <= until && (o.status === 'aprovado' || o.status === 'confirmado')) {
        revenue += parseFloat(o.valor || '0');
        count++;
      }
    }
    if (pastRange) break;
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }
  console.log(`[fat] R$ ${revenue.toFixed(2)} (${count} pedidos aprovados ${since}→${until})`);
  return { revenue, count };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ revenue: 0 });

  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const since = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  const key   = `ptf5:${since}_${until}`;

  if (memCache && Date.now() - memCache.ts < TTL) return res.json({ revenue: memCache.revenue, since, until });
  const kv = await kvGet(key);
  if (kv && Date.now() - kv.ts < TTL) { memCache = kv; return res.json({ revenue: kv.revenue, since, until }); }

  try {
    const { revenue, count } = await calcRevenue(since, until);
    const entry = { revenue, ts: Date.now() };
    memCache = entry;
    kvSet(key, entry);
    return res.json({ revenue, since, until, count });
  } catch (err: any) {
    console.error('[fat]', err.message);
    if (memCache) return res.json({ revenue: memCache.revenue, since, until, stale: true });
    return res.status(500).json({ error: String(err) });
  }
}
