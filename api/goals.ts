// Metas e comunicados do dashboard — compartilhados via KV (todos os PCs veem o mesmo valor).

const KV_URL   = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? '';
const KV_KEY        = 'dashboard:goals';
const KV_KEY_AVISO  = 'dashboard:aviso';
const TTL_SEC  = 365 * 24 * 3600; // 1 ano

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

async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${TTL_SEC}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const type = (req.query?.type ?? req.body?.type ?? '') as string;

  // ── Comunicados rápidos ──────────────────────────────────────────────────────
  if (type === 'aviso') {
    if (req.method === 'GET') {
      const aviso = await kvGet(KV_KEY_AVISO);
      return res.json({ aviso: aviso ?? null });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      const aviso = { text: String(body.text ?? '').slice(0, 300), active: !!body.active };
      await kvSet(KV_KEY_AVISO, aviso);
      return res.json({ ok: true, aviso });
    }
  }

  // ── Metas ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const goals = await kvGet(KV_KEY);
    return res.json({ goals: goals ?? null });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    await kvSet(KV_KEY, body);
    return res.json({ ok: true, goals: body });
  }

  return res.status(405).end();
}
