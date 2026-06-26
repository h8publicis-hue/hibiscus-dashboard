// Retorna o valor de Receita A&BS do mês atual salvo pelo Power BI.

const KV_URL   = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? '';

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

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  const now = new Date();
  const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const entry = await kvGet(`abs:${mes}`);
  if (!entry) {
    return res.json({ mes, receita_abs: null, atualizado_em: null });
  }

  return res.json(entry);
}
