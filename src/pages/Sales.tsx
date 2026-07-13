import { useState, useMemo } from 'react';
import { TrendingUp, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { useDailyVendas } from '../hooks/useDailyVendas';
import { DailyVendasEntry } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────────
function todayBRT(): string {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-');
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

interface KpiCardProps { label: string; value: string; sub?: string; color?: string }
function KpiCard({ label, value, sub, color = 'text-gray-900 dark:text-white' }: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col gap-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`text-2xl font-black leading-tight ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

// ── Formulário ────────────────────────────────────────────────────────────────
function EntryForm({ initial, onSave, saving }: {
  initial: Partial<DailyVendasEntry>;
  onSave: (e: DailyVendasEntry) => void;
  saving: boolean;
}) {
  const [date,    setDate]    = useState(initial.date    ?? todayBRT());
  const [revenue, setRevenue] = useState(String(initial.revenue ?? ''));
  const [pax,     setPax]     = useState(String(initial.pax     ?? ''));
  const [orders,  setOrders]  = useState(String(initial.orders  ?? ''));
  const [notes,   setNotes]   = useState(initial.notes ?? '');

  const rev  = parseFloat(revenue.replace(',', '.')) || 0;
  const paxN = parseInt(pax)    || 0;
  const ordN = parseInt(orders) || 0;
  const ticket = ordN > 0 ? rev / ordN : 0;

  const valid = date && rev > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSave({ date, revenue: rev, pax: paxN, orders: ordN, notes: notes.trim() || undefined });
  }

  const inputCls = 'w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition';

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <TrendingUp size={14} className="text-brand-500" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Fechamento do Dia</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Data</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Receita (R$)</label>
          <input
            type="text" inputMode="decimal" placeholder="0,00"
            value={revenue} onChange={e => setRevenue(e.target.value)}
            className={inputCls} required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Nº Pax</label>
          <input type="number" min="0" placeholder="0" value={pax} onChange={e => setPax(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Reservas</label>
          <input type="number" min="0" placeholder="0" value={orders} onChange={e => setOrders(e.target.value)} className={inputCls} />
        </div>
      </div>

      {ticket > 0 && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Ticket médio calculado: <span className="font-bold text-gray-700 dark:text-gray-300">{fmtBRL(ticket)}</span>
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Observação (opcional)</label>
        <input
          type="text" placeholder="Ex.: evento especial, feriado..."
          value={notes} onChange={e => setNotes(e.target.value)}
          className={inputCls}
        />
      </div>

      <button
        type="submit"
        disabled={!valid || saving}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition disabled:opacity-40"
      >
        <Save size={14} />
        {saving ? 'Salvando...' : 'Salvar fechamento'}
      </button>
    </form>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export function Sales() {
  const { list, saveEntry, loading } = useDailyVendas();
  const [saving, setSaving]          = useState(false);
  const [saved,  setSaved]           = useState<string | null>(null);
  const [expanded, setExpanded]      = useState(false);

  // KPIs do mês atual
  const mesAtual = useMemo(() => {
    const now  = new Date();
    const mes  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const rows = list.filter(e => e.date.startsWith(mes));
    const receita = rows.reduce((s, e) => s + e.revenue, 0);
    const pax     = rows.reduce((s, e) => s + e.pax, 0);
    const orders  = rows.reduce((s, e) => s + e.orders, 0);
    const ticket  = orders > 0 ? receita / orders : 0;
    return { receita, pax, orders, ticket, dias: rows.length };
  }, [list]);

  async function handleSave(entry: DailyVendasEntry) {
    setSaving(true);
    await saveEntry(entry);
    setSaving(false);
    setSaved(entry.date);
    setTimeout(() => setSaved(null), 3000);
  }

  const today     = todayBRT();
  const todayData = list.find(e => e.date === today);
  const displayed = expanded ? list : list.slice(0, 15);

  return (
    <div className="p-3 lg:p-5 max-w-3xl mx-auto flex flex-col gap-4">
      {/* Banner em desenvolvimento */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <span className="text-base shrink-0">🚧</span>
        <div>
          <p className="font-semibold leading-tight">Módulo em desenvolvimento</p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Os dados aqui são inseridos manualmente. Em breve teremos integração automática com o sistema de vendas.</p>
        </div>
      </div>

      {/* KPIs mês atual */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
          Resumo do Mês Atual · {mesAtual.dias} {mesAtual.dias === 1 ? 'dia' : 'dias'} registrados
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <KpiCard label="Receita do Mês"  value={fmtBRL(mesAtual.receita)} color="text-green-600 dark:text-green-400" />
          <KpiCard label="Total de Pax"    value={mesAtual.pax.toLocaleString('pt-BR')} sub="pessoas" />
          <KpiCard label="Reservas"        value={mesAtual.orders.toLocaleString('pt-BR')} sub="pedidos" />
          <KpiCard label="Ticket Médio"    value={mesAtual.ticket > 0 ? fmtBRL(mesAtual.ticket) : '—'} color="text-brand-600 dark:text-brand-400" />
        </div>
      </div>

      {/* Formulário */}
      {saved && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-2 text-sm text-green-700 dark:text-green-400 font-medium text-center">
          ✓ Fechamento de {fmtDate(saved)} salvo com sucesso
        </div>
      )}
      <EntryForm initial={todayData ?? {}} onSave={handleSave} saving={saving} />

      {/* Histórico */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Histórico dos Últimos 60 Dias</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400 animate-pulse">Carregando...</p>
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400">Nenhum registro ainda. Preencha o formulário acima.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Receita</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pax</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reservas</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticket</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((e, i) => {
                    const isToday  = e.date === today;
                    const ticket   = e.orders > 0 ? e.revenue / e.orders : 0;
                    return (
                      <tr
                        key={e.date}
                        className={`border-t border-gray-100 dark:border-gray-700 ${
                          isToday
                            ? 'bg-brand-50 dark:bg-brand-900/20'
                            : i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-700/20'
                        }`}
                      >
                        <td className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {fmtDate(e.date)}
                          {isToday && <span className="ml-1 text-[9px] bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-300 px-1.5 py-0.5 rounded-full font-bold">hoje</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-green-700 dark:text-green-400 whitespace-nowrap">{fmtBRL(e.revenue)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{e.pax || '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{e.orders || '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{ticket > 0 ? fmtBRL(ticket) : '—'}</td>
                        <td className="px-3 py-2 text-gray-400 dark:text-gray-500 hidden lg:table-cell max-w-[180px] truncate">{e.notes ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {list.length > 15 && (
              <button
                onClick={() => setExpanded(x => !x)}
                className="w-full py-2.5 flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-t border-gray-100 dark:border-gray-700 transition-colors"
              >
                {expanded ? <><ChevronUp size={13} /> Mostrar menos</> : <><ChevronDown size={13} /> Ver todos ({list.length})</>}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
