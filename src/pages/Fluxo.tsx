import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Users, TrendingUp, Building2, Umbrella, Sofa } from 'lucide-react';

interface FluxoRow {
  date:       string;
  portaria:   number;
  beach:      number;
  lounge:     number;
  condominio: number;
  total:      number;
  gap:        number;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-');
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${Number(d)} ${months[Number(m) - 1]}`;
}

function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(0)} Mil`;
  return String(n);
}

const PRESETS = [
  { label: 'Hoje',   de: () => todayStr(), ate: () => todayStr() },
  { label: '7 dias', de: () => daysAgo(6), ate: () => todayStr() },
  { label: '30 dias',de: () => daysAgo(29), ate: () => todayStr() },
  { label: 'Mês',    de: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }, ate: () => todayStr() },
  { label: 'Ano',    de: () => `${new Date().getFullYear()}-01-01`, ate: () => todayStr() },
];

async function fetchFluxo(de: string, ate: string): Promise<FluxoRow[]> {
  const r = await fetch(`/api/fluxo?de=${de}&ate=${ate}`);
  const j = await r.json() as any;
  return j.rows ?? [];
}

// ── Card de total ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{fmtNum(value)}</p>
      </div>
    </div>
  );
}

// ── Tooltip customizado ───────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export function Fluxo() {
  const [de,      setDe]      = useState(daysAgo(29));
  const [ate,     setAte]     = useState(todayStr());
  const [rows,    setRows]    = useState<FluxoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [preset,  setPreset]  = useState(2); // "30 dias"

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFluxo(de, ate)
      .then(r => { if (!cancelled) { setRows(r); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [de, ate]);

  const totals = useMemo(() => ({
    portaria:   rows.reduce((s, r) => s + r.portaria,   0),
    beach:      rows.reduce((s, r) => s + r.beach,      0),
    lounge:     rows.reduce((s, r) => s + r.lounge,     0),
    condominio: rows.reduce((s, r) => s + r.condominio, 0),
    total:      rows.reduce((s, r) => s + r.total,      0),
    gap:        rows.reduce((s, r) => s + r.gap,        0),
  }), [rows]);

  const chartData = useMemo(() =>
    rows.map(r => ({ ...r, label: fmtDate(r.date) })),
  [rows]);

  function applyPreset(i: number) {
    setPreset(i);
    setDe(PRESETS[i].de());
    setAte(PRESETS[i].ate());
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">

      {/* Título */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Análise do Fluxo de Clientes</h1>
        <p className="text-xs text-gray-400 mt-0.5">Histórico via planilha de ocupação</p>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider">De</label>
          <input
            type="date"
            value={de}
            max={ate}
            onChange={e => { setDe(e.target.value); setPreset(-1); }}
            className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider">Até</label>
          <input
            type="date"
            value={ate}
            min={de}
            max={todayStr()}
            onChange={e => { setAte(e.target.value); setPreset(-1); }}
            className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => applyPreset(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                preset === i
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-600 dark:text-red-400">
          Erro ao carregar dados: {error}
        </div>
      )}

      {/* Cards de totais */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 h-20 animate-pulse border border-gray-100 dark:border-gray-700" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users}     label="Portaria"    value={totals.portaria}   color="bg-slate-500" />
          <StatCard icon={Umbrella}  label="Beach"       value={totals.beach}      color="bg-sky-500" />
          <StatCard icon={Sofa}      label="Lounge"      value={totals.lounge}     color="bg-purple-500" />
          <StatCard icon={Building2} label="Condomínio"  value={totals.condominio} color="bg-teal-500" />
        </div>
      )}

      {/* Gráfico */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Total por Data</h2>
        {loading ? (
          <div className="h-52 w-full bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">Nenhum dado para o período selecionado</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
              />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="#7c3aed"
                strokeWidth={2}
                fill="url(#gradTotal)"
                dot={chartData.length <= 14 ? { r: 3, fill: '#7c3aed' } : false}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Total de Entradas + GAP */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Total de Entradas</p>
            <p className="text-4xl font-black text-gray-900 dark:text-white">{fmtNum(totals.total)}</p>
          </div>
          <div className={`rounded-2xl p-5 shadow-sm border text-center ${
            totals.gap >= 0
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">GAP</p>
            <p className={`text-4xl font-black ${totals.gap >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {totals.gap >= 0 ? '+' : ''}{fmtNum(totals.gap)}
            </p>
          </div>
        </div>
      )}

      {/* Tabela resumo por dia (visível quando <= 30 dias) */}
      {!loading && rows.length > 0 && rows.length <= 31 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Detalhe por dia</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left font-semibold">Data</th>
                  <th className="px-3 py-2 text-right font-semibold">Portaria</th>
                  <th className="px-3 py-2 text-right font-semibold">Beach</th>
                  <th className="px-3 py-2 text-right font-semibold">Lounge</th>
                  <th className="px-3 py-2 text-right font-semibold">Cond.</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                  <th className="px-3 py-2 text-right font-semibold">GAP</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r, i) => (
                  <tr key={r.date} className={`border-t border-gray-50 dark:border-gray-700 ${i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-700/20'}`}>
                    <td className="px-4 py-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 font-semibold">{r.portaria}</td>
                    <td className="px-3 py-2 text-right text-sky-600 dark:text-sky-400">{r.beach}</td>
                    <td className="px-3 py-2 text-right text-purple-600 dark:text-purple-400">{r.lounge}</td>
                    <td className="px-3 py-2 text-right text-teal-600 dark:text-teal-400">{r.condominio}</td>
                    <td className="px-3 py-2 text-right text-gray-800 dark:text-gray-200 font-bold">{r.total}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${r.gap >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{r.gap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
