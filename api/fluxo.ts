// Análise do fluxo de clientes — lê histórico da planilha Google Sheets.
// Colunas: A=Data B=Beach C=Condomínio D=Gap E=Lounge F=Portaria G=Total H=Timestamp

const SHEET_ID = '1VK96eEOw9dNWu_jEHUAKM71Js7HLrZsl09tSoLXwtA8';

export interface FluxoRow {
  date:       string;
  portaria:   number;
  beach:      number;
  lounge:     number;
  condominio: number;
  total:      number;
  gap:        number;
}

function parseGvizDate(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10);
  if (typeof v === 'object' && v !== null) {
    const m = String(v).match(/Date\((\d+),(\d+),(\d+)\)/);
    if (m) return `${m[1]}-${String(Number(m[2]) + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return '';
}

function num(v: unknown): number { return Number(v) || 0; }

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { de, ate } = req.query as Record<string, string>;

  // Sem datas → retorna últimos 90 dias
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = de  || (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
  const dateTo   = ate || today;

  try {
    const tq = encodeURIComponent(
      `SELECT A, B, C, D, E, F, G WHERE A >= date '${dateFrom}' AND A <= date '${dateTo}' ORDER BY A ASC`
    );
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&tq=${tq}`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await r.text();

    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    const json  = JSON.parse(text.slice(start, end + 1)) as any;

    const rows: FluxoRow[] = (json?.table?.rows ?? []).map((row: any) => {
      const c = row.c as Array<{ v: unknown } | null>;
      return {
        date:       parseGvizDate(c[0]?.v),
        beach:      num(c[1]?.v),
        condominio: num(c[2]?.v),
        gap:        num(c[3]?.v),
        lounge:     num(c[4]?.v),
        portaria:   num(c[5]?.v),
        total:      num(c[6]?.v),
      };
    }).filter((r: FluxoRow) => r.date);

    return res.json({ rows, dateFrom, dateTo });
  } catch (err: any) {
    console.error('[fluxo]', err.message);
    return res.status(500).json({ error: String(err) });
  }
}
