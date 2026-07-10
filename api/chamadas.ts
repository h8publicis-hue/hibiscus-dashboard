// Proxy para Firestore — chamadas do garçom (projeto SolicitacaoDeAtendimento)

const PROJECT_ID = 'solicitacaodeatendimento-988f8';
const API_KEY    = process.env.FIREBASE_API_KEY ?? '';

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
    const docs = await r.json() as any[];

    const chamadas = docs
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

    return res.json({ chamadas, start, end });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
