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
    // Testa diferentes parâmetros de filtro de data para ver quais a API respeita
    const since = '2026-06-01';
    const until = '2026-06-25';
    const paramSets: Record<string, string> = {
      pg1:               `/v2/pedidos?por_pagina=30&pagina=1`,
      pg50:              `/v2/pedidos?por_pagina=30&pagina=50`,
      pg100:             `/v2/pedidos?por_pagina=30&pagina=100`,
      pg200:             `/v2/pedidos?por_pagina=30&pagina=200`,
      pp200:             `/v2/pedidos?por_pagina=200&pagina=1`,
      pp500:             `/v2/pedidos?por_pagina=500&pagina=1`,
    };

    const results: Record<string, any> = {};
    for (const [name, path] of Object.entries(paramSets)) {
      await sleep(300);
      const data = await paytourGet(path) as any;
      const items: any[] = data?.itens ?? [];
      results[name] = {
        total_paginas: data?.info?.total_paginas,
        count: items.length,
        first_id: items[0]?.id,
        first_date: items[0]?.data_hora_pedido?.slice(0, 10),
        last_date: items[items.length - 1]?.data_hora_pedido?.slice(0, 10),
        status_sample: items.slice(0, 3).map((o: any) => o.status),
      };
    }

    return res.json({ results });
  } catch (err: any) {
    return res.status(500).json({ error: String(err) });
  }
}
