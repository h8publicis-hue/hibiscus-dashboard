// Módulo refeitório — endpoint unificado
// GET  /api/refeicoes                  → lista/contagem refeições do dia
// POST /api/refeicoes                  → registra refeição
// GET  /api/refeicoes?action=lookup&qr=UUID → lookup pessoa por QR
// GET  /api/refeicoes?action=pessoas   → lista pessoas
// POST /api/refeicoes?action=pessoas   → cria pessoa (gera qrCode UUID)
// PATCH /api/refeicoes?action=pessoas&id=ID → edita pessoa

const PROJECT_ID = 'solicitacaodeatendimento-988f8';
const API_KEY    = process.env.FIREBASE_API_KEY ?? '';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function todayBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
}

function nowBRT(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });
}

function toFirestore(data: Record<string, any>) {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string')       fields[k] = { stringValue: v };
    else if (typeof v === 'number')  fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
  }
  return { fields };
}

function fromPessoa(doc: any) {
  const f = doc?.fields ?? {};
  const s = (k: string) => f[k]?.stringValue  ?? '';
  const b = (k: string) => f[k]?.booleanValue ?? true;
  return { id: s('id'), nome: s('nome'), categoria: s('categoria'), empresa: s('empresa'), setor: s('setor'), foto: s('foto'), qrCode: s('qrCode'), ativo: b('ativo') };
}

function fromRefeicao(doc: any) {
  const f = doc?.fields ?? {};
  const s = (k: string) => f[k]?.stringValue ?? '';
  const n = (k: string) => Number(f[k]?.integerValue ?? f[k]?.doubleValue ?? 0);
  return { id: s('id'), pessoaId: s('pessoaId'), nome: s('nome'), categoria: s('categoria'), empresa: s('empresa'), tipoRefeicao: s('tipoRefeicao'), data: s('data'), hora: s('hora'), timestamp: n('timestamp'), origemRegistro: s('origemRegistro'), status: s('status') };
}

async function runQuery(body: any) {
  const r = await fetch(`${BASE}:runQuery?key=${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json() as Promise<any[]>;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY não configurada' });

  const action = (req.query?.action as string) ?? '';

  // ── LOOKUP: GET ?action=lookup&qr=UUID ──────────────────────────────────────
  if (action === 'lookup') {
    const qr = (req.query?.qr as string ?? '').trim();
    if (!qr) return res.status(400).json({ error: 'qr obrigatório' });
    try {
      const docs = await runQuery({ structuredQuery: { from: [{ collectionId: 'pessoas_refeicao' }], where: { fieldFilter: { field: { fieldPath: 'qrCode' }, op: 'EQUAL', value: { stringValue: qr } } }, limit: 1 } });
      const doc = docs?.[0]?.document;
      if (!doc) return res.json({ found: false });
      return res.json({ found: true, pessoa: fromPessoa(doc) });
    } catch (err: any) { return res.status(500).json({ error: String(err) }); }
  }

  // ── PESSOAS: GET/POST/PATCH ?action=pessoas ──────────────────────────────────
  if (action === 'pessoas') {
    if (req.method === 'GET') {
      try {
        const docs = await runQuery({ structuredQuery: { from: [{ collectionId: 'pessoas_refeicao' }], orderBy: [{ field: { fieldPath: 'nome' }, direction: 'ASCENDING' }], limit: 500 } });
        return res.json({ pessoas: docs.filter((d: any) => d.document).map((d: any) => fromPessoa(d.document)) });
      } catch (err: any) { return res.status(500).json({ error: String(err) }); }
    }

    if (req.method === 'POST') {
      const id = uuid(); const qrCode = uuid();
      const data = { id, qrCode, nome: String(req.body?.nome ?? '').slice(0, 100), categoria: String(req.body?.categoria ?? 'colaborador'), empresa: String(req.body?.empresa ?? '').slice(0, 100), setor: String(req.body?.setor ?? '').slice(0, 100), foto: String(req.body?.foto ?? '').slice(0, 500), ativo: req.body?.ativo !== false };
      try {
        await fetch(`${BASE}/pessoas_refeicao/${id}?key=${API_KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFirestore(data)) });
        return res.json({ ok: true, pessoa: data });
      } catch (err: any) { return res.status(500).json({ error: String(err) }); }
    }

    if (req.method === 'PATCH') {
      const id = (req.query?.id as string ?? '').trim();
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      try {
        const r = await fetch(`${BASE}/pessoas_refeicao/${id}?key=${API_KEY}`);
        const existing = fromPessoa(await r.json());
        const allowed = ['nome', 'categoria', 'empresa', 'setor', 'foto', 'ativo'];
        const patch: Record<string, any> = {};
        for (const k of allowed) { if (req.body?.[k] !== undefined) patch[k] = req.body[k]; }
        const merged = { ...existing, ...patch, id };
        await fetch(`${BASE}/pessoas_refeicao/${id}?key=${API_KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFirestore(merged)) });
        return res.json({ ok: true, pessoa: merged });
      } catch (err: any) { return res.status(500).json({ error: String(err) }); }
    }

    return res.status(405).end();
  }

  // ── REFEIÇÕES: GET (lista/contagem) ─────────────────────────────────────────
  if (req.method === 'GET') {
    const data = (req.query?.data as string) || todayBRT();
    try {
      const docs = await runQuery({ structuredQuery: { from: [{ collectionId: 'refeicoes' }], where: { fieldFilter: { field: { fieldPath: 'data' }, op: 'EQUAL', value: { stringValue: data } } }, orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }], limit: 500 } });
      const refeicoes = docs.filter((d: any) => d.document).map((d: any) => fromRefeicao(d.document));
      const registradas = refeicoes.filter((r: any) => r.status === 'registrada');
      return res.json({ refeicoes, total: registradas.length, porTipo: { almoco: registradas.filter((r: any) => r.tipoRefeicao === 'almoco').length, jantar: registradas.filter((r: any) => r.tipoRefeicao === 'jantar').length, cafe: registradas.filter((r: any) => r.tipoRefeicao === 'cafe').length, lanche: registradas.filter((r: any) => r.tipoRefeicao === 'lanche').length } });
    } catch (err: any) { return res.status(500).json({ error: String(err) }); }
  }

  // ── REFEIÇÕES: POST (registrar) ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const { pessoaId, nome, categoria, empresa, tipoRefeicao = 'almoco', origemRegistro = 'QRCode' } = req.body ?? {};
    if (!pessoaId || !nome) return res.status(400).json({ error: 'pessoaId e nome obrigatórios' });
    const data = todayBRT(); const hora = nowBRT();
    try {
      const qdocs = await runQuery({ structuredQuery: { from: [{ collectionId: 'refeicoes' }], where: { compositeFilter: { op: 'AND', filters: [{ fieldFilter: { field: { fieldPath: 'pessoaId' }, op: 'EQUAL', value: { stringValue: pessoaId } } }, { fieldFilter: { field: { fieldPath: 'tipoRefeicao' }, op: 'EQUAL', value: { stringValue: tipoRefeicao } } }, { fieldFilter: { field: { fieldPath: 'data' }, op: 'EQUAL', value: { stringValue: data } } }, { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'registrada' } } }] } }, limit: 1 } });
      const existing = qdocs.find((d: any) => d.document);
      if (existing) { const prev = fromRefeicao(existing.document); return res.json({ ok: true, status: 'duplicada', horaAnterior: prev.hora }); }
      const id = uuid();
      const refeicao = { id, pessoaId, nome: String(nome).slice(0, 100), categoria: String(categoria ?? '').slice(0, 50), empresa: String(empresa ?? '').slice(0, 100), tipoRefeicao: String(tipoRefeicao), data, hora, timestamp: Date.now(), origemRegistro: String(origemRegistro), status: 'registrada' };
      await fetch(`${BASE}/refeicoes/${id}?key=${API_KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFirestore(refeicao)) });
      return res.json({ ok: true, status: 'registrada', refeicao });
    } catch (err: any) { return res.status(500).json({ error: String(err) }); }
  }

  return res.status(405).end();
}
