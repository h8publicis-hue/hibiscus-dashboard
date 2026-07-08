// Snapshot diário do fluxo — grava portaria + ocupação no KV como histórico.
// GET ?action=save  → cron 18h BRT: só grava se portaria > 0 e não piora dados existentes
// POST              → reset manual: sempre grava (captura o pico antes de zerar)
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

const TTL_2Y = 2 * 365 * 24 * 3600;

async function buildSnapshot(date: string) {
  const [portariaRaw, ocupacaoRaw] = await Promise.all([
    kvGet(`portaria:${date}`),
    kvGet('ocupacao'),
  ]);

  const portaria    = Number(portariaRaw ?? 0) || 0;
  const beach       = Number(ocupacaoRaw?.beach ?? 0);
  const loungeTotal = (ocupacaoRaw?.lounges as number[] | undefined)
    ?.reduce((a: number, b: number) => a + b, 0) ?? 0;
  const gap = portaria - (beach + loungeTotal);

  return { date, portaria, beach, lounge: loungeTotal, condominio: 0, total: portaria, gap };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const today = todayBRT();
  const kvKey = `fluxo:${today}`;

  // ── Cron às 18h (GET ?action=save) ───────────────────────────────────────────
  if (req.query?.action === 'save') {
    try {
      const snap = await buildSnapshot(today);

      // Só grava se portaria > 0 (dia com atividade real)
      if (snap.portaria === 0) {
        return res.json({ ok: true, skipped: true, reason: 'portaria=0', snap });
      }

      // Não sobrescreve se o registro existente já tem portaria maior
      const existing = await kvGet(kvKey) as { portaria?: number } | null;
      if (existing && (existing.portaria ?? 0) >= snap.portaria) {
        return res.json({ ok: true, skipped: true, reason: 'existing is better', existing, snap });
      }

      await kvSet(kvKey, snap, TTL_2Y);
      return res.json({ ok: true, snapshot: snap });
    } catch (err: any) {
      console.error('[fluxo-snapshot cron]', err.message);
      return res.status(500).json({ error: String(err) });
    }
  }

  // ── POST do frontend (antes de zerar) — sempre grava ─────────────────────────
  if (req.method === 'POST') {
    try {
      const snap = await buildSnapshot(today);
      await kvSet(kvKey, snap, TTL_2Y);
      return res.json({ ok: true, snapshot: snap });
    } catch (err: any) {
      console.error('[fluxo-snapshot reset]', err.message);
      return res.status(500).json({ error: String(err) });
    }
  }

  // ── GET simples → retorna snapshot do dia (sem gravar) ───────────────────────
  if (req.method === 'GET') {
    const existing = await kvGet(kvKey);
    return res.json({ date: today, snapshot: existing ?? null });
  }

  return res.status(405).end();
}
