// Faturamento do mês por DATA DE VISITA — igual ao Paytour "Resumo Financeiro".
//
// Fluxo (apenas em cache miss, ~1x por hora):
//  1. Busca lista de pedidos dos últimos 60 dias (por data de pedido)
//  2. Para pedidos aprovados/confirmados, busca detalhe individual /v2/pedidos/{id}
//     em lotes paralelos de 10 — chamadas são Vercel→Paytour, não passam pelo WiFi local
//  3. Soma (valor - desconto) dos pedidos com algum item no mês corrente
//  4. Armazena no Redis por 1h
//
// Em cache HIT: resposta imediata, zero chamadas à Paytour.

const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'https://api-ha.paytour.com.br';
const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';
const TTL       = 60 * 60 * 1000; // 1 hora
const PAGE_SIZE = 50;
const BATCH     = 10; // detalhe: até 10 chamadas em paralelo

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

async function computeRevenue(visitSince: string, visitUntil: string): Promise<number> {
  const now    = new Date();
  const pad    = (n: number) => String(n).padStart(2, '0');
  // Busca pedidos dos últimos 60 dias (cobre pedidos feitos antes do mês com visita no mês)
  const listSince = new Date(now);
  listSince.setDate(listSince.getDate() - 60);
  const listSinceStr = `${listSince.getFullYear()}-${pad(listSince.getMonth() + 1)}-${pad(listSince.getDate())}`;

  // Passo 1: lista de pedidos aprovados nos últimos 60 dias
  const approvedIds: string[] = [];
  const orderValores: Record<string, { valor: number; desconto: number }> = {};

  for (let page = 1; page <= 15; page++) {
    const data  = await paytourGet(`/v2/pedidos?por_pagina=${PAGE_SIZE}&pagina=${page}`) as any;
    const items: any[] = data?.itens ?? [];
    if (!items.length) break;
    let pastRange = false;
    for (const o of items) {
      const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
      if (d < listSinceStr) { pastRange = true; break; }
      if (o.status === 'aprovado') {
        approvedIds.push(String(o.id));
        orderValores[o.id] = {
          valor:    parseFloat(o.valor    || '0'),
          desconto: parseFloat(o.desconto || '0'),
        };
      }
    }
    if (pastRange) break;
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }

  console.log(`[fat] ${approvedIds.length} pedidos aprovados nos últimos 60 dias`);

  // Passo 2: busca detalhe em lotes paralelos de BATCH
  let revenue = 0;
  let matched = 0;

  for (let i = 0; i < approvedIds.length; i += BATCH) {
    const batch = approvedIds.slice(i, i + BATCH);
    const details = await Promise.all(
      batch.map(id => paytourGet(`/v2/pedidos/${id}`).catch(() => null))
    );
    for (const detail of details) {
      if (!detail) continue;
      const itens: any[] = detail?.itens ?? detail?.pedido?.itens ?? [];
      const hasVisitInMonth = itens.some((item: any) => {
        const vd = (item.produto_disponibilidade_data as string)?.slice(0, 10) ?? '';
        return vd >= visitSince && vd <= visitUntil;
      });
      if (hasVisitInMonth) {
        const id  = String(detail?.id ?? detail?.pedido?.id ?? '');
        const ov  = orderValores[id] ?? orderValores[Number(id)];
        if (ov) { revenue += ov.valor - ov.desconto; matched++; }
      }
    }
    if (i + BATCH < approvedIds.length) await sleep(50); // pequena pausa entre lotes
  }

  console.log(`[fat] ${matched} pedidos com visita em ${visitSince}→${visitUntil} = R$ ${revenue.toFixed(2)}`);
  return revenue;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.json({ revenue: 0 });

  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const since = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  const key   = `ptf-v2:${since}_${until}`;

  // Cache L1 (memória)
  if (memCache && Date.now() - memCache.ts < TTL) return res.json({ revenue: memCache.revenue, since, until });

  // Cache L2 (Redis)
  const kv = await kvGet(key);
  if (kv && Date.now() - kv.ts < TTL) { memCache = kv; return res.json({ revenue: kv.revenue, since, until }); }

  // Deduplicação: se já existe cálculo em andamento, aguarda o mesmo resultado
  if (inflight) {
    try {
      const revenue = await inflight;
      return res.json({ revenue, since, until });
    } catch {
      if (memCache) return res.json({ revenue: memCache.revenue, since, until, stale: true });
    }
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
