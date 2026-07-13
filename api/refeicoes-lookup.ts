// Lookup rápido de pessoa pelo qrCode — usado pelo scanner do refeitório

const PROJECT_ID = 'solicitacaodeatendimento-988f8';
const API_KEY    = process.env.FIREBASE_API_KEY ?? '';

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function str(f: any, key: string): string {
  return f?.[key]?.stringValue ?? '';
}
function bool(f: any, key: string): boolean {
  return f?.[key]?.booleanValue ?? true;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).end();
  if (!API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY não configurada' });

  const qr = (req.query?.qr as string ?? '').trim();
  if (!qr) return res.status(400).json({ error: 'qr obrigatório' });

  const url = `${BASE}:runQuery?key=${API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'pessoas_refeicao' }],
      where: { fieldFilter: { field: { fieldPath: 'qrCode' }, op: 'EQUAL', value: { stringValue: qr } } },
      limit: 1,
    },
  };

  try {
    const r    = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const docs = await r.json() as any[];
    const doc  = docs?.[0]?.document;
    if (!doc) return res.status(404).json({ found: false });

    const f = doc.fields ?? {};
    return res.json({
      found: true,
      pessoa: {
        id:        str(f, 'id'),
        nome:      str(f, 'nome'),
        categoria: str(f, 'categoria'),
        empresa:   str(f, 'empresa'),
        setor:     str(f, 'setor'),
        foto:      str(f, 'foto'),
        ativo:     bool(f, 'ativo'),
        qrCode:    str(f, 'qrCode'),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: String(err) });
  }
}
