// Check-in online via painel Paytour (loja.hibiscusbeachclub.com.br).
// Usa PHPSESSID armazenado como env var — renovar quando a sessão expirar.

const LOJA_BASE  = 'https://loja.hibiscusbeachclub.com.br';
const PHPSESSID  = process.env.PAYTOUR_LOJA_SESSION ?? '';
const KV_URL     = process.env.KV_REST_API_URL      ?? '';
const KV_TOKEN   = process.env.KV_REST_API_TOKEN    ?? '';
const CACHE_TTL  = 5 * 60 * 1000;
const KV_TTL_SEC = 5 * 60;

let memCache: { data: CheckinData; ts: number } | null = null;

export interface CheckinData {
  reservados: number;
  disponiveis: number;
  checkins: number;
  pendentes: number;
  total: number;
  ts: number;
}

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
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${KV_TTL_SEC}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

function todayBRT(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function lojaFetch(path: string) {
  return fetch(`${LOJA_BASE}${path}`, {
    headers: {
      Cookie: `PHPSESSID=${PHPSESSID}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${LOJA_BASE}/admin/checkin`,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

async function fetchCheckin(): Promise<CheckinData> {
  const today = todayBRT();
  const start = `${today}T00:00:00.000-03:00`;
  const end   = `${today}T23:59:59.000-03:00`;

  // Step 1: busca o calendário para pegar disponibilidadeId e capacidade do Day use
  const calRes = await lojaFetch(`/admin/calendario?passeoIds=&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&isCheckin=1`);
  if (!calRes.ok) throw new Error(`Calendario HTTP ${calRes.status}`);
  const items = await calRes.json() as any[];
  if (!Array.isArray(items)) throw new Error('Sessão expirada — renovar PAYTOUR_LOJA_SESSION');

  // Pega apenas o Day use principal (tipo faixa = período fixo de dia)
  const dayuse = items.find((i: any) => i.type === 'faixa') ?? items[0];
  if (!dayuse) throw new Error('Nenhum item de day use encontrado');

  const disponibilidadeId = dayuse.id;
  const total    = Number(dayuse.total ?? 0);
  const reservados = Number(dayuse.reservados ?? 0);
  const disponiveis = total - reservados;

  // Step 2: busca vouchers individuais para contar checkins realizados
  const vRes = await lojaFetch(`/admin/checkin/vouchers-by-availability/${disponibilidadeId}`);
  let checkins = 0;
  if (vRes.ok) {
    const vData = await vRes.json() as any;
    const vouchers: any[] = vData?.vouchers ?? [];
    checkins = vouchers.filter((v: any) => v.utilizado === true).length;
  }

  const pendentes = reservados - checkins;

  return { reservados, disponiveis, checkins, pendentes, total, ts: Date.now() };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!PHPSESSID) return res.status(503).json({ error: 'PAYTOUR_LOJA_SESSION não configurado' });

  const cacheKey = `checkin:${todayBRT()}`;

  if (memCache && Date.now() - memCache.ts < CACHE_TTL) return res.json(memCache.data);

  const kv = await kvGet(cacheKey) as CheckinData | null;
  if (kv && Date.now() - kv.ts < CACHE_TTL) {
    memCache = { data: kv, ts: kv.ts };
    return res.json(kv);
  }

  try {
    const data = await fetchCheckin();
    memCache = { data, ts: data.ts };
    kvSet(cacheKey, data);
    return res.json(data);
  } catch (err: any) {
    console.error('[checkin]', err.message);
    if (memCache) return res.json({ ...memCache.data, stale: true });
    return res.status(500).json({ error: err.message });
  }
}
