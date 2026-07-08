// Receita A&BS — GET retorna valor do mês, POST recebe do Power BI.

const KV_URL   = process.env.KV_REST_API_URL      ?? '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN    ?? '';
const API_KEY  = process.env.RECEITA_ABS_API_KEY  ?? '';

async function kvGet(key: string) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const j = await r.json() as any;
    const raw = j?.result;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}

async function kvSet(key: string, value: unknown, ttlSec: number) {
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${ttlSec}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  const now = new Date();
  const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (req.method === 'GET') {
    const entry = await kvGet(`abs:${mes}`);
    return res.json(entry ?? { mes, receita_abs: null, atualizado_em: null });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    const { api_key, mes: bodyMes, receita_abs } = body;

    if (!API_KEY || api_key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    if (!bodyMes || typeof receita_abs !== 'number') {
      return res.status(400).json({ error: 'Campos obrigatórios: mes (YYYY-MM), receita_abs (number)' });
    }

    const entry = { mes: bodyMes, receita_abs, atualizado_em: new Date().toISOString() };
    await kvSet(`abs:${bodyMes}`, entry, 60 * 60 * 24 * 45);
    return res.json({ ok: true, ...entry });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
