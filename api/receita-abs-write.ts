// Recebe POST do Power BI com o valor de Receita A&BS do mês.
// Salva no Redis com TTL de 45 dias.

const KV_URL   = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? '';
const API_KEY  = process.env.RECEITA_ABS_API_KEY ?? '';

async function kvSet(key: string, value: unknown, ttlSec: number) {
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${ttlSec}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { api_key, mes, receita_abs } = body ?? {};

  if (!API_KEY || api_key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!mes || typeof receita_abs !== 'number') {
    return res.status(400).json({ error: 'Campos obrigatórios: mes (YYYY-MM), receita_abs (number)' });
  }

  const entry = { mes, receita_abs, atualizado_em: new Date().toISOString() };
  await kvSet(`abs:${mes}`, entry, 60 * 60 * 24 * 45);

  return res.json({ ok: true, ...entry });
}
