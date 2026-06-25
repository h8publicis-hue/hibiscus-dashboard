// Debug: descobre estrutura e filtros da API Paytour para faturamento.

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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  try {
    // 1) Amostra dos primeiros pedidos da lista (ver estrutura e datas)
    const list = await paytourGet('/v2/pedidos?por_pagina=5&pagina=1') as any;
    const sample = (list?.itens ?? []).map((o: any) => ({
      id: o.id,
      status: o.status,
      valor: o.valor,
      desconto: o.desconto,
      data_hora_pedido: o.data_hora_pedido,
      allKeys: Object.keys(o),
    }));

    // 2) Detalhe completo do primeiro pedido aprovado
    const firstApproved = (list?.itens ?? []).find((o: any) => o.status === 'aprovado');
    let detailFull: any = null;
    if (firstApproved) {
      detailFull = await paytourGet(`/v2/pedidos/${firstApproved.id}`);
    }

    // 3) Testa filtros nativos de data de pedido
    const dateFilters: Record<string, any> = {};
    const filterTests = [
      `data_de=2026-06-01&data_ate=2026-06-25&status=aprovado`,
      `data_pedido_de=2026-06-01&data_pedido_ate=2026-06-25`,
      `criado_em_de=2026-06-01&criado_em_ate=2026-06-25`,
      `data_inicio=2026-06-01&data_fim=2026-06-25&status=aprovado`,
      `por_pagina=5&status=aprovado`,
    ];
    for (const f of filterTests) {
      await sleep(200);
      try {
        const r = await paytourGet(`/v2/pedidos?por_pagina=5&pagina=1&${f}`) as any;
        dateFilters[f] = {
          total_paginas: r?.info?.total_paginas,
          total_itens: r?.info?.total,
          count: (r?.itens ?? []).length,
          firstDate: r?.itens?.[0]?.data_hora_pedido,
          firstStatus: r?.itens?.[0]?.status,
        };
      } catch (e: any) {
        dateFilters[f] = { error: e.message };
      }
    }

    // 4) Analisa estrutura completa do detalhe para entender itens
    const itensSample = (detailFull?.itens ?? detailFull?.pedido?.itens ?? []).slice(0, 3).map((item: any) => ({
      allKeys: Object.keys(item),
      produto_disponibilidade_data: item.produto_disponibilidade_data,
      data_utilizacao: item.data_utilizacao,
      nome_produto: item.nome_produto,
      valor: item.valor,
    }));

    return res.json({
      listTotal: list?.info,
      sampleOrders: sample,
      firstApprovedId: firstApproved?.id,
      detailTopKeys: Object.keys(detailFull ?? {}),
      detailWrapped: detailFull?.pedido ? 'sim (detail.pedido.itens)' : 'não (detail.itens)',
      itensSample,
      dateFilterTests: dateFilters,
    });
  } catch (err: any) {
    return res.status(500).json({ error: String(err) });
  }
}
