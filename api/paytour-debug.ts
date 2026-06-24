// Endpoint temporário de diagnóstico — descobre estrutura da API Paytour.
// Acesse /api/paytour-debug para ver os dados.

const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'https://api-ha.paytour.com.br';

let ptToken = ''; let ptTokenExpiry = 0;

async function getPtToken() {
  if (ptToken && Date.now() < ptTokenExpiry) return ptToken;
  const creds = Buffer.from(`${PT_KEY}:${PT_SECRET}`).toString('base64');
  const res = await fetch(`${PT_BASE}/v2/lojas/login?grant_type=application`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.paytour.com.br', 'Content-Length': '0' },
  });
  const j = await res.json() as any;
  if (!j.access_token) throw new Error('auth failed');
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

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  try {
    // 1) Busca primeira página de pedidos
    const list = await paytourGet('/v2/pedidos?por_pagina=5&pagina=1') as any;
    const firstOrder = list?.itens?.[0];
    if (!firstOrder) return res.json({ error: 'nenhum pedido encontrado', list });

    const orderId = firstOrder.id;

    // 2) Busca detalhe do pedido individual
    const detail = await paytourGet(`/v2/pedidos/${orderId}`) as any;

    // 3) Tenta outros endpoints de relatório
    const endpointsToTry = [
      `/v2/relatorios/vendas?data_inicio=2026-06-01&data_fim=2026-06-30`,
      `/v2/relatorios/resumo?data_inicio=2026-06-01&data_fim=2026-06-30`,
      `/v2/dashboard`,
      `/v2/vendas?data_inicio=2026-06-01&data_fim=2026-06-30`,
      `/v2/lojas/resumo`,
    ];

    const probes: Record<string, any> = {};
    for (const ep of endpointsToTry) {
      try {
        const r = await paytourGet(ep) as any;
        probes[ep] = { keys: Object.keys(r ?? {}), snippet: JSON.stringify(r)?.slice(0, 200) };
      } catch (e: any) {
        probes[ep] = { error: e.message };
      }
    }

    return res.json({
      firstOrderKeys: Object.keys(firstOrder),
      firstOrderSample: firstOrder,
      detailKeys: Object.keys(detail ?? {}),
      detailItens: detail?.itens?.slice(0, 2),
      detailSample: JSON.stringify(detail)?.slice(0, 1000),
      endpointProbes: probes,
    });
  } catch (err: any) {
    return res.status(500).json({ error: String(err) });
  }
}
