const DEFAULT_OCC = { beach: 0, lounges: Array(19).fill(0), prime: 0, parceiros: 0, colaboradores: 0, loungeObs: Array(19).fill(''), loungeData: Array(19).fill(null).map(() => ({ nome:'',telefone:'',canal:'',veiculo:'',parceiro:'',codParceiro:'',obs:'',transferido:false })) };
const clamp = (n: unknown, min: number, max: number) => Math.min(max, Math.max(min, Number(n) || 0));

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function todayBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
}

async function kvGet(key: string) {
  if (!KV_URL || !KV_TOKEN) return null;
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const j = await r.json() as any;
  const result = j?.result;
  if (!result) return null;
  try { return typeof result === 'string' ? JSON.parse(result) : result; } catch { return null; }
}

async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
}

function emptyInfo() {
  return { nome:'',telefone:'',canal:'',veiculo:'',parceiro:'',codParceiro:'',obs:'',transferido:false };
}

function sanitizeInfo(raw: any) {
  if (!raw || typeof raw !== 'object') return emptyInfo();
  return {
    nome:        String(raw.nome        ?? '').slice(0, 100),
    telefone:    String(raw.telefone    ?? '').slice(0, 30),
    canal:       String(raw.canal       ?? '').slice(0, 50),
    veiculo:     String(raw.veiculo     ?? '').slice(0, 50),
    parceiro:    String(raw.parceiro    ?? '').slice(0, 100),
    codParceiro: String(raw.codParceiro ?? '').slice(0, 50),
    obs:         String(raw.obs         ?? '').slice(0, 500),
    transferido: Boolean(raw.transferido),
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const action = (req.query?.action as string) ?? '';

  // ── RESERVAS ──────────────────────────────────────────────────────────────────
  if (action === 'reservas') {
    const data = ((req.query?.data as string) || todayBRT()).trim();
    const key  = `reservas:${data}`;

    if (req.method === 'GET') {
      const reservas = (await kvGet(key)) ?? [];
      return res.json({ reservas });
    }

    if (req.method === 'POST') {
      const raw = req.body?.reserva;
      if (!raw) return res.status(400).json({ error: 'reserva obrigatória' });
      const reserva = {
        id:        raw.id || uuid(),
        loungeIdx: Number(raw.loungeIdx ?? 0),
        data:      String(raw.data || data).slice(0, 10),
        info:      sanitizeInfo(raw.info),
        status:    String(raw.status || 'reserva'),
        criadaEm:  raw.criadaEm || Date.now(),
      };
      const reservas: any[] = (await kvGet(key)) ?? [];
      const idx = reservas.findIndex((r: any) => r.id === reserva.id);
      if (idx >= 0) reservas[idx] = reserva; else reservas.push(reserva);
      await kvSet(key, reservas);
      return res.json({ ok: true, reserva });
    }

    if (req.method === 'DELETE') {
      const id = (req.query?.id as string ?? '').trim();
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const reservas: any[] = (await kvGet(key)) ?? [];
      const updated = reservas.map((r: any) => r.id === id ? { ...r, status: 'cancelada' } : r);
      await kvSet(key, updated);
      return res.json({ ok: true });
    }

    return res.status(405).end();
  }

  // ── OCUPAÇÃO GET ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const occ  = (await kvGet('ocupacao')) ?? DEFAULT_OCC;
      const hoje = todayBRT();
      const reservas = (await kvGet(`reservas:${hoje}`)) ?? [];
      return res.json({ ...occ, reservasHoje: reservas });
    } catch {
      return res.json(DEFAULT_OCC);
    }
  }

  // ── OCUPAÇÃO POST ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const d   = req.body;
    const obs = Array.isArray(d.loungeObs)  ? d.loungeObs  : [];
    const ld  = Array.isArray(d.loungeData) ? d.loungeData : [];
    const data = {
      beach:         clamp(d.beach, 0, 500),
      lounges:       Array(19).fill(0).map((_: unknown, i: number) => clamp((d.lounges as number[])?.[i], 0, 10)),
      prime:         clamp(d.prime, 0, 10),
      parceiros:     clamp(d.parceiros, 0, 999),
      colaboradores: clamp(d.colaboradores, 0, 999),
      loungeObs:     Array(19).fill('').map((_: unknown, i: number) => String(obs[i] ?? '').slice(0, 200)),
      loungeData:    Array(19).fill(null).map((_: unknown, i: number) => sanitizeInfo(ld[i])),
    };
    await kvSet('ocupacao', data);
    return res.json(data);
  }

  return res.status(405).end();
}
