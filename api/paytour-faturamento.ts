// Faturamento do mês — pedidos aprovados com VISITA no mês corrente.
// Fluxo:
//  1. Busca 8 páginas de pedidos recentes (aprovado, data_hora_pedido no mês)
//  2. Busca detalhe de cada pedido em lotes paralelos de 10
//  3. Conta apenas pedidos onde algum item tem produto_disponibilidade_data no mês
// Cache Redis 1h. Chamadas são Vercel→Paytour (não passam pelo WiFi local).

const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'https://api-ha.paytour.com.br';
const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';
const TTL       = 60 * 60 * 1000;
const BATCH     = 10;

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
async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${Math.floor(TTL / 1000)}`, {
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

async function computeRevenue(since: string, until: string): Promise<number> {
  // Passo 1: coleta pedidos aprovados das 8 páginas mais recentes com data no mês
  const candidates: { id: string; valor: number; desconto: number }[] = [];

  for (let page = 1; page <= 8; page++) {
    if (page > 1) await sleep(150);
    const data  = await paytourGet(`/v2/pedidos?por_pagina=50&pagina=${page}`) as any;
    const items: any[] = data?.itens ?? [];
    if (page === 1) console.log(`[fat] pg1 total_pag=${data?.info?.total_paginas} count=${items.length}`);
    if (!items.length) break;
    let pastRange = false;
    for (const o of items) {
      const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
      if (d < since) { pastRange = true; break; }
      if (d <= until && o.status === 'aprovado') {
        candidates.push({
          id:       String(o.id),
          valor:    parseFloat(o.valor    || '0'),
          desconto: parseFloat(o.desconto || '0'),
        });
      }
    }
    if (pastRange) break;
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }

  console.log(`[fat] ${candidates.length} candidatos aprovados — buscando detalhes para filtrar por visita`);

  // Passo 2: busca detalhe em lotes paralelos de BATCH e filtra por data de visita
  let revenue = 0;
  let matched = 0;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const details = await Promise.all(
      batch.map(c => paytourGet(`/v2/pedidos/${c.id}`).catch(() => null))
    );
    for (let j = 0; j < batch.length; j++) {
      const detail = details[j] as any;
      if (!detail) continue;
      const itens: any[] = detail?.itens ?? detail?.pedido?.itens ?? [];
      const hasVisit = itens.some((item: any) => {
        const vd = (item.produto_disponibilidade_data as string)?.slice(0, 10) ?? '';
        return vd >= since && vd <= until;
      });
      if (hasVisit) {
        revenue += batch[j].valor - batch[j].desconto;
        matched++;
      }
    }
    if (i + BATCH < candidates.length) await sleep(50);
  }

  console.log(`[fat] ${matched}/${candidates.length} pedidos com visita em ${since}→${until} = R$ ${revenue.toFixed(2)}`);
  return revenue;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ revenue: 0 });

  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const since = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  const key   = `ptf-v3:${since}_${until}`;

  if (memCache && Date.now() - memCache.ts < TTL) return res.json({ revenue: memCache.revenue, since, until });
  const kv = await kvGet(key);
  if (kv && Date.now() - kv.ts < TTL) { memCache = kv; return res.json({ revenue: kv.revenue, since, until }); }

  if (inflight) {
    try { const revenue = await inflight; return res.json({ revenue, since, until }); }
    catch { if (memCache) return res.json({ revenue: memCache.revenue, since, until, stale: true }); }
  }

  inflight = computeRevenue(since, until).finally(() => { inflight = null; });

  try {
    const revenue = await inflight;
    const entry   = { revenue, ts: Date.now() };
    memCache = entry;
    kvSet(key, entry);
    return res.json({ revenue, since, until });
  } catch (err: any) {
    console.error('[fat]', err.message);
    if (memCache) return res.json({ revenue: memCache.revenue, since, until, stale: true });
    return res.status(500).json({ error: String(err) });
  }
}
