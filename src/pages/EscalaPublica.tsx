import { useState, useEffect, useMemo } from 'react';

interface EscalaRow  { num: number; nome: string; funcao: string; dias: string[]; }
interface EscalaSheet { setor: string; dias: string[]; rows: EscalaRow[]; }
interface Escala     { id: string; mes: string; token: string; uploadedAt: string; sheets: EscalaSheet[]; }

const STATUS: Record<string, { bg: string; text: string; label: string; ring: string }> = {
  T:  { bg: 'bg-emerald-500', text: 'text-white',        label: 'Trabalha', ring: 'ring-emerald-400' },
  X:  { bg: 'bg-red-400',     text: 'text-white',        label: 'Folga',    ring: 'ring-red-400'     },
  C:  { bg: 'bg-amber-400',   text: 'text-white',        label: 'Compensa', ring: 'ring-amber-400'   },
  CA: { bg: 'bg-amber-400',   text: 'text-white',        label: 'Compensa', ring: 'ring-amber-400'   },
  F:  { bg: 'bg-blue-400',    text: 'text-white',        label: 'Férias',   ring: 'ring-blue-400'    },
  A:  { bg: 'bg-orange-400',  text: 'text-white',        label: 'Atestado', ring: 'ring-orange-400'  },
  M:  { bg: 'bg-purple-400',  text: 'text-white',        label: 'Manhã',    ring: 'ring-purple-400'  },
  '': { bg: 'bg-gray-100',    text: 'text-gray-300',     label: '',         ring: ''                  },
};

function cellInfo(v: string) {
  const key = v.toUpperCase();
  // célula vazia = Trabalha
  const resolved = key || 'T';
  return STATUS[resolved] ?? STATUS[key.slice(0, 1)] ?? { bg: 'bg-gray-100', text: 'text-gray-500', label: v, ring: '' };
}

function TabelaSetor({
  sheet,
  filtroNome,
  filtroStatus,
}: {
  sheet: EscalaSheet;
  filtroNome: string;
  filtroStatus: string[];
}) {
  const rows = useMemo(() => {
    let r = sheet.rows;
    if (filtroNome.trim()) {
      const q = filtroNome.toLowerCase();
      r = r.filter(row => row.nome.toLowerCase().includes(q) || row.funcao.toLowerCase().includes(q));
    }
    if (filtroStatus.length > 0) {
      r = r.filter(row => {
        return filtroStatus.some(st => {
          if (st === 'T') return row.dias.some(d => d === '');
          return row.dias.some(d => d.toUpperCase().startsWith(st));
        });
      });
    }
    return r;
  }, [sheet, filtroNome, filtroStatus]);

  if (rows.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-8">Nenhum colaborador encontrado.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm -mx-4 md:mx-0">
      <table className="border-collapse text-[11px] min-w-max w-full">
        <thead>
          <tr className="bg-gray-900 text-white">
            <th className="sticky left-0 z-10 bg-gray-900 px-2 py-2.5 text-center font-semibold w-7">#</th>
            <th className="sticky left-7 z-10 bg-gray-900 px-3 py-2.5 text-left font-semibold min-w-[130px] border-r border-gray-700">Colaborador</th>
            <th className="hidden sm:table-cell px-2 py-2.5 text-left font-semibold min-w-[100px] border-r border-gray-700 text-gray-300">Função</th>
            {sheet.dias.map(d => (
              <th key={d} className="px-0 py-2.5 text-center font-semibold w-7 text-gray-300">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="sticky left-0 z-10 bg-inherit px-2 py-1.5 text-gray-400 text-center text-[10px]">{row.num}</td>
              <td className="sticky left-7 z-10 bg-inherit px-3 py-1.5 font-semibold text-gray-800 border-r border-gray-100 whitespace-nowrap">
                {row.nome}
                <span className="sm:hidden block text-[10px] font-normal text-gray-400">{row.funcao}</span>
              </td>
              <td className="hidden sm:table-cell px-2 py-1.5 text-gray-500 border-r border-gray-100 whitespace-nowrap">{row.funcao}</td>
              {row.dias.map((d, di) => {
                const info = cellInfo(d);
                const label = d || 'T';
                return (
                  <td key={di} className={`py-1.5 text-center font-bold w-7 ${info.bg} ${info.text}`}>
                    {label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EscalaPublica() {
  const [escala, setEscala]     = useState<Escala | null>(null);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState('');
  const [setorIdx, setSetorIdx] = useState(0);
  const [filtroNome, setFiltroNome]     = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string[]>([]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('t');
    if (!token) { setErro('Link inválido — token não encontrado.'); setLoading(false); return; }
    fetch(`/api/goals?type=escala&token=${encodeURIComponent(token)}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => { setEscala(d.escala ?? null); setLoading(false); })
      .catch(() => { setErro('Escala não encontrada ou link expirado.'); setLoading(false); });
  }, []);

  const toggleStatus = (s: string) => {
    setFiltroStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Carregando escala…</p>
      </div>
    );
  }

  if (erro || !escala) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-gray-600 font-medium">{erro || 'Escala não disponível.'}</p>
          <p className="text-gray-400 text-sm mt-1">Solicite um novo link ao setor de RH.</p>
        </div>
      </div>
    );
  }

  const sheet = escala.sheets[setorIdx];

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-4 shadow-lg">
        <p className="text-[10px] tracking-[0.25em] text-gray-400 uppercase mb-0.5">Hibiscus Beach Club</p>
        <h1 className="text-xl font-bold leading-tight">Escalas de Trabalho</h1>
        <p className="text-sm text-gray-300 mt-0.5">{escala.mes}</p>
      </div>

      {/* Abas de setor — scroll horizontal no mobile */}
      {escala.sheets.length > 1 && (
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="overflow-x-auto">
            <div className="flex gap-0 px-2 min-w-max md:min-w-0">
              {escala.sheets.map((s, i) => (
                <button
                  key={s.setor}
                  onClick={() => { setSetorIdx(i); setFiltroNome(''); setFiltroStatus([]); }}
                  className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                    setorIdx === i
                      ? 'text-gray-900 border-gray-900 bg-gray-50'
                      : 'text-gray-400 border-transparent hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {s.setor}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legenda de status */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-1.5">
          {(['T', 'X', 'C', 'F', 'A'] as const).map(k => {
            const s = STATUS[k];
            return (
              <span key={k} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
                {k} = {s.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Destaque do setor + filtros */}
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-2">
        {/* Banner do setor */}
        <div className="bg-gray-900 text-white rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold tracking-wide">{sheet.setor}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{sheet.rows.length} colaboradores · {sheet.dias.length} dias</p>
          </div>
          <span className="text-2xl opacity-20 font-black">{setorIdx + 1}/{escala.sheets.length}</span>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          {/* Busca por nome */}
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar colaborador..."
              value={filtroNome}
              onChange={e => setFiltroNome(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Filtro de status */}
          <div className="flex gap-1.5 flex-wrap">
            {(['T', 'X', 'C', 'F', 'A'] as const).map(k => {
              const s = STATUS[k];
              const ativo = filtroStatus.includes(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleStatus(k)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border-2 ${
                    ativo
                      ? `${s.bg} ${s.text} border-transparent shadow-sm`
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {k}
                </button>
              );
            })}
            {filtroStatus.length > 0 && (
              <button onClick={() => setFiltroStatus([])} className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-500 border-2 border-transparent">
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="max-w-5xl mx-auto px-4">
        <TabelaSetor sheet={sheet} filtroNome={filtroNome} filtroStatus={filtroStatus} />
      </div>

      <p className="text-center text-[10px] text-gray-300 mt-8">Desenvolvido por H8 Sistemas · Acesso restrito · Sujeito a alterações</p>
    </div>
  );
}
