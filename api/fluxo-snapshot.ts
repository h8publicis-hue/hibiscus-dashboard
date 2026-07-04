// Snapshot diário do fluxo — grava portaria + ocupação no KV como histórico.
// GET ?action=save  → tira snapshot (usado pelo cron às 18h BRT)
// POST              → tira snapshot (chamado pelo frontend antes de zerar)
// GET               → retorna snapshot do dia (leitura)

const KV_URL   = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? '';

function todayBRT(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

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

async function kvSet(key: string, value: unknown, ttlSeconds?: number) {
  if (!KV_URL || !KV_TOKEN) return;
  const suffix = ttlSeconds ? `?ex=${ttlSeconds}` : '';
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}${suffix}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
}

async function takeSnapshot(date: string) {
  const [portariaRaw, ocupacaoRaw] = await Promise.all([
    kvGet(`portaria:${date}`),
    kvGet('ocupacao'),
  ]);

  const portaria   = Number(portariaRaw ?? 0) || 0;
  const beach      = Number(ocupacaoRaw?.beach ?? 0);
  const loungeTotal = (ocupacaoRaw?.lounges as number[] | undefined)?.reduce((a: number, b: number) => a + b, 0) ?? 0;
  const lounge     = loungeTotal;
  const condominio = 0;
  const total      = portaria;
  const gap        = portaria - (beach + lounge);

  const snapshot = { date, portaria, beach, lounge, condominio, total, gap };

  // TTL de 2 anos
  await kvSet(`fluxo:${date}`, snapshot, 2 * 365 * 24 * 3600);

  return snapshot;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const today = todayBRT();

  // Cron (GET ?action=save) ou POST do frontend → tira snapshot
  if (req.method === 'POST' || req.query?.action === 'save') {
    try {
      const snapshot = await takeSnapshot(today);
      return res.json({ ok: true, snapshot });
    } catch (err: any) {
      console.error('[fluxo-snapshot]', err.message);
      return res.status(500).json({ error: String(err) });
    }
  }

  // GET simples → retorna snapshot do dia (sem gravar)
  if (req.method === 'GET') {
    const existing = await kvGet(`fluxo:${today}`);
    return res.json({ date: today, snapshot: existing ?? null });
  }

  return res.status(405).end();
}
