// Keep-alive: mantém a sessão do painel loja ativa fazendo ping a cada chamada.
// Chamado pelo cron do Vercel a cada 2h para evitar expiração por inatividade.

const LOJA_BASE = 'https://loja.hibiscusbeachclub.com.br';
const PHPSESSID = process.env.PAYTOUR_LOJA_SESSION ?? '';
const KV_URL    = process.env.KV_REST_API_URL      ?? '';
const KV_TOKEN  = process.env.KV_REST_API_TOKEN    ?? '';

async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=86400`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PHPSESSID) return res.status(503).json({ ok: false, error: 'PAYTOUR_LOJA_SESSION não configurado' });

  try {
    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const start = `${today}T00:00:00.000-03:00`;
    const end   = `${today}T23:59:59.000-03:00`;

    const r = await fetch(
      `${LOJA_BASE}/admin/calendario?passeoIds=&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&isCheckin=1`,
      {
        headers: {
          Cookie: `PHPSESSID=${PHPSESSID}`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `${LOJA_BASE}/admin/checkin`,
        },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!r.ok) {
      return res.status(200).json({ ok: false, status: r.status, error: `HTTP ${r.status}` });
    }

    const data = await r.json();
    const alive = Array.isArray(data);

    // Salva no KV o status do keep-alive para monitoramento
    await kvSet('checkin:keepalive', { ok: alive, ts: Date.now(), httpStatus: r.status });

    // Invalida cache do checkin para forçar dados frescos na próxima visita
    if (alive) {
      await fetch(`${KV_URL}/del/checkin:${today}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      }).catch(() => {});
    }

    return res.json({
      ok: alive,
      ts: new Date().toISOString(),
      sessionActive: alive,
      message: alive ? 'Sessão ativa — TTL renovado' : 'Sessão expirada — renovar PAYTOUR_LOJA_SESSION',
    });
  } catch (err: any) {
    return res.status(200).json({ ok: false, error: String(err) });
  }
}
