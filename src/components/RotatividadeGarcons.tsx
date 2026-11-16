import { useEffect, useMemo, useState } from 'react';
import type { ValidacaoGarcom } from '../types';

interface DiaValidado { data: string; garcons: ValidacaoGarcom[]; }

// Colunas iguais às da folha de papel; "Piscina" (legado) só aparece se houver registros
const COLUNAS = [
  { key: 'deck',        label: 'Deck',        cor: '#8b5cf6' },
  { key: 'salao',       label: 'Salão',       cor: '#3b82f6' },
  { key: 'pe-na-areia', label: 'Pé na Areia', cor: '#f59e0b' },
  { key: 'hidro',       label: 'Hidro',       cor: '#06b6d4' },
  { key: 'tenda',       label: 'Tenda',       cor: '#10b981' },
  { key: 'lounge',      label: 'Lounge',      cor: '#ec4899' },
  { key: 'piscina',     label: 'Piscina',     cor: '#64748b' },
] as const;

const LIMITE_KEY = 'hibiscus-rotatividade-limite';

function areaKey(g: ValidacaoGarcom): string {
  return g.area === 'lounge' ? 'lounge' : (g.setor ?? 'salao');
}
function mesBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' }).slice(0, 7);
}
function mudaMes(mes: string, d: number) {
  const [a, m] = mes.split('-').map(Number);
  const dt = new Date(a, m - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
function rotuloMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function RotatividadeGarcons() {
  const [mes, setMes] = useState(mesBRT());
  const [dias, setDias] = useState<DiaValidado[] | null>(null);
  const [erro, setErro] = useState(false);
  const [limite, setLimite] = useState<number>(() => {
    try { return Number(localStorage.getItem(LIMITE_KEY)) || 3; } catch { return 3; }
  });

  useEffect(() => {
    let off = false;
    setDias(null); setErro(false);
    fetch(`/api/ocupacao?action=escala-rotatividade&mes=${mes}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!off) setDias(Array.isArray(j.dias) ? j.dias : []); })
      .catch(() => { if (!off) setErro(true); });
    return () => { off = true; };
  }, [mes]);

  const { linhas, colunas, maxCelula } = useMemo(() => {
    const porNome = new Map<string, { nome: string; cont: Record<string, number>; seq: string[]; total: number }>();
    for (const d of [...(dias ?? [])].sort((a, b) => a.data.localeCompare(b.data))) {
      for (const g of d.garcons) {
        if (g.ausencia || g.faltou) continue;
        const nome = g.nome.trim().toUpperCase();
        if (!nome) continue;
        const k = areaKey(g);
        const e = porNome.get(nome) ?? { nome, cont: {}, seq: [], total: 0 };
        e.cont[k] = (e.cont[k] ?? 0) + 1;
        e.seq.push(k);
        e.total++;
        porNome.set(nome, e);
      }
    }
    const lista = [...porNome.values()].map(e => {
      // maior sequência de dias trabalhados na mesma área
      let max = 0, run = 0, ult = '', areaRun = '';
      for (const k of e.seq) {
        run = k === ult ? run + 1 : 1; ult = k;
        if (run > max) { max = run; areaRun = k; }
      }
      return { ...e, seqMax: max, seqArea: areaRun };
    }).sort((a, b) => a.nome.localeCompare(b.nome));
    const usados = new Set(lista.flatMap(l => Object.keys(l.cont)));
    const cols = COLUNAS.filter(c => c.key !== 'piscina' || usados.has('piscina'));
    const maxC = Math.max(1, ...lista.flatMap(l => Object.values(l.cont)));
    return { linhas: lista, colunas: cols, maxCelula: maxC };
  }, [dias]);

  const rotulo = (k: string) => COLUNAS.find(c => c.key === k)?.label ?? k;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setMes(mudaMes(mes, -1))} className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm">‹</button>
          <h2 className="font-bold text-sm text-gray-900 dark:text-white">{rotuloMes(mes)}</h2>
          <button onClick={() => setMes(mudaMes(mes, 1))} disabled={mes >= mesBRT()} className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm disabled:opacity-30">›</button>
        </div>
        <p className="text-[11px] text-gray-400">
          Dias de trabalho de cada garçom por área, a partir das escalas validadas{dias ? ` (${dias.length} dia${dias.length === 1 ? '' : 's'} no mês)` : ''}. Ausências e faltas não contam.
        </p>
        <label className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          Alertar a partir de
          <select value={limite} onChange={e => { const n = Number(e.target.value); setLimite(n); try { localStorage.setItem(LIMITE_KEY, String(n)); } catch { /* */ } }}
            className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs">
            {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          dias seguidos na mesma área
        </label>
      </div>

      {erro && <p className="text-xs text-red-500 text-center">Não foi possível carregar. Tente novamente.</p>}
      {!dias && !erro && <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />}
      {dias && linhas.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-8">Nenhuma escala validada neste mês.</p>
      )}

      {linhas.length > 0 && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-3 overflow-x-auto">
            <table className="w-full text-[11px] border-separate border-spacing-y-0.5">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left font-semibold pr-2">Garçom</th>
                  {colunas.map(c => <th key={c.key} className="font-semibold px-1 text-center whitespace-nowrap">{c.label}</th>)}
                  <th className="font-semibold px-1 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const alerta = l.seqMax >= limite;
                  return (
                    <tr key={l.nome}>
                      <td className="pr-2 py-0.5 font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap">
                        {l.nome}
                        {alerta && <span title={`${l.seqMax} dias seguidos em ${rotulo(l.seqArea)}`} className="ml-1 text-amber-500">⚠</span>}
                      </td>
                      {colunas.map(c => {
                        const n = l.cont[c.key] ?? 0;
                        return (
                          <td key={c.key} className="text-center tabular-nums rounded"
                            style={n ? { background: c.cor, color: '#fff', opacity: 0.35 + 0.65 * (n / maxCelula) } : undefined}>
                            <span className={n ? 'font-bold' : 'text-gray-300 dark:text-gray-600'}>{n || '·'}</span>
                          </td>
                        );
                      })}
                      <td className="text-center font-bold tabular-nums text-gray-700 dark:text-gray-200">{l.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {linhas.some(l => l.seqMax >= limite) && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">⚠ Passou de {limite} dias seguidos na mesma área (passe o mouse ou toque no aviso para ver qual).</p>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex flex-col gap-2">
            <h3 className="text-xs font-bold text-gray-700 dark:text-gray-200">Distribuição por garçom</h3>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400">
              {colunas.map(c => (
                <span key={c.key} className="flex items-center gap-1"><i className="inline-block w-2 h-2 rounded-sm" style={{ background: c.cor }} />{c.label}</span>
              ))}
            </div>
            {linhas.map(l => (
              <div key={l.nome} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[11px] text-gray-700 dark:text-gray-200 truncate">{l.nome}</span>
                <div className="flex-1 flex h-3 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
                  {colunas.map(c => {
                    const n = l.cont[c.key] ?? 0;
                    return n ? <div key={c.key} title={`${c.label}: ${n}`} style={{ width: `${(n / l.total) * 100}%`, background: c.cor }} /> : null;
                  })}
                </div>
                <span className="w-6 text-right text-[11px] tabular-nums text-gray-500">{l.total}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
