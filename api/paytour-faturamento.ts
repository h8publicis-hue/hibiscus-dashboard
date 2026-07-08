// Faturamento do mês — pagina todos os pedidos do mês corrente por data de pedido.
// Mesmo algoritmo do seletor de período (confirmado + aprovado, ordem cronológica reversa).
// Cache KV 10 min — max 12 páginas × 50 pedidos = 600 pedidos por refresh.

const PT_KEY       = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET    = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE      = 'https://paytour-proxy.hibiscusbeachclub.workers.dev';
const PROXY_SECRET = process.env.PAYTOUR_PROXY_SECRET    ?? '';
const KV_URL       = process.env.KV_REST_API_URL         ?? '';
const KV_TOKEN     = process.env.KV_REST_API_TOKEN       ?? '';

const TOTAL_TTL    = 10 * 60 * 1000;  // 10 min
const PAGE_SIZE    = 50;
const PAGE_DELAY   = 150;              // ms entre páginas
const MAX_PAGES    = 12;               // 600 pedidos max — mais que suficiente para um mês

// Junho/2026: total exportado via XLS (163 pedidos aprovados em 29/06/2026)
const XLS_JUNE_TOTAL  = 46298.00;
const XLS_JUNE_MAX_ID = 4085703;

let ptToken = ''; let ptTokenExpiry = 0;
let memCache: { revenue: number; ts: number } | null = null;
let inflight: Promise<number> | null = null;

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

async function kvSet(key: string, value: unknown, ttlSec: number) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${ttlSec}`, {
      method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

function proxyHeaders(extra: Record<string, string> = {}) {
  return { 'x-proxy-secret': PROXY_SECRET, 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.paytour.com.br', ...extra };
}

async function getPtToken() {
  if (ptToken && Date.now() < ptTokenExpiry) return ptToken;
  const creds = Buffer.from(`${PT_KEY}:${PT_SECRET}`).toString('base64');
  const res = await fetch(`${PT_BASE}/v2/lojas/login?grant_type=application`, {
    method: 'POST',
    headers: proxyHeaders({ Authorization: `Basic ${creds}`, 'Content-Length': '0' }),
  });
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error(`Paytour auth retornou HTML (status ${res.status})`);
  const j = JSON.parse(text) as any;
  if (!j.access_token) throw new Error('Paytour auth failed');
  ptToken = j.access_token;
  ptTokenExpiry = Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000;
  return ptToken;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function paytourGet(path: string) {
  const tk = await getPtToken();
  const res = await fetch(`${PT_BASE}${path}`, {
    headers: proxyHeaders({ Authorization: `Bearer ${tk}`, Accept: 'application/json' }),
    signal: AbortSignal.timeout(8_000),
  });
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error(`Paytour retornou HTML (status ${res.status}) — rate limit`);
  return JSON.parse(text);
}

async function computeRevenue(since: string, until: string): Promise<number> {
  const month = since.slice(0, 7);

  // ── Junho 2026: base XLS + pedidos extras acima do max ID ──────────────────
  if (month === '2026-06') {
    let extraTotal = 0;
    let extraCount = 0;
    try {
      const page = await paytourGet(`/v2/pedidos?por_pagina=${PAGE_SIZE}&pagina=1`) as any;
      for (const o of page?.itens ?? []) {
        if (Number(o.id) <= XLS_JUNE_MAX_ID) continue;
        const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
        if (d >= since && d <= until && (o.status === 'aprovado' || o.status === 'confirmado')) {
          extraTotal += parseFloat(o.valor || '0') - parseFloat(o.desconto || '0');
          extraCount++;
        }
      }
    } catch (e: any) {
      console.warn(`[fat] junho/2026: falha extras — usando só XLS (${e.message})`);
    }
    const total = XLS_JUNE_TOTAL + extraTotal;
    console.log(`[fat] junho/2026: XLS R$${XLS_JUNE_TOTAL} + ${extraCount} novos = R$${total.toFixed(2)}`);
    return total;
  }

  // ── Demais meses: paginação completa por data de pedido ────────────────────
  // Mesma lógica do seletor de período — percorre em ordem cronológica reversa
  // e para quando encontra pedido anterior ao início do mês.
  let revenue = 0;
  let count   = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(PAGE_DELAY);
    const data  = await paytourGet(`/v2/pedidos?por_pagina=${PAGE_SIZE}&pagina=${page}`) as any;
    const items: any[] = data?.itens ?? [];
    if (!items.length) break;

    let done = false;
    for (const o of items) {
      const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
      if (d < since) { done = true; break; }
      if (d <= until && (o.status === 'confirmado' || o.status === 'aprovado')) {
        revenue += parseFloat(o.valor || '0') - parseFloat(o.desconto || '0');
        count++;
      }
    }
    if (done) break;
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }

  console.log(`[fat] ${month}: ${count} pedidos = R$${revenue.toFixed(2)}`);
  return revenue;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ revenue: 0 });

  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const since = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  const key   = `ptf-v16:${since}_${until}`;

  if (memCache && Date.now() - memCache.ts < TOTAL_TTL) return res.json({ revenue: memCache.revenue, since, until });
  const kv = await kvGet(key);
  if (kv && Date.now() - kv.ts < TOTAL_TTL) { memCache = kv; return res.json({ revenue: kv.revenue, since, until }); }

  if (inflight) {
    try { const revenue = await inflight; return res.json({ revenue, since, until }); }
    catch { if (memCache) return res.json({ revenue: memCache.revenue, since, until, stale: true }); }
  }

  inflight = computeRevenue(since, until).finally(() => { inflight = null; });

  try {
    const revenue = await inflight;
    const entry   = { revenue, ts: Date.now() };
    memCache = entry;
    kvSet(key, entry, Math.floor(TOTAL_TTL / 1000));
    return res.json({ revenue, since, until });
  } catch (err: any) {
    console.error('[fat]', err.message);
    if (memCache) return res.json({ revenue: memCache.revenue, since, until, stale: true });
    return res.status(500).json({ error: String(err) });
  }
}
