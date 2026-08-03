// Proxy para Firestore — chamadas do garçom (projeto SolicitacaoDeAtendimento)

const PROJECT_ID = 'solicitacaodeatendimento-988f8';
const API_KEY    = process.env.FIREBASE_API_KEY ?? '';
const KV_URL     = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN   = process.env.KV_REST_API_TOKEN ?? '';

// Cache em memória (por instância serverless) + Redis para compartilhar entre instâncias
// TTL curto para dados ao vivo — reduz leituras Firestore e evita quota 429
const MEM_TTL = 60_000;  // 1 min em memória
const KV_TTL  = 60;      // 1 min no Redis

const memCache = new Map<string, { data: unknown; ts: number }>();

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
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${KV_TTL}`, {
      method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

function todayBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function field(f: any, key: string): string {
  const v = f?.[key];
  if (!v) return '';
  return v.stringValue ?? String(v.integerValue ?? v.doubleValue ?? '');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).end();

  if (!API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY não configurada' });

  const start = (req.query?.start as string) || todayBRT();
  const end   = (req.query?.end   as string) || start;
  const cacheKey = `chamadas-v1:${start}_${end}`;

  // L1: memória
  const mem = memCache.get(cacheKey);
  if (mem && Date.now() - mem.ts < MEM_TTL) {
    return res.json(mem.data);
  }

  // L2: Redis
  const kv = await kvGet(cacheKey);
  if (kv) {
    memCache.set(cacheKey, { data: kv, ts: Date.now() });
    return res.json(kv);
  }

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

  const body = {
    structuredQuery: {
      from: [{ collectionId: 'chamadas' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'data_hora' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: `${start} 00:00:00` } } },
            { fieldFilter: { field: { fieldPath: 'data_hora' }, op: 'LESS_THAN_OR_EQUAL',    value: { stringValue: `${end} 23:59:59`   } } },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'data_hora' }, direction: 'DESCENDING' }],
      limit: 500,
    },
  };

  try {
    const r    = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const raw  = await r.json() as any;

    // Firestore 429: quota esgotada — retorna cache antigo se disponível, senão erro claro
    if (!Array.isArray(raw)) {
      const code = raw?.error?.code ?? raw?.code;
      console.error('[chamadas] Firestore erro:', JSON.stringify(raw)?.slice(0, 200));
      return res.status(code === 429 ? 429 : 502).json({ error: raw?.error?.message ?? 'Firestore error', chamadas: [], start, end });
    }

    const chamadas = raw
      .filter((d: any) => d.document)
      .map((d: any) => {
        const f = d.document.fields ?? {};
        const mesa = f.mesa?.integerValue ?? f.mesa?.doubleValue ?? f.mesa?.stringValue ?? '';
        return {
          id:               field(f, 'id') || (d.document.name as string).split('/').pop(),
          mesa:             mesa !== '' ? Number(mesa) : null,
          pulseira:         field(f, 'pulseira'),
          status:           field(f, 'status'),
          garcom:           field(f, 'garcom'),
          tipo:             field(f, 'tipo'),
          setor:            field(f, 'setor'),
          mensagem:         field(f, 'mensagem'),
          data_hora:        field(f, 'data_hora'),
          aceitoEm:         field(f, 'aceitoEm'),
          finalizadoEm:     field(f, 'finalizadoEm'),
          tempoEspera:      field(f, 'tempoEspera'),
          tempoAtendimento: field(f, 'tempoAtendimento'),
        };
      });

    console.log(`[chamadas] ${start}: ${chamadas.length} chamadas`);
    const result = { chamadas, start, end };
    memCache.set(cacheKey, { data: result, ts: Date.now() });
    kvSet(cacheKey, result);
    return res.json(result);
  } catch (e: any) {
    console.error('[chamadas] erro:', e.message);
    return res.status(500).json({ error: e.message, chamadas: [], start, end });
  }
}
