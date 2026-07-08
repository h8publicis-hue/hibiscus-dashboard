// Faturamento do mês — pedidos aprovados do mês corrente.
//
// Junho/2026: total hardcoded do XLS exportado (163 pedidos aprovados).
// Só busca pedidos novos com ID > XLS_JUNE_MAX_ID para minimizar chamadas à API.
// Meses futuros: acumulador Redis cresce conforme pedidos aparecem na janela de 50 recentes.
//
// Máximo de chamadas por refresh: 2 (1 auth + 1 listagem). Sem burst de centenas de requests.

const PT_KEY      = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET   = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
// Cloudflare Worker proxy — evita bloqueio do Bot Fight Mode da Cloudflare em IPs AWS
const PT_BASE     = 'https://paytour-proxy.hibiscusbeachclub.workers.dev';
const PROXY_SECRET = process.env.PAYTOUR_PROXY_SECRET ?? '';
const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';
const TOTAL_TTL = 10 * 60 * 1000;    // 10 min — atualiza mais frequente (acumulador busca só 1 pág)
const ACC_TTL   = 60 * 60 * 24 * 45; // 45 dias em segundos — TTL do acumulador Redis

// Total dos 163 pedidos aprovados exportados via XLS em 29/06/2026.
// Fonte: Paytour → Minhas Reservas → junho/2026 → Aprovada → exportar XLS.
const XLS_JUNE_TOTAL  = 46298.00;
const XLS_JUNE_MAX_ID = 4085703; // maior ID no XLS — só busca extras acima desse

// Base de julho/2026 — Resumo Financeiro em 01/07/2026 às ~22:40 BRT (8 reservas).
// Quando o acumulador Redis estiver vazio, usa esse valor como piso.
// Quando a API voltar, o acumulador assume e soma novos pedidos sem duplicar.
const JULY_2026_SEED = 2110.00;

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

  // ── Junho 2026: base XLS + apenas pedidos novos acima do max ID ──────────────
  if (month === '2026-06') {
    let extraTotal = 0;
    let extraCount = 0;
    try {
      const page = await paytourGet('/v2/pedidos?por_pagina=50&pagina=1') as any;
      for (const o of page?.itens ?? []) {
        const id = Number(o.id);
        if (id <= XLS_JUNE_MAX_ID) continue; // já está no XLS
        const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
        if (d >= since && d <= until && o.status === 'aprovado') {
          extraTotal += parseFloat(o.valor || '0') - parseFloat(o.desconto || '0');
          extraCount++;
        }
      }
    } catch (e: any) {
      console.warn(`[fat] junho/2026: falha ao buscar extras (${e.message}) — usando só base XLS`);
    }
    const total = XLS_JUNE_TOTAL + extraTotal;
    console.log(`[fat] junho/2026: XLS R$${XLS_JUNE_TOTAL} + ${extraCount} novos R$${extraTotal.toFixed(2)} = R$${total.toFixed(2)}`);
    return total;
  }

  // ── Meses futuros: acumulador Redis ──────────────────────────────────────────
  // Cada chamada busca os 50 pedidos mais recentes e acumula os do mês por ID.
  // Sem risco de duplicar: IDs são chave do objeto.
  // Se a API falhar, retorna o total acumulado até agora (nunca zera).
  const accKey = `ptf-acc:${month}`;
  const acc = (await kvGet(accKey)) as Record<string, { valor: number; desconto: number }> | null ?? {};

  // Seed manual: se acumulador vazio e mês tem base conhecida, usa como piso
  const seeds: Record<string, number> = { '2026-07': JULY_2026_SEED };
  const seed = seeds[month] ?? 0;

  try {
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
    const apiRevenue = Object.values(acc).reduce((s: number, v: any) => s + v.valor - v.desconto, 0);
    // Usa o maior entre o acumulado da API e o seed manual (evita zerar enquanto API estiver bloqueada)
    const revenue = Math.max(apiRevenue, seed);
    console.log(`[fat] acumulador ${month}: ${n} pedidos (+${added} novos), api=R$${apiRevenue.toFixed(2)}, seed=R$${seed}, total=R$${revenue.toFixed(2)}`);
    return revenue;
  } catch (e: any) {
    // API indisponível — retorna seed ou acumulado, o que for maior
    const apiRevenue = Object.values(acc).reduce((s: number, v: any) => s + v.valor - v.desconto, 0);
    const revenue = Math.max(apiRevenue, seed);
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
  const key   = `ptf-v14:${since}_${until}`;

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
