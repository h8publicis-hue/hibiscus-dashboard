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

  // ── Config (senha admin) ────────────────────────────────────────────────────
  if (type === 'config') {
    if (req.method === 'GET') {
      const stored = await kvGet('dashboard:config');
      return res.json({ config: stored ?? null });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      const current = (await kvGet('dashboard:config')) ?? {};
      const updated = { ...current };
      if (body.adminPassword) updated.adminPassword = String(body.adminPassword).slice(0, 100);
      await kvSet('dashboard:config', updated);
      return res.json({ ok: true });
    }
  }

  // ── Comunicados rápidos ──────────────────────────────────────────────────────
  if (type === 'aviso') {
    if (req.method === 'GET') {
      const stored = await kvGet(KV_KEY_AVISO);
      const avisos = Array.isArray(stored?.avisos) ? stored.avisos : [];
      return res.json({ avisos });
    }
    if (req.method === 'POST') {
      const body   = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      const avisos = (Array.isArray(body.avisos) ? body.avisos : [])
        .slice(0, 5)
        .map((a: any) => ({ text: String(a.text ?? '').slice(0, 300), active: !!a.active }));
      await kvSet(KV_KEY_AVISO, { avisos });
      return res.json({ ok: true, avisos });
    }
  }

  // ── Vendas diárias ───────────────────────────────────────────────────────────
  if (type === 'vendas') {
    const months: string[] = [];
    const now = new Date();
    // suporta ?months=2 para buscar mês atual + anterior
    const monthsParam = parseInt(String(req.query?.months ?? '1'), 10) || 1;
    for (let i = 0; i < Math.min(monthsParam, 3); i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    if (req.method === 'GET') {
      const results = await Promise.all(months.map(m => kvGet(`dashboard:vendas:${m}`)));
      const merged: Record<string, unknown> = {};
      for (const r of results.reverse()) {
        if (r && typeof r === 'object') Object.assign(merged, r);
      }
      return res.json({ vendas: merged });
    }

    if (req.method === 'POST') {
      const body  = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      const entry = body.entry as { date?: string; [k: string]: unknown } | undefined;
      if (!entry?.date) return res.status(400).json({ error: 'entry.date required' });
      const monthKey = `dashboard:vendas:${entry.date.slice(0, 7)}`;
      const existing = (await kvGet(monthKey)) ?? {};
      const updated  = { ...existing, [entry.date]: entry };
      await kvSet(monthKey, updated);
      return res.json({ ok: true });
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
