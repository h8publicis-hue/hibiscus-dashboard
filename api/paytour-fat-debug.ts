// Diagnóstico: retorna IDs e detalhes dos candidatos aprovados em junho
// para comparar com o XLS e identificar o filtro correto

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
  if (!PT_KEY || !PT_SECRET) return res.status(500).json({ error: 'no creds' });

  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const since = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  const month = since.slice(0, 7);

  // IDs do XLS (130 aprovados conhecidos — exportados da Paytour)
  const xlsIds = new Set([4063190,4063248,4063355,4063485,4063645,4064027,4064032,4065012,4065185,4065192,4065233,4065269,4065430,4065967,4066143,4066149,4066430,4066470,4066599,4066654,4067354,4067620,4067678,4067697,4067699,4067705,4067723,4067989,4069267,4069302,4069684,4069688,4069838,4069926,4069981,4070127,4070432,4070638,4070646,4070667,4070671,4070681,4070756,4071006,4071162,4071279,4071332,4071769,4071852,4072088,4072234,4072271,4072294,4072389,4072903,4072938,4072946,4072949,4073070,4073225,4073235,4073236,4073248,4073778,4073845,4073851,4074048,4074172,4074943,4074996,4075013,4075275,4075309,4075412,4075435,4075475,4075513,4075793,4075995,4076004,4076786,4076795,4076834,4076993,4077358,4077430,4077512,4077514,4077515,4077564,4077573,4077585,4077589,4078013,4078205,4078239,4078246,4078291,4078392,4078405,4078734,4078833,4079554,4079579,4079642,4079644,4079727,4079898,4080147,4080172,4080198,4080214,4080233,4080261,4080364,4080366,4080413,4080457,4080473,4080480,4080491,4080525,4080932,4080984,4081115,4081225,4081343,4081434,4082721,4082755]);

  // Passo 1: coleta candidatos
  const candidates: { id: number; valor: number; desconto: number; data: string }[] = [];
  for (let page = 1; page <= 8; page++) {
    if (page > 1) await sleep(150);
    const data = await paytourGet(`/v2/pedidos?por_pagina=50&pagina=${page}`) as any;
    const items: any[] = data?.itens ?? [];
    if (!items.length) break;
    let pastRange = false;
    for (const o of items) {
      const d = (o.data_hora_pedido as string)?.slice(0, 10) ?? '';
      if (d < since) { pastRange = true; break; }
      if (d <= until && o.status === 'aprovado') {
        candidates.push({ id: Number(o.id), valor: parseFloat(o.valor || '0'), desconto: parseFloat(o.desconto || '0'), data: d });
      }
    }
    if (pastRange) break;
    if (page >= (data?.info?.total_paginas ?? page)) break;
  }

  const allIds = candidates.map(c => c.id);
  const inXls = allIds.filter(id => xlsIds.has(id));
  const notInXls = allIds.filter(id => !xlsIds.has(id));

  // Passo 2: busca detalhe dos primeiros 5 que NÃO estão no XLS
  const sampleExtra: any[] = [];
  for (const id of notInXls.slice(0, 5)) {
    await sleep(150);
    const detail = await paytourGet(`/v2/pedidos/${id}`) as any;
    const itens = (detail?.itens ?? []).map((i: any) => ({
      produto_tipo: i.produto_tipo,
      nome_produto: i.nome_produto,
      produto_disponibilidade_data: i.produto_disponibilidade_data,
    }));
    const logs = (detail?.logsStatus ?? []);
    sampleExtra.push({
      id,
      valor: candidates.find(c => c.id === id)?.valor,
      data_pedido: candidates.find(c => c.id === id)?.data,
      loja_afiliado_id: detail?.loja_afiliado_id,
      criado_em: logs[logs.length - 1]?.data_hora,
      itens,
    });
  }

  return res.json({
    total_candidatos: candidates.length,
    in_xls: inXls.length,
    not_in_xls: notInXls.length,
    not_in_xls_ids: notInXls,
    sample_extra_details: sampleExtra,
  });
}
