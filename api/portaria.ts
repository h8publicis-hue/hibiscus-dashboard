// Contador de portaria — armazena por dia no KV.

const KV_URL   = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? '';

function todayBRT(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function kvKey(date: string) { return `portaria:${date}`; }

async function kvGet(key: string): Promise<number> {
  if (!KV_URL || !KV_TOKEN) return 0;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const j = await r.json() as any;
    return Number(j?.result ?? 0) || 0;
  } catch { return 0; }
}

async function kvSet(key: string, value: number) {
  if (!KV_URL || !KV_TOKEN) return;
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${25 * 60 * 60}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: String(value),
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const today = todayBRT();
  const key   = kvKey(today);

  if (req.method === 'GET') {
    const count = await kvGet(key);
    return res.json({ date: today, count });
  }

  if (req.method === 'POST') {
    const body  = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    // delta: +N para entrada, pode ser negativo para correção
    const delta = Number(body.delta ?? 1);
    // set: substitui o valor inteiro (para zerar com senha)
    const set   = body.set !== undefined ? Number(body.set) : null;

    const current = await kvGet(key);
    const next    = set !== null ? Math.max(0, set) : Math.max(0, current + delta);
    await kvSet(key, next);
    return res.json({ date: today, count: next });
  }

  return res.status(405).end();
}
