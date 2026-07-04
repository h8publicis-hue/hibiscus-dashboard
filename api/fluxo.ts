// Análise do fluxo de clientes — lê histórico do KV (gravado pelo fluxo-snapshot).

const KV_URL   = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? '';

export interface FluxoRow {
  date:       string;
  portaria:   number;
  beach:      number;
  lounge:     number;
  condominio: number;
  total:      number;
  gap:        number;
}

async function kvKeys(pattern: string): Promise<string[]> {
  if (!KV_URL || !KV_TOKEN) return [];
  try {
    const r = await fetch(`${KV_URL}/keys/${encodeURIComponent(pattern)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const j = await r.json() as any;
    return Array.isArray(j?.result) ? j.result : [];
  } catch { return []; }
}

async function kvGet(key: string): Promise<FluxoRow | null> {
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

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const { de, ate } = req.query as Record<string, string>;
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateFrom = de  || (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
  const dateTo   = ate || today;

  try {
    const allKeys = await kvKeys('fluxo:*');

    const keysInRange = allKeys
      .filter(k => {
        const d = k.replace('fluxo:', '');
        return d >= dateFrom && d <= dateTo;
      })
      .sort();

    const rows = (await Promise.all(keysInRange.map(k => kvGet(k))))
      .filter((r): r is FluxoRow => r !== null && !!r.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({ rows, dateFrom, dateTo });
  } catch (err: any) {
    console.error('[fluxo]', err.message);
    return res.status(500).json({ error: String(err), rows: [] });
  }
}
