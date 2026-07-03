const SHEET_ID = '1VK96eEOw9dNWu_jEHUAKM71Js7HLrZsl09tSoLXwtA8';
const TTL      = 2 * 60 * 1000;  // cache 2 min

let cache: { data: Record<string, unknown>; ts: number } | null = null;

function parseGvizDate(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10);
  // gviz retorna Date(year, month0, day)
  if (typeof v === 'object' && v !== null) {
    const s = String(v);
    const m = s.match(/Date\((\d+),(\d+),(\d+)\)/);
    if (m) {
      const y = m[1], mo = String(Number(m[2]) + 1).padStart(2,'0'), d = m[3].padStart(2,'0');
      return `${y}-${mo}-${d}`;
    }
  }
  return '';
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (cache && Date.now() - cache.ts < TTL) {
    return res.json(cache.data);
  }

  try {
    const query = encodeURIComponent('SELECT * ORDER BY A DESC LIMIT 1');
    const url   = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&tq=${query}`;
    const r     = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const text  = await r.text();

    // gviz wraps JSON em callback — extrai o JSON puro
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    const json  = JSON.parse(text.slice(start, end + 1)) as any;

    const row = json?.table?.rows?.[0];
    if (!row) return res.status(404).json({ error: 'Sem dados' });

    const c = row.c as Array<{ v: unknown; f?: string } | null>;
    const val = (i: number) => (c[i]?.v as number) ?? 0;

    // Colunas: A=data B=Beach C=Condomínio D=Gap E=Lounge F=Portaria G=Total H=Timestamp
    const data = {
      date:       parseGvizDate(c[0]?.v),
      beach:      val(1),
      condominio: val(2),
      gap:        val(3),
      lounge:     val(4),
      portaria:   val(5),
      total:      val(6),
      timestamp:  String(c[7]?.v ?? ''),
      isToday:    parseGvizDate(c[0]?.v) === new Date().toISOString().slice(0, 10),
    };

    cache = { data, ts: Date.now() };
    return res.json(data);
  } catch (err: any) {
    console.error('[ocupacao-sheets]', err.message);
    if (cache) return res.json({ ...cache.data, stale: true });
    return res.status(500).json({ error: String(err) });
  }
}
