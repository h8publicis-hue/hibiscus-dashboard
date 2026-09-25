// Mapa de mesas do Beach
// GET  → { tables, estado } — inicializa 110 mesas se não existir
// POST ?action=update + { numero, update } → atualiza estado de uma mesa
// POST ?action=config + { tables } → salva posições

const KV_URL   = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? '';

async function kvGet(key: string) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const j = await r.json() as any;
    const result = j?.result;
    if (!result) return null;
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch { return null; }
}

async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
}

// Coordenadas iniciais (x%, y%) por número de mesa
const INITIAL_COORDS: Record<string, [number, number]> = {
  '001':[13,79],'002':[17,83],'003':[22,83],'004':[26,83],'005':[30,84],
  '006':[34,84],'007':[38,84],'008':[42,84],'009':[10,74],'010':[14,73],
  '011':[18,72],'012':[27,72],'013':[31,72],'014':[36,71],'016':[44,70],
  '017':[44,77],'018':[44,74],'019':[44,71],'020':[48,69],'021':[48,76],
  '022':[48,73],'023':[48,71],'024':[52,69],'025':[52,73],'026':[52,71],
  '027':[55,68],
  '028':[61,88],'029':[61,84],'030':[61,80],'031':[61,76],'032':[61,72],
  '033':[61,68],'034':[61,64],'035':[61,60],'036':[61,56],'037':[61,52],
  '038':[65,88],'039':[65,84],'040':[65,80],'041':[65,76],'042':[65,72],
  '043':[65,68],'044':[65,64],'045':[65,60],'046':[65,56],'047':[65,52],
  '048':[65,48],'049':[65,44],
  '050':[69,88],'051':[69,84],'052':[69,80],'053':[69,76],'054':[69,72],
  '055':[69,68],'056':[69,64],'057':[69,60],'058':[69,56],'059':[69,52],
  '060':[69,48],'061':[69,44],
  '062':[73,88],'063':[73,84],'064':[73,80],'065':[73,76],'066':[73,72],
  '067':[73,68],'068':[73,64],'069':[73,60],'070':[73,56],'071':[73,52],
  '072':[73,48],'073':[73,44],
  '074':[77,88],'075':[77,84],'076':[77,80],'077':[77,76],'078':[77,72],
  '079':[77,68],'080':[77,64],'081':[77,60],'082':[77,56],'083':[77,52],
  '084':[77,48],'085':[77,44],
  '086':[82,72],'087':[82,68],'088':[82,64],'089':[82,60],'090':[82,56],
  '091':[85,72],'092':[85,68],'093':[85,64],'094':[85,60],'095':[85,56],
  '096':[88,72],'097':[88,68],'098':[88,64],'099':[88,60],'100':[88,56],
  '101':[91,72],'102':[91,68],'103':[91,64],'104':[91,60],'105':[91,56],
  '106':[94,72],'107':[94,68],'108':[94,64],'109':[94,60],'110':[94,56],
};

function buildInitialConfig() {
  const tables = Array.from({ length: 110 }, (_, i) => {
    const num = String(i + 1).padStart(3, '0');
    // Mesa 015 não existe no layout — pula
    const coords = INITIAL_COORDS[num] ?? [((i % 11) * 8.5 + 5), (Math.floor(i / 11) * 9 + 5)];
    return { numero: num, x: coords[0], y: coords[1] };
  });
  return { tables };
}

function buildInitialEstado() {
  const estado: Record<string, unknown> = {};
  for (let i = 1; i <= 110; i++) {
    const num = String(i).padStart(3, '0');
    estado[num] = { status: 'livre', quantidadeClientes: 0, horaOcupacao: null, garcomId: null };
  }
  return estado;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    let [config, estado] = await Promise.all([kvGet('mesas:config'), kvGet('mesas:estado')]);

    if (!config) {
      config = buildInitialConfig();
      await kvSet('mesas:config', config);
    }
    if (!estado) {
      estado = buildInitialEstado();
      await kvSet('mesas:estado', estado);
    }

    return res.json({ tables: config.tables, estado });
  }

  if (req.method === 'POST') {
    const action = req.query?.action;

    if (action === 'update') {
      const { numero, update } = req.body ?? {};
      if (!numero) return res.status(400).json({ error: 'numero required' });

      const estado = (await kvGet('mesas:estado')) ?? buildInitialEstado();
      const current = estado[numero] ?? { status: 'livre', quantidadeClientes: 0, horaOcupacao: null, garcomId: null };
      estado[numero] = { ...current, ...update };
      await kvSet('mesas:estado', estado);
      return res.json({ ok: true, mesa: estado[numero] });
    }

    if (action === 'config') {
      const { tables } = req.body ?? {};
      if (!tables) return res.status(400).json({ error: 'tables required' });
      await kvSet('mesas:config', { tables });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'invalid action' });
  }

  return res.status(405).end();
}
