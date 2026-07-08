// Faturamento do mês — valor manual sincronizado via KV.
//
// A API do Paytour não retorna data de visita na listagem nem suporta filtro por
// disponibilidade_data (retorna total histórico independente do filtro).
// Portanto, o valor é informado manualmente via POST e compartilhado entre todos os PCs.
//
// POST /api/paytour-faturamento  { mes: "2026-07", receita: 20127.00 }
// GET  /api/paytour-faturamento  → retorna receita do mês corrente

const KV_URL    = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN ?? '';
const TTL_SEC   = 60 * 60 * 24 * 60; // 60 dias

// Bases conhecidas — usadas enquanto não houver valor no KV
const BASES: Record<string, number> = {
  '2026-06': 46298.00,  // XLS exportado em 29/06/2026
  '2026-07': 20127.00,  // Resumo Financeiro Paytour em 08/07/2026
};

async function kvGet(key: string) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    const j = await r.json() as any;
    const raw = j?.result;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}

async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${TTL_SEC}`, {
      method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const now  = new Date();
  const pad  = (n: number) => String(n).padStart(2, '0');
  const mes  = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const since = `${mes}-01`;
  const until = `${mes}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;

  // ── POST: atualiza valor do mês no KV ────────────────────────────────────────
  if (req.method === 'POST') {
    const body    = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    const mesPOST = (body.mes as string) ?? mes;
    const receita = Number(body.receita);
    if (!mesPOST || isNaN(receita) || receita < 0)
      return res.status(400).json({ error: 'Campos obrigatórios: mes (YYYY-MM), receita (number)' });

    const entry = { receita, mes: mesPOST, atualizado_em: new Date().toISOString() };
    await kvSet(`ptf-manual:${mesPOST}`, entry);
    console.log(`[fat] POST manual: ${mesPOST} = R$${receita.toFixed(2)}`);
    return res.json({ ok: true, ...entry });
  }

  // ── GET: retorna valor do mês corrente ───────────────────────────────────────
  const kv = await kvGet(`ptf-manual:${mes}`) as { receita: number; atualizado_em: string } | null;

  const revenue      = kv?.receita ?? BASES[mes] ?? 0;
  const atualizado   = kv?.atualizado_em ?? null;
  const fonte        = kv ? 'manual' : (BASES[mes] !== undefined ? 'base' : 'zero');

  console.log(`[fat] GET ${mes}: R$${revenue.toFixed(2)} fonte=${fonte}`);
  return res.json({ revenue, since, until, atualizado_em: atualizado, fonte });
}
