// Debug: descobre ordenação real das páginas da API Paytour

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
    const pages: Record<string, any> = {};

    // Amostra das páginas 1, 5, 10, 20, 30 para ver distribuição de datas
    for (const pg of [1, 5, 10, 20, 30]) {
      await sleep(200);
      const data = await paytourGet(`/v2/pedidos?por_pagina=50&pagina=${pg}`) as any;
      const items: any[] = data?.itens ?? [];
      pages[`pg${pg}`] = {
        count: items.length,
        dates: items.map((o: any) => ({
          id: o.id,
          data_hora_pedido: o.data_hora_pedido,
          status: o.status,
          valor: o.valor,
        })).slice(0, 5), // primeiros 5 de cada página
      };
    }

    // Detalhe do primeiro pedido aprovado — todos os campos para descobrir campo de data de criação
    const pg1 = await paytourGet('/v2/pedidos?por_pagina=50&pagina=1') as any;
    const firstApproved = (pg1?.itens ?? []).find((o: any) => o.status === 'aprovado' || o.status === 'confirmado');
    let detailAllKeys: any = null;
    if (firstApproved) {
      await sleep(200);
      const detail = await paytourGet(`/v2/pedidos/${firstApproved.id}`) as any;
      detailAllKeys = {
        topKeys: Object.keys(detail ?? {}),
        topValues: Object.fromEntries(
          Object.entries(detail ?? {}).filter(([k]) => !['itens','cliente'].includes(k))
        ),
        itensKeys: Object.keys((detail?.itens ?? [])[0] ?? {}),
      };
    }

    return res.json({ pages, detailAllKeys });
  } catch (err: any) {
    return res.status(500).json({ error: String(err) });
  }
}
