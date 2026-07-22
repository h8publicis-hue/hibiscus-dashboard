// Faturamento do mês — pedidos aprovados do mês corrente.
//
// Junho/2026: total hardcoded do XLS exportado (163 pedidos aprovados).
// Só busca pedidos novos com ID > XLS_JUNE_MAX_ID para minimizar chamadas à API.
// Meses futuros: acumulador Redis cresce conforme pedidos aparecem na janela de 50 recentes.
//
// Máximo de chamadas por refresh: 2 (1 auth + 1 listagem). Sem burst de centenas de requests.

const PT_KEY      = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET   = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE     = 'https://paytour-proxy.hibiscusbeachclub.workers.dev';
const PROXY_SECRET = process.env.PAYTOUR_PROXY_SECRET ?? '';
const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';
const TOTAL_TTL = 10 * 60 * 1000;    // 10 min
const ACC_TTL   = 60 * 60 * 24 * 45; // 45 dias em segundos — TTL do acumulador Redis

const XLS_JUNE_TOTAL  = 46298.00;
const XLS_JUNE_MAX_ID = 4085703;

// Snapshot julho/2026 verificado no Resumo Financeiro Paytour em 22/07/2026.
// Representa pedidos de 01/07 até JULY_SEED_CUTOFF (inclusive).
// O acumulador v2 só captura pedidos a partir de JULY_SEED_CUTOFF+1 para evitar dupla contagem.
const JULY_2026_SEED        = 91474.00;
const JULY_2026_SEED_CUTOFF = '2026-07-22'; // seed cobre até esta data (inclusive)

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

async function paytourGet(path: string) {
  const tk = await getPtToken();
  const res = await fetch(`${PT_BASE}${path}`, {
    headers: proxyHeaders({ Authorization: `Bearer ${tk}`, Accept: 'application/json' }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error(`Paytour retornou HTML (status ${res.status}) — possível rate limit`);
  return JSON.parse(text);
}

async function computeRevenue(since: string, until: string): Promise<number> {
  const month = since.slice(0, 7);

  if (month === '2026-06') {
    let extraTotal = 0;
    let extraCount = 0;
    try {
      const page = await paytourGet('/v2/pedidos?por_pagina=50&pagina=1') as any;
      for (const o of page?.itens ?? []) {
        const id = Number(o.id);
        if (id <= XLS_JUNE_MAX_ID) continue;
        const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
        if (d >= since && d <= until && (o.status === 'aprovado' || o.status === 'confirmado')) {
          extraTotal += parseFloat(o.valor || '0') - parseFloat(o.desconto || '0');
          extraCount++;
        }
      }
    } catch (e: any) {
      console.warn(`[fat] junho/2026: falha extras (${e.message}) — usando só XLS`);
    }
    const total = XLS_JUNE_TOTAL + extraTotal;
    console.log(`[fat] junho/2026: XLS R$${XLS_JUNE_TOTAL} + ${extraCount} novos = R$${total.toFixed(2)}`);
    return total;
  }

  // Acumulador Redis v2 — captura pedidos após o cutoff do seed; remove cancelados/estornados.
  // Seed + acc = total do mês sem dupla contagem.
  const accKey = `ptf-acc-v3:${month}`;
  const acc = (await kvGet(accKey)) as Record<string, { valor: number; desconto: number }> | null ?? {};

  const seeds: Record<string, { amount: number; cutoff: string }> = {
    '2026-07': { amount: JULY_2026_SEED, cutoff: JULY_2026_SEED_CUTOFF },
  };
  const seedCfg  = seeds[month];
  const seedAmt  = seedCfg?.amount  ?? 0;
  const seedCut  = seedCfg?.cutoff  ?? since; // sem config: acumula todo o mês

  const CANCELLED = new Set(['cancelado', 'estornado', 'reembolsado', 'cancelado_pelo_cliente', 'cancelado_pelo_lojista']);

  try {
    const page = await paytourGet('/v2/pedidos?por_pagina=50&pagina=1') as any;
    let added = 0; let removed = 0; let updated = 0;
    for (const o of page?.itens ?? []) {
      const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
      // Só processa pedidos dentro do mês E após o cutoff do seed
      if (d < since || d > until || d <= seedCut) continue;
      const id = String(o.id);
      if (o.status === 'aprovado' || o.status === 'confirmado') {
        const newVal = parseFloat(o.valor || '0');
        const newDsc = parseFloat(o.desconto || '0');
        if (!acc[id]) {
          acc[id] = { valor: newVal, desconto: newDsc };
          added++;
        } else if (acc[id].valor !== newVal || acc[id].desconto !== newDsc) {
          acc[id] = { valor: newVal, desconto: newDsc };
          updated++;
        }
      } else if (CANCELLED.has(o.status) && acc[id]) {
        delete acc[id];
        removed++;
      }
    }
    if (added > 0 || removed > 0 || updated > 0) await kvSet(accKey, acc, ACC_TTL);
    const n = Object.keys(acc).length;
    const accRevenue = Object.values(acc).reduce((s: number, v: any) => s + v.valor - v.desconto, 0);
    const revenue = seedAmt + accRevenue;
    console.log(`[fat] ${month}: seed=R$${seedAmt} + acc(${n} pedidos, +${added} -${removed} ~${updated})=R$${accRevenue.toFixed(2)} → total=R$${revenue.toFixed(2)}`);
    return revenue;
  } catch (e: any) {
    const accRevenue = Object.values(acc).reduce((s: number, v: any) => s + v.valor - v.desconto, 0);
    const revenue = seedAmt + accRevenue;
    console.warn(`[fat] acumulador ${month}: API falhou (${e.message}), retornando R$${revenue.toFixed(2)}`);
    return revenue;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ revenue: 0 });

  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const since = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  const key   = `ptf-v20:${since}_${until}`;

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
