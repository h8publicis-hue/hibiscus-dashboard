const DEFAULT = { beach: 0, lounges: Array(14).fill(0), prime: 0 };
const clamp = (n: unknown, min: number, max: number) =>
  Math.min(max, Math.max(min, Number(n) || 0));

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key: string) {
  if (!KV_URL || !KV_TOKEN) return null;
  const r = await fetch(`${KV_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const j = await r.json() as any;
  const result = j?.result;
  if (!result) return null;
  try { return typeof result === 'string' ? JSON.parse(result) : result; } catch { return null; }
}

async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  // Upstash REST SET expects the value as a plain string body
  await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    try {
      const data = (await kvGet('ocupacao')) ?? DEFAULT;
      return res.json(data);
    } catch {
      return res.json(DEFAULT);
    }
  }

  if (req.method === 'POST') {
    const d = req.body;
    const data = {
      beach:   clamp(d.beach, 0, 500),
      lounges: Array(14).fill(0).map((_: unknown, i: number) => clamp((d.lounges as number[])?.[i], 0, 10)),
      prime:   clamp(d.prime, 0, 10),
    };
    await kvSet('ocupacao', data);
    return res.json(data);
  }

  return res.status(405).end();
}
