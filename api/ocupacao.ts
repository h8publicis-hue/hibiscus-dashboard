import { kv } from '@vercel/kv';

const DEFAULT = { beach: 0, lounges: Array(14).fill(0), prime: 0 };
const clamp = (n: unknown, min: number, max: number) =>
  Math.min(max, Math.max(min, Number(n) || 0));

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const data = (await kv.get('ocupacao')) ?? DEFAULT;
    return res.json(data);
  }

  if (req.method === 'POST') {
    const d = req.body;
    const data = {
      beach:   clamp(d.beach, 0, 500),
      lounges: Array(14).fill(0).map((_: unknown, i: number) => clamp((d.lounges as number[])?.[i], 0, 10)),
      prime:   clamp(d.prime, 0, 10),
    };
    await kv.set('ocupacao', data);
    return res.json(data);
  }

  return res.status(405).end();
}
