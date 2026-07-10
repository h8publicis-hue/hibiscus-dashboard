import { useState, useMemo } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { useChamadas, Chamada, parseTempoSec } from '../hooks/useChamadas';
import clsx from 'clsx';

function todayBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function tempoColor(tempo: string): string {
  const s = parseTempoSec(tempo);
  if (!tempo || s === 0) return '';
  if (s <= 30) return 'bg-green-500 text-white';
  if (s <= 59) return 'bg-yellow-500 text-white';
  return 'bg-red-500 text-white';
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

const PAGE_SIZES = [10, 25, 50, 100];

export function Chamadas() {
  const today = todayBRT();
  const [startDate, setStartDate] = useState(today);
  const [endDate,   setEndDate]   = useState(today);
  const [applied, setApplied]     = useState({ start: today, end: today });

  const { chamadas, loading, error, refresh } = useChamadas(applied.start, applied.end);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterGarcom, setFilterGarcom] = useState('');
  const [filterTipo,   setFilterTipo]   = useState('');
  const [filterSetor,  setFilterSetor]  = useState('');
  const [pageSize, setPageSize]         = useState(10);
  const [page, setPage]                 = useState(1);
  const [sortBy, setSortBy]             = useState<'data_hora' | 'tempoEspera' | 'mesa'>('data_hora');
  const [sortDir, setSortDir]           = useState<'desc' | 'asc'>('desc');

  // opções únicas para selects
  const garcons = useMemo(() => [...new Set(chamadas.map(c => c.garcom).filter(Boolean))].sort(), [chamadas]);
  const setores = useMemo(() => [...new Set(chamadas.map(c => c.setor).filter(Boolean))].sort(), [chamadas]);

  const filtered = useMemo(() => {
    let r = chamadas;
    if (filterStatus) r = r.filter(c => c.status === filterStatus);
    if (filterGarcom) r = r.filter(c => c.garcom === filterGarcom);
    if (filterTipo)   r = r.filter(c => c.tipo.toLowerCase().includes(filterTipo.toLowerCase()));
    if (filterSetor)  r = r.filter(c => c.setor === filterSetor);
    return [...r].sort((a, b) => {
      let va: any, vb: any;
      if (sortBy === 'tempoEspera') { va = parseTempoSec(a.tempoEspera); vb = parseTempoSec(b.tempoEspera); }
      else if (sortBy === 'mesa')   { va = a.mesa ?? 0; vb = b.mesa ?? 0; }
      else                           { va = a.data_hora; vb = b.data_hora; }
      return sortDir === 'desc' ? (va < vb ? 1 : -1) : (va > vb ? 1 : -1);
    });
  }, [chamadas, filterStatus, filterGarcom, filterTipo, filterSetor, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  function applyDates() {
    setApplied({ start: startDate, end: endDate });
    setPage(1);
  }

  function exportCSV() {
    const header = ['Mesa','Pulseira','Status','Garçom','Tipo','Setor','Tempo Espera','Tempo Atendimento','Data e Hora'];
    const rows = filtered.map(c => [
      c.mesa ?? '', c.pulseira || 'N/A', c.status, c.garcom || 'N/A',
      c.tipo, c.setor, c.tempoEspera || '—', c.tempoAtendimento || '—', c.data_hora,
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `chamadas-${applied.start}.csv`;
    a.click();
  }

  return (
    <div className="p-4 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-800 dark:text-gray-100">Detalhes de Chamadas</h1>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
            <Download size={13} />
            Exportar CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-xs text-red-700 dark:text-red-400">
          Erro ao carregar: {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Filtros</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Status</label>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              <option value="">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="em andamento">Em andamento</option>
              <option value="finalizado">Finalizado</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Garçom</label>
            <select value={filterGarcom} onChange={e => { setFilterGarcom(e.target.value); setPage(1); }}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              <option value="">Todos</option>
              {garcons.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Tipo</label>
            <select value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setPage(1); }}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              <option value="">Todos</option>
              <option value="chamada">Chamada</option>
              <option value="fechamento">Fechamento de Conta</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Setor</label>
            <select value={filterSetor} onChange={e => { setFilterSetor(e.target.value); setPage(1); }}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              <option value="">Todos</option>
              {setores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Data Início</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Data Fim</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Linhas por página</label>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n} Linhas</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Ordenar por</label>
            <select value={`${sortBy}-${sortDir}`} onChange={e => { const [b, d] = e.target.value.split('-'); setSortBy(b as any); setSortDir(d as any); setPage(1); }}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              <option value="data_hora-desc">Data (Mais recentes)</option>
              <option value="data_hora-asc">Data (Mais antigas)</option>
              <option value="tempoEspera-desc">Maior espera</option>
              <option value="mesa-asc">Mesa</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button onClick={applyDates} className="bg-brand-600 hover:bg-brand-700 text-white text-xs px-4 py-1.5 rounded-lg transition-colors">
            Aplicar período
          </button>
          <span className="text-[11px] text-gray-400">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Legenda — Tempo de Espera:</span>
        <span className="text-[11px] bg-green-500 text-white px-2 py-0.5 rounded-full">Até 30s (Rápido)</span>
        <span className="text-[11px] bg-yellow-500 text-white px-2 py-0.5 rounded-full">31s a 59s (Médio)</span>
        <span className="text-[11px] bg-red-500 text-white px-2 py-0.5 rounded-full">60s ou mais (Demorado)</span>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-800 dark:bg-gray-900 text-white">
                {['Mesa','Pulseira','Status','Garçom','Tipo','Setor','Avaliação','Tempo Espera','Tempo Atend.','Data e Hora'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              )}
              {!loading && paginated.length === 0 && (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">Nenhuma chamada encontrada</td></tr>
              )}
              {paginated.map((c, i) => (
                <tr key={c.id} className={clsx('border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50', i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/50')}>
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{c.mesa ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.pulseira || 'N/A'}</td>
                  <td className="px-3 py-2">
                    <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium',
                      c.status === 'finalizado'    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      c.status === 'em andamento'  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    )}>
                      {capitalize(c.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{c.garcom || 'N/A'}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{capitalize(c.tipo)}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.setor || '—'}</td>
                  <td className="px-3 py-2 text-gray-400">Sem avaliação</td>
                  <td className="px-3 py-2">
                    {c.tempoEspera
                      ? <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium', tempoColor(c.tempoEspera))}>{c.tempoEspera}</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.tempoAtendimento || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-500 whitespace-nowrap">{c.data_hora}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2.5 flex items-center justify-between">
            <span className="text-[11px] text-gray-400">
              Página {page} de {totalPages} · {filtered.length} registros
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
                ‹ Anterior
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
                Próxima ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
