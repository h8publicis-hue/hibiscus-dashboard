// Diagnóstico: descobre estrutura dos pedidos de hoje para reescrever checkin
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
  if (!j.access_token) throw new Error('auth failed: ' + JSON.stringify(j));
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

function todayBRT() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) return res.status(503).json({ error: 'credenciais não configuradas' });

  try {
    const today = todayBRT();

    // 1. Pedidos de hoje (por data de pedido)
    const ordersToday = await paytourGet(`/v2/pedidos?por_pagina=10&pagina=1`) as any;
    const sampleOrder = ordersToday?.itens?.[0] ?? null;

    // 2. Pedidos por data de visita = hoje
    const ordersByVisit = await paytourGet(
      `/v2/pedidos?por_pagina=20&pagina=1&disponibilidade_data_de=${today}&disponibilidade_data_ate=${today}`
    ) as any;
    const sampleVisitOrder = ordersByVisit?.itens?.[0] ?? null;

    // 3. Tenta endpoint de disponibilidades
    const disps = await paytourGet(`/v2/disponibilidades?data_de=${today}&data_ate=${today}&por_pagina=5`) as any;

    // 4. Tenta endpoint de produtos
    const produtos = await paytourGet(`/v2/produtos?por_pagina=5`) as any;

    // 5. Status únicos encontrados nos pedidos de visita
    const allStatuses = (ordersByVisit?.itens ?? []).map((o: any) => o.status).filter(Boolean);
    const uniqueStatuses = [...new Set(allStatuses)];

    // 6. Campos do pedido de visita (chaves)
    const visitOrderKeys = sampleVisitOrder ? Object.keys(sampleVisitOrder) : [];

    // 7. Campos do item dentro do pedido (se existir)
    const itemKeys = sampleVisitOrder?.itens?.[0]
      ? Object.keys(sampleVisitOrder.itens[0])
      : sampleVisitOrder?.item
        ? Object.keys(sampleVisitOrder.item)
        : [];

    return res.json({
      today,
      // Estrutura de um pedido genérico
      sampleOrder_keys: sampleOrder ? Object.keys(sampleOrder) : [],
      sampleOrder_status: sampleOrder?.status,
      sampleOrder_situacao: sampleOrder?.situacao,

      // Pedidos filtrados por data de visita
      ordersByVisit_total: ordersByVisit?.info?.total_registros,
      ordersByVisit_pages: ordersByVisit?.info?.total_paginas,
      ordersByVisit_count: ordersByVisit?.itens?.length,
      ordersByVisit_statuses: uniqueStatuses,
      ordersByVisit_keys: visitOrderKeys,
      ordersByVisit_item_keys: itemKeys,
      sampleVisitOrder,

      // Disponibilidades
      disps_raw: disps,

      // Produtos
      produtos_count: produtos?.info?.total_registros,
      produtos_sample: produtos?.itens?.slice(0, 2),
    });
  } catch (err: any) {
    return res.status(500).json({ error: String(err), stack: err.stack });
  }
}
