// Faturamento do mês — pedidos aprovados do mês corrente.
//
// Limitação da API Paytour: /v2/pedidos ignora TODOS os parâmetros de filtro/paginação
// e sempre devolve os mesmos 30 pedidos mais recentes. Para cobrir o mês inteiro usamos
// duas estratégias complementares:
//
//  A) IDs conhecidos (junho 2026): busca direta nos 130 IDs exportados via XLS.
//  B) Acumulador Redis (meses futuros): armazena IDs aprovados conforme aparecem
//     na janela de 30 mais recentes; vai crescendo ao longo do mês.
//
// Cache Redis 1h para o total final. Chamadas são Vercel→Paytour (não passam pelo WiFi).

const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'https://api-ha.paytour.com.br';
const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';
const TOTAL_TTL = 60 * 60 * 1000;   // 1h — TTL do cache de total
const ACC_TTL   = 60 * 60 * 24 * 45; // 45 dias em segundos — TTL do acumulador Redis
const BATCH     = 10;

// IDs aprovados de junho/2026 — exportados da tela "Minhas Reservas" da Paytour.
// A API /v2/pedidos ignora paginação, tornando impraticável a descoberta retrospectiva.
const JUNE_2026_IDS = [
  4063190,4063248,4063355,4063485,4063645,4064027,4064032,4065012,4065185,4065192,
  4065233,4065269,4065430,4065967,4066143,4066149,4066430,4066470,4066599,4066654,
  4067354,4067620,4067678,4067697,4067699,4067705,4067723,4067989,4069267,4069302,
  4069684,4069688,4069838,4069926,4069981,4070127,4070432,4070638,4070646,4070667,
  4070671,4070681,4070756,4071006,4071162,4071279,4071332,4071769,4071852,4072088,
  4072234,4072271,4072294,4072389,4072903,4072938,4072946,4072949,4073070,4073225,
  4073235,4073236,4073248,4073778,4073845,4073851,4074048,4074172,4074943,4074996,
  4075013,4075275,4075309,4075412,4075435,4075475,4075513,4075793,4075995,4076004,
  4076786,4076795,4076834,4076993,4077358,4077430,4077512,4077514,4077515,4077564,
  4077573,4077585,4077589,4078013,4078205,4078239,4078246,4078291,4078392,4078405,
  4078734,4078833,4079554,4079579,4079642,4079644,4079727,4079898,4080147,4080172,
  4080198,4080214,4080233,4080261,4080364,4080366,4080413,4080457,4080473,4080480,
  4080491,4080525,4080932,4080984,4081115,4081225,4081343,4081434,4082721,4082755,
];

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

// Busca detalhes de uma lista de IDs em lotes e soma valor-desconto dos aprovados
async function sumOrderIds(ids: number[]): Promise<number> {
  let total = 0;
  let fetched = 0; let approved = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(id => paytourGet(`/v2/pedidos/${id}`)));
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const d = r.value as any;
      fetched++;
      if (d?.status === 'aprovado') {
        total += parseFloat(d.valor || '0') - parseFloat(d.desconto || '0');
        approved++;
      }
    }
    if (i + BATCH < ids.length) await sleep(100);
  }
  console.log(`[fat] sumOrderIds: ${fetched} buscados, ${approved} aprovados, total=R$${total.toFixed(2)}`);
  return total;
}

async function computeRevenue(since: string, until: string): Promise<number> {
  const month = since.slice(0, 7);

  // ── Estratégia A: IDs conhecidos para junho 2026 ─────────────────────────────
  if (month === '2026-06') {
    console.log(`[fat] junho/2026: buscando ${JUNE_2026_IDS.length} IDs conhecidos do XLS`);

    // Inclui também novos pedidos aprovados no mês que apareceram DEPOIS da exportação do XLS
    const page = await paytourGet('/v2/pedidos?por_pagina=50&pagina=1') as any;
    const recentIds = new Set(JUNE_2026_IDS);
    for (const o of page?.itens ?? []) {
      const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
      if (d >= since && d <= until && o.status === 'aprovado') {
        recentIds.add(Number(o.id));
      }
    }
    const allIds = Array.from(recentIds);
    console.log(`[fat] junho/2026: ${allIds.length} IDs total (${allIds.length - JUNE_2026_IDS.length} novos pós-XLS)`);
    return sumOrderIds(allIds);
  }

  // ── Estratégia B: Acumulador Redis para meses futuros ────────────────────────
  // Cada chamada descobre os pedidos visíveis agora e adiciona ao acumulador.
  // Ao longo do mês, o acumulador cresce e cobre a maioria dos pedidos.
  const accKey = `ptf-acc:${month}`;
  const acc = (await kvGet(accKey)) as Record<string, { valor: number; desconto: number }> | null ?? {};

  // Descobre novos pedidos do mês na janela de 30 mais recentes
  const page = await paytourGet('/v2/pedidos?por_pagina=50&pagina=1') as any;
  let added = 0;
  for (const o of page?.itens ?? []) {
    const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
    if (d >= since && d <= until && o.status === 'aprovado') {
      const id = String(o.id);
      if (!acc[id]) {
        acc[id] = { valor: parseFloat(o.valor || '0'), desconto: parseFloat(o.desconto || '0') };
        added++;
      }
    }
  }
  if (added > 0) await kvSet(accKey, acc, ACC_TTL);

  const n = Object.keys(acc).length;
  const revenue = Object.values(acc).reduce((s: number, v: any) => s + v.valor - v.desconto, 0);
  console.log(`[fat] acumulador ${month}: ${n} pedidos (+${added} novos), total=R$${revenue.toFixed(2)}`);
  return revenue;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ revenue: 0 });

  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const since = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  const key   = `ptf-v10:${since}_${until}`;

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
