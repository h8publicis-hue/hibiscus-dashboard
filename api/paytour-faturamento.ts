// Faturamento do mês corrente — status=aprovado, filtrado por DATA DE VISITA.
// O Paytour "Resumo Financeiro" usa data de visita (disponibilidade do produto).
// Tentamos o endpoint de relatório e, se falhar, buscamos pedidos com filtro de visita.

const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'https://api-ha.paytour.com.br';
const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';
const TTL       = 60 * 60 * 1000; // 1 hora
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

// Testa diferentes nomes de parâmetro para filtro por data de visita.
// Retorna o count de pedidos que veio para cada tentativa.
async function probeVisitDateParam(since: string, until: string): Promise<{ param: string; count: number } | null> {
  const candidates = [
    `data_visita_de=${since}&data_visita_ate=${until}`,
    `data_de=${since}&data_ate=${until}`,
    `visita_de=${since}&visita_ate=${until}`,
    `disponibilidade_data_de=${since}&disponibilidade_data_ate=${until}`,
    `data_disponibilidade_de=${since}&data_disponibilidade_ate=${until}`,
  ];
  for (const param of candidates) {
    try {
      const data = await paytourGet(`/v2/pedidos?por_pagina=10&pagina=1&${param}`) as any;
      const count = (data?.itens ?? []).length;
      const total = data?.info?.total_paginas ?? 0;
      console.log(`[fat-probe] ${param} → itens=${count} total_pag=${total}`);
      if (count > 0 && total > 0) return { param, count };
    } catch (e: any) {
      console.log(`[fat-probe] ${param} → erro: ${e.message}`);
    }
    await sleep(300);
  }
  return null;
}

// Soma pedidos aprovados filtrando por data de visita via parâmetro nativo.
async function calcRevenueByVisitDate(since: string, until: string, dateParam: string): Promise<number> {
  let revenue = 0;
  for (let page = 1; page <= 10; page++) {
    if (page > 1) await sleep(200);
    const data = await paytourGet(`/v2/pedidos?por_pagina=${PAGE_SIZE}&pagina=${page}&${dateParam}`) as any;
    const items: any[] = data?.itens ?? [];
    if (!items.length) break;
    for (const o of items) {
      if (o.status === 'aprovado' || o.status === 'confirmado') {
        revenue += parseFloat(o.valor || '0');
      }
    }
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }
  console.log(`[faturamento] visita OK: R$ ${revenue.toFixed(2)} param=${dateParam}`);
  return revenue;
}

// Fallback por data de pedido (máx 10 páginas).
async function calcRevenueByOrderDate(since: string, until: string): Promise<number> {
  let revenue = 0;
  for (let page = 1; page <= 10; page++) {
    if (page > 1) await sleep(200);
    const data = await paytourGet(`/v2/pedidos?por_pagina=${PAGE_SIZE}&pagina=${page}`) as any;
    const items: any[] = data?.itens ?? [];
    if (!items.length) break;
    let pastRange = false;
    for (const o of items) {
      const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
      if (d < since) { pastRange = true; break; }
      if (d <= until && (o.status === 'aprovado' || o.status === 'confirmado')) {
        revenue += parseFloat(o.valor || '0');
      }
    }
    if (pastRange) break;
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }
  console.log(`[faturamento] pedido fallback: R$ ${revenue.toFixed(2)} (${since}→${until})`);
  return revenue;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ revenue: 0 });

  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const since = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  // bump cache key para forçar nova leitura após mudança de lógica
  const key   = `ptf3:${since}_${until}`;

  if (memCache && Date.now() - memCache.ts < TTL) return res.json({ revenue: memCache.revenue, since, until });
  const kv = await kvGet(key);
  if (kv && Date.now() - kv.ts < TTL) { memCache = kv; return res.json({ revenue: kv.revenue, since, until }); }

  try {
    let revenue = 0;

    // 1) Tenta endpoint de relatório (não existe — Resource not found confirmado)
    // Pulamos direto para o fallback de pedidos

    // 2) Tenta filtrar por data de visita com parâmetro nativo
    const probeResult = await probeVisitDateParam(since, until);
    if (probeResult) {
      revenue = await calcRevenueByVisitDate(since, until, probeResult.param);
    }

    // 3) Fallback por data de pedido se nenhum param de visita funcionou
    if (revenue === 0) {
      revenue = await calcRevenueByOrderDate(since, until);
    }

    const entry = { revenue, ts: Date.now() };
    memCache = entry;
    kvSet(key, entry);
    return res.json({ revenue, since, until });
  } catch (err: any) {
    console.error('[faturamento]', err.message);
    if (memCache) return res.json({ revenue: memCache.revenue, since, until, stale: true });
    return res.status(500).json({ error: String(err) });
  }
}
