// CRUD de pessoas para o módulo refeitório

const PROJECT_ID = 'solicitacaodeatendimento-988f8';
const API_KEY    = process.env.FIREBASE_API_KEY ?? '';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function toFirestore(data: Record<string, any>) {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string')  fields[k] = { stringValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (typeof v === 'number')  fields[k] = { integerValue: String(v) };
  }
  return { fields };
}

function fromFirestore(doc: any) {
  const f = doc?.fields ?? {};
  const str  = (k: string) => f[k]?.stringValue  ?? '';
  const bool = (k: string) => f[k]?.booleanValue ?? true;
  return {
    id:        str('id'),
    nome:      str('nome'),
    categoria: str('categoria'),
    empresa:   str('empresa'),
    setor:     str('setor'),
    foto:      str('foto'),
    qrCode:    str('qrCode'),
    ativo:     bool('ativo'),
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY não configurada' });

  // GET — lista todas as pessoas
  if (req.method === 'GET') {
    const url = `${BASE}:runQuery?key=${API_KEY}`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'pessoas_refeicao' }],
        orderBy: [{ field: { fieldPath: 'nome' }, direction: 'ASCENDING' }],
        limit: 500,
      },
    };
    try {
      const r    = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs = await r.json() as any[];
      const pessoas = docs.filter(d => d.document).map(d => fromFirestore(d.document));
      return res.json({ pessoas });
    } catch (err: any) {
      return res.status(500).json({ error: String(err) });
    }
  }

  // POST — cria nova pessoa (gera qrCode UUID)
  if (req.method === 'POST') {
    const id = uuid();
    const qrCode = uuid();
    const data = {
      id,
      qrCode,
      nome:      String(req.body?.nome      ?? '').slice(0, 100),
      categoria: String(req.body?.categoria ?? 'colaborador'),
      empresa:   String(req.body?.empresa   ?? '').slice(0, 100),
      setor:     String(req.body?.setor     ?? '').slice(0, 100),
      foto:      String(req.body?.foto      ?? '').slice(0, 500),
      ativo:     req.body?.ativo !== false,
    };
    try {
      const url = `${BASE}/pessoas_refeicao/${id}?key=${API_KEY}`;
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestore(data)),
      });
      return res.json({ ok: true, pessoa: data });
    } catch (err: any) {
      return res.status(500).json({ error: String(err) });
    }
  }

  // PATCH — edita pessoa existente
  if (req.method === 'PATCH') {
    const id = (req.query?.id as string ?? '').trim();
    if (!id) return res.status(400).json({ error: 'id obrigatório' });
    const allowed = ['nome', 'categoria', 'empresa', 'setor', 'foto', 'ativo'];
    const patch: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    try {
      const url = `${BASE}/pessoas_refeicao/${id}?key=${API_KEY}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
      const existing = await r.json();
      const merged = { ...fromFirestore(existing), ...patch, id };
      await fetch(`${BASE}/pessoas_refeicao/${id}?key=${API_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestore(merged)),
      });
      return res.json({ ok: true, pessoa: merged });
    } catch (err: any) {
      return res.status(500).json({ error: String(err) });
    }
  }

  return res.status(405).end();
}
