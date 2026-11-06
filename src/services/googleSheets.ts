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
  if (period === 'year') return new Date(new Date().getFullYear(), 0, 1);
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


// ── Revisão humana do NPS ────────────────────────────────────────────────────
export type ClasseNps = 'arretado' | 'oxente' | 'putz';
type Fixes = Record<string, { cls: ClasseNps; em: number }>;

const classePorNota = (n: number): ClasseNps => (n >= 4 ? 'arretado' : n === 3 ? 'oxente' : 'putz');

function fixIdOf(dateISO: string, score: number, text: string): string {
  return `${dateISO}|${score}|${text.slice(0, 50)}`;
}

async function fetchFixes(): Promise<Fixes> {
  try {
    const r = await fetch('/api/goals?type=npsfix', { cache: 'no-store' });
    const j = await r.json();
    return (j?.fixes ?? {}) as Fixes;
  } catch { return {}; }
}

export async function saveNpsFix(id: string, cls: ClasseNps | null): Promise<boolean> {
  try {
    const r = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'npsfix', id, cls }),
    });
    if (r.ok) clearSheetsCache();
    return r.ok;
  } catch { return false; }
}

// Triagem: 4–5★ cujo texto parece negativo vai para revisão humana
const SINAIS_NEGATIVOS = [
  'demor', 'ruim', 'pessim', 'horrivel', 'terrivel', 'decepc', 'nao gostei', 'nao recomend', 'nao voltaria', 'nao volto',
  'absurd', 'descaso', 'mal atendid', 'mau atendid', 'faltou', 'falta de', 'lento', 'sujo', 'suja', 'reclam', 'problema',
  'desorganiz', 'vergonha', 'pior', 'lament', 'insatisf', 'nao funcion', 'esperei', 'esperando', 'melhorar', 'deixou a desejar',
  'nao foi', 'caro demais', 'muito caro', 'fila', 'nao tinha', 'nao havia', 'sem educacao', 'grosseir', 'mal educad',
];
function pareceNegativo(text: string): boolean {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/nada (a|para|pra|de) reclamar|sem (nada a )?reclama\w*|nenhum problema|sem problema\w*/g, '');
  return SINAIS_NEGATIVOS.some(k => t.includes(k));
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
  const [rows, fixes] = await Promise.all([fetchAllRows(), fetchFixes()]);
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

  // Classe efetiva: correção humana (se houver) ou nota (4–5 Arretado, 3 Oxente, 1–2 Putz)
  const fixIdE = (e: Entry) => fixIdOf(e.date.toISOString().slice(0, 10), e.score, e.text);
  const classeE = (e: Entry): ClasseNps => fixes[fixIdE(e)]?.cls ?? classePorNota(e.score);
  const nP = entries.filter(e => classeE(e) === 'arretado').length;
  const nN = entries.filter(e => classeE(e) === 'oxente').length;
  const nD = entries.filter(e => classeE(e) === 'putz').length;
  const ajustadas = entries.filter(e => classeE(e) !== classePorNota(e.score)).length;

  const pctP = total > 0 ? Math.round((nP / total) * 100) : 0;
  const pctN = total > 0 ? Math.round((nN / total) * 100) : 0;
  const pctD = total > 0 ? Math.round((nD / total) * 100) : 0;
  const nps  = pctP - pctD;

  const avgScore = total > 0
    ? Math.round((entries.reduce((s, e) => s + e.score, 0) / total) * 10) / 10
    : 0;

  // Daily NPS history
  const byDay: Record<string, { p: number; d: number; t: number }> = {};
  for (const e of entries) {
    const day = e.date.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { p: 0, d: 0, t: 0 };
    byDay[day].t++;
    const c = classeE(e);
    if (c === 'arretado')   byDay[day].p++;
    else if (c === 'putz')  byDay[day].d++;
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
    fixId:     fixIdE(e),
    ...(fixes[fixIdE(e)] ? { classe: fixes[fixIdE(e)].cls } : {}),
  });

  // Fila de revisão: últimos 90 dias, 4–5★ com texto de aparência negativa, ainda sem revisão
  const corte = new Date(); corte.setDate(corte.getDate() - 90);
  const recentes = allEntries.filter(e => e.date >= corte && e.text.length > 3);
  const suspeitas = recentes
    .filter(e => e.score >= 4 && !fixes[fixIdE(e)] && pareceNegativo(e.text))
    .sort((a, b) => b.date.getTime() - a.date.getTime()).map(toResponse);
  const revisadas = recentes
    .filter(e => !!fixes[fixIdE(e)])
    .sort((a, b) => b.date.getTime() - a.date.getTime()).map(toResponse);

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
    avgScore,
    promoters:      pctP,
    neutrals:       pctN,
    detractors:     pctD,
    responseRate,
    totalResponses: totalAllTime,  // ← total em toda a planilha, independente do período
    npsHistory,
    ajustadas,
    suspeitas,
    revisadas,
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

// ── NPS por mês do ano (mesma regra: %notas 4–5 − %notas 1–2) ────────────────
export interface NpsMes { mes: number; total: number; nps: number | null; }

export async function fetchNpsMensal(year: number): Promise<NpsMes[]> {
  const [rows, fixes] = await Promise.all([fetchAllRows(), fetchFixes()]);
  const acc = Array.from({ length: 12 }, () => ({ t: 0, p: 0, d: 0 }));
  for (const row of rows) {
    const score = Number(cellVal(row, COL_RATING));
    if (!score || score < 1 || score > 5) continue;
    const date = parseGVizDate(cellVal(row, COL_DATE) as string);
    if (!date || date.getFullYear() !== year) continue;
    const a = acc[date.getMonth()];
    a.t++;
    const texto = String(cellVal(row, COL_FEEDBACK) ?? '').trim();
    const c = fixes[fixIdOf(date.toISOString().slice(0, 10), score, texto)]?.cls ?? classePorNota(score);
    if (c === 'arretado') a.p++;
    else if (c === 'putz') a.d++;
  }
  return acc.map((a, i) => ({
    mes: i, total: a.t,
    nps: a.t > 0 ? Math.round((a.p / a.t) * 100) - Math.round((a.d / a.t) * 100) : null,
  }));
}
