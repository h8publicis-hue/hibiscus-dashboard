// Registro e consulta de refeições

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
    if (typeof v === 'string')  fields[k] = { stringValue: v };
    else if (typeof v === 'number')  fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
  }
  return { fields };
}

function fromFirestore(doc: any) {
  const f = doc?.fields ?? {};
  const str = (k: string) => f[k]?.stringValue ?? '';
  const num = (k: string) => Number(f[k]?.integerValue ?? f[k]?.doubleValue ?? 0);
  return {
    id:             str('id'),
    pessoaId:       str('pessoaId'),
    nome:           str('nome'),
    categoria:      str('categoria'),
    empresa:        str('empresa'),
    tipoRefeicao:   str('tipoRefeicao'),
    data:           str('data'),
    hora:           str('hora'),
    timestamp:      num('timestamp'),
    origemRegistro: str('origemRegistro'),
    status:         str('status'),
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY não configurada' });

  // GET — lista refeições de uma data + contagem
  if (req.method === 'GET') {
    const data = (req.query?.data as string) || todayBRT();
    const url  = `${BASE}:runQuery?key=${API_KEY}`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'refeicoes' }],
        where: { fieldFilter: { field: { fieldPath: 'data' }, op: 'EQUAL', value: { stringValue: data } } },
        orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
        limit: 500,
      },
    };
    try {
      const r    = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs = await r.json() as any[];
      const refeicoes = docs.filter(d => d.document).map(d => fromFirestore(d.document));
      const registradas = refeicoes.filter(r => r.status === 'registrada');
      return res.json({
        refeicoes,
        total: registradas.length,
        porTipo: {
          almoco:  registradas.filter(r => r.tipoRefeicao === 'almoco').length,
          jantar:  registradas.filter(r => r.tipoRefeicao === 'jantar').length,
          cafe:    registradas.filter(r => r.tipoRefeicao === 'cafe').length,
          lanche:  registradas.filter(r => r.tipoRefeicao === 'lanche').length,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: String(err) });
    }
  }

  // POST — registra refeição (valida duplicidade)
  if (req.method === 'POST') {
    const { pessoaId, nome, categoria, empresa, tipoRefeicao = 'almoco', origemRegistro = 'QRCode' } = req.body ?? {};
    if (!pessoaId || !nome) return res.status(400).json({ error: 'pessoaId e nome obrigatórios' });

    const data = todayBRT();
    const hora = nowBRT();

    // Verifica duplicidade
    const queryUrl  = `${BASE}:runQuery?key=${API_KEY}`;
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: 'refeicoes' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'pessoaId'     }, op: 'EQUAL', value: { stringValue: pessoaId     } } },
              { fieldFilter: { field: { fieldPath: 'tipoRefeicao' }, op: 'EQUAL', value: { stringValue: tipoRefeicao } } },
              { fieldFilter: { field: { fieldPath: 'data'         }, op: 'EQUAL', value: { stringValue: data         } } },
              { fieldFilter: { field: { fieldPath: 'status'       }, op: 'EQUAL', value: { stringValue: 'registrada' } } },
            ],
          },
        },
        limit: 1,
      },
    };

    try {
      const qr   = await fetch(queryUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(queryBody) });
      const qdocs = await qr.json() as any[];
      const existing = qdocs.find(d => d.document);

      if (existing) {
        const prev = fromFirestore(existing.document);
        return res.json({ ok: true, status: 'duplicada', horaAnterior: prev.hora });
      }

      const id = uuid();
      const refeicao = {
        id, pessoaId,
        nome:           String(nome).slice(0, 100),
        categoria:      String(categoria ?? '').slice(0, 50),
        empresa:        String(empresa   ?? '').slice(0, 100),
        tipoRefeicao:   String(tipoRefeicao),
        data,
        hora,
        timestamp:      Date.now(),
        origemRegistro: String(origemRegistro),
        status:         'registrada',
      };

      await fetch(`${BASE}/refeicoes/${id}?key=${API_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestore(refeicao)),
      });

      return res.json({ ok: true, status: 'registrada', refeicao });
    } catch (err: any) {
      return res.status(500).json({ error: String(err) });
    }
  }

  return res.status(405).end();
}
