import { useState, useEffect } from 'react';

interface EscalaRow  { num: number; nome: string; funcao: string; dias: string[]; }
interface EscalaSheet { setor: string; dias: string[]; rows: EscalaRow[]; }
interface Escala     { id: string; mes: string; token: string; uploadedAt: string; sheets: EscalaSheet[]; }

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  T:  { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Trabalha' },
  X:  { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Folga'    },
  C:  { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Compensa' },
  CA: { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Compensa' },
  F:  { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Férias'   },
  A:  { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'Atestado' },
  '': { bg: 'bg-gray-50',     text: 'text-gray-300',    label: ''         },
};

function cellStyle(v: string) {
  return STATUS_STYLE[v.toUpperCase()] ?? { bg: 'bg-gray-50', text: 'text-gray-500', label: v };
}

function TabelaSetor({ sheet }: { sheet: EscalaSheet }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="border-collapse text-[11px] min-w-max">
        <thead>
          <tr className="bg-gray-800 text-white">
            <th className="sticky left-0 z-10 bg-gray-800 px-2 py-2 text-left font-semibold min-w-[28px]">#</th>
            <th className="sticky left-7 z-10 bg-gray-800 px-3 py-2 text-left font-semibold min-w-[160px] border-r border-gray-700">Colaborador</th>
            <th className="px-2 py-2 text-left font-semibold min-w-[110px] border-r border-gray-700">Função</th>
            {sheet.dias.map(d => (
              <th key={d} className="px-0 py-2 text-center font-semibold w-8">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="sticky left-0 z-10 bg-inherit px-2 py-1.5 text-gray-400 text-center font-medium">{row.num}</td>
              <td className="sticky left-7 z-10 bg-inherit px-3 py-1.5 font-semibold text-gray-800 border-r border-gray-100 whitespace-nowrap">{row.nome}</td>
              <td className="px-2 py-1.5 text-gray-500 border-r border-gray-100 whitespace-nowrap">{row.funcao}</td>
              {row.dias.map((d, di) => {
                const s = cellStyle(d);
                return (
                  <td key={di} className={`py-1.5 text-center font-bold w-8 ${s.bg} ${s.text}`}>
                    {d || '·'}
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
  const [escala, setEscala]   = useState<Escala | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState('');
  const [setor, setSetor]     = useState(0);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('t');
    if (!token) { setErro('Link inválido — token não encontrado.'); setLoading(false); return; }

    fetch(`/api/goals?type=escala&token=${encodeURIComponent(token)}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => { setEscala(d.escala ?? null); setLoading(false); })
      .catch(() => { setErro('Escala não encontrada ou link expirado.'); setLoading(false); });
  }, []);

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

  const sheet = escala.sheets[setor];

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.3em] text-gray-400 uppercase">Hibiscus Beach Club</p>
          <h1 className="text-lg font-bold mt-0.5">Escalas de Trabalho</h1>
          <p className="text-sm text-gray-300">{escala.mes}</p>
        </div>
      </div>

      {/* Legenda */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-3">
          {Object.entries({ T: 'Trabalha', X: 'Folga', C: 'Compensa', F: 'Férias', A: 'Atestado' }).map(([k, v]) => {
            const s = cellStyle(k);
            return (
              <span key={k} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>
                {k} = {v}
              </span>
            );
          })}
        </div>
      </div>

      {/* Abas setores */}
      {escala.sheets.length > 1 && (
        <div className="bg-white border-b border-gray-100 overflow-x-auto">
          <div className="max-w-5xl mx-auto flex gap-0 px-2">
            {escala.sheets.map((s, i) => (
              <button
                key={s.setor}
                onClick={() => setSetor(i)}
                className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  setor === i
                    ? 'text-gray-900 border-gray-900'
                    : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                {s.setor}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800">{sheet.setor}</h2>
            <p className="text-[11px] text-gray-400">{sheet.rows.length} colaboradores · {sheet.dias.length} dias</p>
          </div>
          <p className="text-[10px] text-gray-300">* Sujeito a alterações</p>
        </div>

        <TabelaSetor sheet={sheet} />
      </div>

      <div className="text-center py-8">
        <p className="text-[10px] text-gray-300">Desenvolvido por H8 Sistemas · Acesso restrito</p>
      </div>
    </div>
  );
}
