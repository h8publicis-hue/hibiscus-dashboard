import { SurveyMonkeyData } from '../types';

// ── Config ────────────────────────────────────────────────────────────────────
const SHEET_ID = '160RcNG4v6TrdkV2Sc1T__kWt_N7rdI1daNY6lqNJSb4';
// JSON is more robust than CSV — handles multi-line text fields, special chars
const JSON_URL = `/sheets-api/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1`;

// Column indices (0-based) in the sheet
const COL_DATE      = 4;  // Start Date
const COL_EMAIL     = 8;  // Email Address (SurveyMonkey metadata)
const COL_FIRSTNAME = 9;  // First Name
const COL_LASTNAME  = 10; // Last Name
const COL_PULSEIRA  = 11; // Q1 — número da pulseira
const COL_FEEDBACK  = 12; // Q2 — open text
const COL_RATING    = 13; // Q3 — score 1–5

// ── gviz/tq JSON parser ───────────────────────────────────────────────────────
interface GVizCell { v: string | number | null; f?: string }
interface GVizRow  { c: (GVizCell | null)[] }

function cellVal(row: GVizRow, idx: number): string | number | null {
  return row.c[idx]?.v ?? null;
}

// Google Visualization dates can arrive in two formats depending on column type:
//   1) gviz datetime: "Date(year,month0,day,h,m,s)"  — month is 0-indexed
//   2) plain string:  "2026-04-01T14:11:19" or "2026-04-01 14:11:19"  (SurveyMonkey export)
function parseGVizDate(v: string | number | null): Date | null {
  if (v == null) return null;

  if (typeof v === 'string') {
    // Format 1: Date(2026,3,1,14,11,19)
    if (v.startsWith('Date(')) {
      const m = v.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
      if (m) {
        const d = new Date(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    }
    // Format 2: ISO-like string (with space or T separator)
    const d = new Date(v.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  // Numeric timestamp (ms)
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function periodStart(period: string): Date {
  if (period === 'today') return startOfToday();
  if (period === '7d')  { const s = startOfToday(); s.setDate(s.getDate() - 6);  return s; }
  if (period === '30d') { const s = startOfToday(); s.setDate(s.getDate() - 29); return s; }
  if (period === '90d') { const s = startOfToday(); s.setDate(s.getDate() - 89); return s; }
  if (period === 'month') {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  }
  if (period.startsWith('custom:')) {
    const from = period.split(':')[1];
    if (from) return new Date(from + 'T00:00:00');
  }
  // fallback: current month
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

function periodEnd(period: string): Date | null {
  if (period.startsWith('custom:')) {
    const to = period.split(':')[2];
    if (to) return new Date(to + 'T23:59:59');
  }
  return null; // null = up to now
}

// ── Score helpers ─────────────────────────────────────────────────────────────
type Sentiment = 'positive' | 'neutral' | 'negative';

function toSentiment(score: number): Sentiment {
  if (score >= 4) return 'positive';
  if (score === 3) return 'neutral';
  return 'negative';
}

// ── Cache (5 min) + in-flight dedup ──────────────────────────────────────────
let rowCache: { rows: GVizRow[]; fetchedAt: number } | null = null;
let rowInflight: Promise<GVizRow[]> | null = null;

// In-flight dedup per period (prevents double-fetch on React StrictMode)
const periodInflight = new Map<string, Promise<SurveyMonkeyData>>();
const periodCache    = new Map<string, { data: SurveyMonkeyData; ts: number }>();

export function clearSheetsCache() {
  rowCache = null;
  rowInflight = null;
  periodCache.clear();
  periodInflight.clear();
}

const CACHE_TTL = 30 * 60 * 1000;  // 30 min

async function fetchAllRows(): Promise<GVizRow[]> {
  if (rowCache && Date.now() - rowCache.fetchedAt < CACHE_TTL) return rowCache.rows;
  if (rowInflight) return rowInflight;

  rowInflight = (async () => {
    const res = await fetch(JSON_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Google Sheets error: HTTP ${res.status}`);
    const text  = await res.text();
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Invalid Google Sheets response');
    const json  = JSON.parse(text.slice(start, end + 1)) as { table: { rows: GVizRow[] } };
    const rows  = json.table.rows ?? [];
    rowCache    = { rows, fetchedAt: Date.now() };
    return rows;
  })().finally(() => { rowInflight = null; });

  return rowInflight;
}

// ── Main export (with period-level cache + in-flight dedup) ──────────────────
export async function fetchSatisfactionData(period: string): Promise<SurveyMonkeyData> {
  const cached = periodCache.get(period);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  const existing = periodInflight.get(period);
  if (existing) return existing;

  const promise = _fetchSatisfactionData(period)
    .then((data) => { periodCache.set(period, { data, ts: Date.now() }); return data; })
    .finally(() => periodInflight.delete(period));
  periodInflight.set(period, promise);
  return promise;
}

async function _fetchSatisfactionData(period: string): Promise<SurveyMonkeyData> {
  const rows  = await fetchAllRows();
  const since = periodStart(period);
  const until = periodEnd(period);

  interface Entry {
    rowIndex: number;
    date:     Date;
    text:     string;
    score:    number;
    pulseira: string;
    nome:     string;
    email:    string;
  }

  // Parse every row — keep only those with a valid 1–5 rating
  const allEntries: Entry[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const row   = rows[ri];
    const score = Number(cellVal(row, COL_RATING));
    if (!score || score < 1 || score > 5) continue;

    const rawDate = cellVal(row, COL_DATE);
    const date    = parseGVizDate(rawDate as string);
    if (!date) continue;

    const text      = String(cellVal(row, COL_FEEDBACK)  ?? '').trim();
    const pulseira  = String(cellVal(row, COL_PULSEIRA)  ?? '').trim();
    const firstName = String(cellVal(row, COL_FIRSTNAME) ?? '').trim();
    const lastName  = String(cellVal(row, COL_LASTNAME)  ?? '').trim();
    const nome      = [firstName, lastName].filter(Boolean).join(' ');
    const email     = String(cellVal(row, COL_EMAIL)     ?? '').trim();

    allEntries.push({ rowIndex: ri + 1, date, text, score, pulseira, nome, email });
  }

  // Total across ALL time (what you see in the sheet total)
  const totalAllTime = allEntries.length;

  // Filter to selected period
  const entries = allEntries.filter(e =>
    e.date >= since && (!until || e.date <= until),
  );

  const total = entries.length;

  // Promoters = 5, Neutrals = 4, Detractors = 1–3
  const nP = entries.filter(e => e.score >= 4).length;
  const nN = entries.filter(e => e.score === 3).length;
  const nD = entries.filter(e => e.score <= 2).length;

  const pctP = total > 0 ? Math.round((nP / total) * 100) : 0;
  const pctN = total > 0 ? Math.round((nN / total) * 100) : 0;
  const pctD = total > 0 ? Math.round((nD / total) * 100) : 0;
  const nps  = pctP - pctD;

  // Daily NPS history
  const byDay: Record<string, { p: number; d: number; t: number }> = {};
  for (const e of entries) {
    const day = e.date.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { p: 0, d: 0, t: 0 };
    byDay[day].t++;
    if (e.score >= 4)      byDay[day].p++;
    else if (e.score <= 2) byDay[day].d++;
  }

  const npsHistory = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      month: date.slice(5),
      score: v.t > 0 ? Math.round((v.p / v.t - v.d / v.t) * 100) : 0,
    }));

  const toResponse = (e: Entry, i: number) => ({
    id:        String(i + 1),
    rowIndex:  e.rowIndex,
    text:      e.text,
    sentiment: toSentiment(e.score),
    date:      e.date.toISOString().slice(0, 10),
    score:     e.score,
    pulseira:  e.pulseira || undefined,
    nome:      e.nome     || undefined,
    email:     e.email    || undefined,
  });

  // Responses with text, newest first — filtered to selected period
  const recentResponses = [...entries]
    .filter(e => e.text.length > 3)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(toResponse);

  // All-time responses — used when sector filter is active (ignores period)
  const allTimeResponses = [...allEntries]
    .filter(e => e.text.length > 3)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(toResponse);

  const responseRate = total > 0
    ? Math.round((entries.filter(e => e.text.length > 0).length / total) * 100)
    : 0;

  return {
    npsScore:       nps,
    promoters:      pctP,
    neutrals:       pctN,
    detractors:     pctD,
    responseRate,
    totalResponses: totalAllTime,  // ← total em toda a planilha, independente do período
    npsHistory,
    recentResponses,
    allTimeResponses,
    surveys: [
      {
        name:      'Pesquisa de Satisfação — Hibiscus',
        responses: total,           // ← total no período selecionado
        rate:      responseRate,
      },
    ],
  };
}
