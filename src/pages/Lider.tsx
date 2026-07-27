import { useState, useMemo, useEffect, useRef } from 'react';
import { CheckCircle, AlertTriangle, Users, Waves, LayoutDashboard, Bell, CalendarDays, Check, Upload } from 'lucide-react';
import { useEscalaHoje } from '../hooks/useEscalaHoje';
import { useOccupancy } from '../hooks/useOccupancy';
import { useChamadas, parseTempoSec } from '../hooks/useChamadas';
import type { ValidacaoGarcom, BeachSetor, EscalaGarcom, EscalaStatus } from '../types';
import { BEACH_SETORES, SPACE_CONFIGS } from '../types';

const STATUS_OPTS: { value: EscalaStatus; label: string; cls: string; bg: string }[] = [
  { value: 'T', label: 'T', cls: 'bg-teal-700 text-white',    bg: 'bg-teal-700'    },
  { value: 'X', label: 'X', cls: 'bg-gray-600 text-white',    bg: 'bg-gray-600'    },
  { value: 'C', label: 'C', cls: 'bg-yellow-500 text-white',  bg: 'bg-yellow-500'  },
  { value: 'F', label: 'F', cls: 'bg-blue-500 text-white',    bg: 'bg-blue-500'    },
  { value: 'A', label: 'A', cls: 'bg-red-500 text-white',     bg: 'bg-red-500'     },
];

// Parse xlsx no cliente — retorna linhas [{nome, funcao, dias:{DD:status}}]
async function parseEscalaXlsx(file: File): Promise<EscalaGarcom[]> {
  const XLSX = await import('xlsx');
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Identifica linha de cabeçalho (contém '01' ou '1' nas colunas de dias)
  // Formato: col0=nº, col1=nome, col2=função, col3..=dias
  const STATUS_SET = new Set(['T', 'X', 'C', 'F', 'A', 'C ']);
  const garcons: EscalaGarcom[] = [];

  // Encontra índice da coluna de dias (busca pela primeira col com valor '01' ou 1)
  let headerRow = -1;
  let firstDayCol = 3;
  for (let r = 0; r < Math.min(10, raw.length); r++) {
    const row = raw[r];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c]).trim();
      if (v === '01' || v === '1') { headerRow = r; firstDayCol = c; break; }
    }
    if (headerRow >= 0) break;
  }

  const dataStart = headerRow >= 0 ? headerRow + 1 : 2;

  for (let r = dataStart; r < raw.length; r++) {
    const row = raw[r];
    const nome = String(row[1] ?? '').trim();
    const func = String(row[2] ?? '').trim().toUpperCase();
    if (!nome || nome.length < 3) continue;

    const area: 'beach' | 'lounge' = func.includes('LOUNGE') ? 'lounge' : 'beach';
    const dias: Record<string, EscalaStatus> = {};

    for (let c = firstDayCol; c < row.length; c++) {
      const dia  = String(c - firstDayCol + 1).padStart(2, '0');
      const val  = String(row[c] ?? '').trim().toUpperCase();
      if (STATUS_SET.has(val)) dias[dia] = (val.trim() as EscalaStatus);
      else if (val === '' || val === '-') dias[dia] = 'T'; // fim de semana/vazio → T por padrão
    }

    garcons.push({
      id:   `xlsx-${r}`,
      nome: nome.split(' ').slice(0, 3).join(' '),
      area,
      dias,
    });
  }
  return garcons;
}

function BoxEscalaMensal() {
  const { escala, loading, salvarEscala } = useEscalaHoje();
  const [rows, setRows]     = useState<EscalaGarcom[]>([]);
  const [mes, setMes]       = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' }).slice(0, 7));
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading) {
      if (escala.length > 0) {
        setRows(escala);
      } else {
        const raw = localStorage.getItem('hibiscus-staff');
        if (raw) {
          const staff: { id: string; name: string; sector: string }[] = JSON.parse(raw);
          setRows(staff.filter(s => s.sector === 'ATENDIMENTO').map(s => ({
            id: s.id,
            nome: s.name.split(' ').slice(0, 2).join(' '),
            area: 'beach' as const,
            dias: {},
          })));
        }
      }
    }
  }, [loading, escala]);

  const daysInMes = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const days = Array.from({ length: daysInMes }, (_, i) => String(i + 1).padStart(2, '0'));

  function cycleStatus(ri: number, dia: string) {
    const order: EscalaStatus[] = ['T', 'X', 'C', 'F', 'A'];
    const cur  = rows[ri]?.dias[dia] ?? 'T';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setRows(prev => prev.map((r, i) => i === ri ? { ...r, dias: { ...r.dias, [dia]: next } } : r));
  }
  function setArea(ri: number, area: 'beach' | 'lounge') {
    setRows(prev => prev.map((r, i) => i === ri ? { ...r, area, setor_padrao: area === 'lounge' ? undefined : (r.setor_padrao ?? 'salao') } : r));
  }
  function setSetorPadrao(ri: number, setor: BeachSetor) {
    setRows(prev => prev.map((r, i) => i === ri ? { ...r, setor_padrao: setor } : r));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const parsed = await parseEscalaXlsx(file);
      if (parsed.length > 0) setRows(parsed);
      else alert('Não foi possível ler a escala. Verifique o formato do arquivo.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSave() {
    setSaving(true);
    await salvarEscala(rows);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <p className="text-sm text-gray-400 py-6 text-center">Carregando...</p>;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white" />
        <span className="text-xs text-gray-400">{rows.length} garçons</span>

        {/* Botão importar */}
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 text-xs font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 transition-colors">
          <Upload size={13} />{importing ? 'Importando...' : 'Importar Excel'}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
      </div>

      {/* Legenda */}
      <div className="flex gap-1.5 flex-wrap items-center text-[10px]">
        {STATUS_OPTS.map(s => (
          <span key={s.value} className={`px-2 py-0.5 rounded font-bold ${s.cls}`}>{s.value}</span>
        ))}
        <span className="text-gray-400 ml-1">T=Trabalha · X=Folga · C=Compensa · F=Férias · A=Atestado</span>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 -mx-1">
        <table className="text-[10px] border-collapse min-w-max">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50">
              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-700 px-2 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-300 min-w-[110px]">Nome</th>
              <th className="px-1 py-1.5 font-semibold text-gray-600 dark:text-gray-300 min-w-[60px]">Área</th>
              <th className="px-1 py-1.5 font-semibold text-gray-600 dark:text-gray-300 min-w-[72px]">Setor</th>
              {days.map(d => <th key={d} className="px-0.5 py-1.5 font-semibold text-gray-500 w-6 text-center">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((g, ri) => (
              <tr key={g.id} className={`border-t border-gray-100 dark:border-gray-700 ${g.area === 'lounge' ? 'bg-purple-50/30 dark:bg-purple-900/10' : ''}`}>
                <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-2 py-1 font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
                  {g.nome}
                  <span className={`ml-1 text-[8px] font-bold px-1 py-0.5 rounded ${g.area === 'lounge' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                    {g.area === 'lounge' ? 'L' : 'B'}
                  </span>
                </td>
                <td className="px-1 py-1">
                  <select value={g.area} onChange={e => setArea(ri, e.target.value as 'beach' | 'lounge')}
                    className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                    <option value="beach">Beach</option>
                    <option value="lounge">Lounge</option>
                  </select>
                </td>
                <td className="px-1 py-1">
                  {g.area === 'beach' ? (
                    <select value={g.setor_padrao ?? 'salao'} onChange={e => setSetorPadrao(ri, e.target.value as BeachSetor)}
                      className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {BEACH_SETORES.map(s => <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-[10px] text-purple-500">🛋️ Lounge</span>
                  )}
                </td>
                {days.map(d => {
                  const st  = g.dias[d] ?? 'T';
                  const opt = STATUS_OPTS.find(o => o.value === st)!;
                  return (
                    <td key={d} className="px-0 py-1 text-center">
                      <button onClick={() => cycleStatus(ri, d)}
                        className={`w-5 h-5 rounded text-[8px] font-bold ${opt.cls} hover:opacity-80 active:scale-95`}>
                        {st}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
        {saved ? <><Check size={14} /> Salvo!</> : saving ? 'Salvando...' : 'Salvar escala do mês'}
      </button>
      <p className="text-[10px] text-gray-400 text-center">Toque nas células para alternar · Setor = padrão usado na validação diária</p>
    </div>
  );
}

function todayBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
}

// ── Box Validação ─────────────────────────────────────────────────────────────
function BoxEscala() {
  const { ativosHoje, validacao, loading, validarDia } = useEscalaHoje();
  const [editando, setEditando]   = useState(false);
  const [draft, setDraft]         = useState<ValidacaoGarcom[]>([]);
  const [saving, setSaving]       = useState(false);

  const agora = new Date();
  const h = agora.getHours(), m = agora.getMinutes();
  const depois09 = h > 9 || (h === 9 && m >= 0);

  function abrirValidacao() {
    const inicial: ValidacaoGarcom[] = ativosHoje.map(g => ({
      id: g.id, nome: g.nome, area: g.area,
      setor: g.area === 'lounge' ? undefined : (g.setor_padrao ?? 'salao' as BeachSetor),
    }));
    setDraft(inicial);
    setEditando(true);
  }

  async function confirmar() {
    setSaving(true);
    await validarDia(draft);
    setSaving(false);
    setEditando(false);
  }

  const garconsDia = validacao.validado ? validacao.garcons : [];
  const totalLounge = garconsDia.filter(g => g.area === 'lounge').length;
  const beachPorSetor = BEACH_SETORES.map(s => ({
    ...s,
    count: garconsDia.filter(g => g.area === 'beach' && g.setor === s.value).length,
  }));
  const totalBeach = garconsDia.filter(g => g.area === 'beach').length;
  const total = garconsDia.length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-brand-600 dark:text-brand-400" />
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Escala do dia</h2>
          <span className="text-xs text-gray-400">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Recife' })}
          </span>
        </div>
        {validacao.validado && (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-semibold">
            <CheckCircle size={13} /> Validada
          </span>
        )}
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Alerta não validada */}
        {!validacao.validado && depois09 && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 text-amber-800 dark:text-amber-300 text-sm font-semibold animate-pulse">
            <AlertTriangle size={16} /> Escala do dia não validada
          </div>
        )}

        {/* Resumo quando validada */}
        {validacao.validado && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-teal-700 dark:text-teal-400">{total}</p>
                <p className="text-xs text-teal-600 dark:text-teal-500 font-semibold">Total</p>
              </div>
              <div className="flex-1 bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-purple-700 dark:text-purple-400">{totalLounge}</p>
                <p className="text-xs text-purple-600 dark:text-purple-500 font-semibold">🛋️ Lounge</p>
              </div>
              <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-blue-700 dark:text-blue-400">{totalBeach}</p>
                <p className="text-xs text-blue-600 dark:text-blue-500 font-semibold">🏖️ Beach</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {beachPorSetor.map(s => (
                <div key={s.value} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{s.emoji} {s.label}</span>
                  <span className="text-sm font-black text-gray-800 dark:text-white">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sem escala cadastrada */}
        {!loading && ativosHoje.length === 0 && !validacao.validado && (
          <p className="text-xs text-gray-400 text-center py-2">Escala mensal não cadastrada. Acesse Configurações para inserir.</p>
        )}

        {/* Botão validar */}
        {!validacao.validado && ativosHoje.length > 0 && (
          <button onClick={abrirValidacao}
            className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 transition-colors flex items-center justify-center gap-2">
            <CheckCircle size={16} /> Validar escala de hoje
          </button>
        )}

        {validacao.validado && (
          <button onClick={abrirValidacao}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline text-center">
            Editar validação
          </button>
        )}
      </div>

      {/* Drawer de validação */}
      {editando && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={() => setEditando(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">Validar escala — {todayBRT()}</h3>
              <button onClick={() => setEditando(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
            </div>

            <div className="p-5 flex flex-col gap-3">
              {draft.map((g, i) => (
                <div key={g.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <span className="flex-1 text-sm font-medium text-gray-800 dark:text-white">{g.nome}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.area === 'lounge' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {g.area === 'lounge' ? '🛋️ Lounge' : '🏖️ Beach'}
                  </span>
                  {g.area === 'beach' && (
                    <select
                      value={g.setor ?? 'salao'}
                      onChange={e => setDraft(prev => prev.map((x, xi) => xi === i ? { ...x, setor: e.target.value as BeachSetor } : x))}
                      className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                    >
                      {BEACH_SETORES.map(s => <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>)}
                    </select>
                  )}
                </div>
              ))}

              <button onClick={confirmar} disabled={saving}
                className="mt-2 w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <CheckCircle size={16} /> {saving ? 'Salvando...' : 'Confirmar escala'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Box Ocupação ──────────────────────────────────────────────────────────────
function BoxOcupacao() {
  const [occupancy] = useOccupancy();
  const loungesOcupados = occupancy.lounges.filter(v => v > 0).length;
  const loungesTotal    = occupancy.lounges.reduce((a, b) => a + b, 0);
  const beachPct = Math.round((occupancy.beach / SPACE_CONFIGS.beach.max) * 100);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Waves size={18} className="text-brand-600 dark:text-brand-400" />
        <h2 className="font-bold text-gray-900 dark:text-white text-sm">Ocupação atual</h2>
      </div>
      <div className="p-5 grid grid-cols-2 gap-3">
        <div className="bg-sky-50 dark:bg-sky-900/20 rounded-xl p-3 flex flex-col gap-1">
          <p className="text-xs text-sky-600 dark:text-sky-400 font-semibold">🏖️ Beach</p>
          <p className="text-2xl font-black text-sky-700 dark:text-sky-300">{occupancy.beach}</p>
          <div className="w-full bg-sky-200 dark:bg-sky-800 rounded-full h-1.5">
            <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${Math.min(beachPct, 100)}%` }} />
          </div>
          <p className="text-[10px] text-sky-500">{beachPct}% da cap.</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 flex flex-col gap-1">
          <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold">🛋️ Lounges</p>
          <p className="text-2xl font-black text-purple-700 dark:text-purple-300">{loungesOcupados}<span className="text-sm font-medium text-purple-400">/19</span></p>
          <p className="text-[10px] text-purple-500">{loungesTotal} pax no total</p>
        </div>
        {occupancy.parceiros > 0 && (
          <div className="col-span-2 bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 flex items-center justify-between">
            <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold">🤝 Parceiros</p>
            <p className="text-lg font-black text-gray-700 dark:text-gray-200">{occupancy.parceiros}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Box Chamadas ──────────────────────────────────────────────────────────────
function BoxChamadas() {
  const { chamadas, loading } = useChamadas();

  const stats = useMemo(() => {
    const total      = chamadas.length;
    const finalizadas = chamadas.filter(c => c.status === 'finalizada').length;
    const demoradas  = chamadas.filter(c => parseTempoSec(c.tempoEspera) >= 180).length;

    const setorMap: Record<string, number> = {};
    chamadas.forEach(c => { setorMap[c.setor] = (setorMap[c.setor] ?? 0) + 1; });
    const topSetores = Object.entries(setorMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { total, finalizadas, demoradas, topSetores };
  }, [chamadas]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Bell size={18} className="text-brand-600 dark:text-brand-400" />
        <h2 className="font-bold text-gray-900 dark:text-white text-sm">Chamadas de hoje</h2>
        {loading && <span className="text-[10px] text-gray-400 ml-auto">atualizando...</span>}
      </div>
      <div className="p-5 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-gray-800 dark:text-white">{stats.total}</p>
            <p className="text-[10px] text-gray-500 font-semibold">Total</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-green-700 dark:text-green-400">{stats.finalizadas}</p>
            <p className="text-[10px] text-green-600 font-semibold">Finalizadas</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-red-700 dark:text-red-400">{stats.demoradas}</p>
            <p className="text-[10px] text-red-600 font-semibold">Putz (≥3min)</p>
          </div>
        </div>

        {stats.topSetores.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Top setores</p>
            {stats.topSetores.map(([setor, count]) => (
              <div key={setor} className="flex items-center gap-2">
                <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{setor}</span>
                <span className="text-xs font-bold text-gray-800 dark:text-white">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
type Aba = 'hoje' | 'escala';

export function Lider() {
  const [aba, setAba] = useState<Aba>('hoje');

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <LayoutDashboard size={20} className="text-brand-600 dark:text-brand-400" />
        <div>
          <h1 className="text-sm font-black text-gray-900 dark:text-white leading-tight">App do Líder</h1>
          <p className="text-[10px] text-gray-400">Hibiscus Beach Club · Atendimento</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Recife' })}
          </p>
          <p className="text-[10px] text-gray-400">
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' })}
          </p>
        </div>
      </header>

      {/* Abas */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex px-4">
        {([
          { id: 'hoje',   label: 'Hoje',          icon: <LayoutDashboard size={14} /> },
          { id: 'escala', label: 'Escala Mensal',  icon: <CalendarDays size={14} /> },
        ] as { id: Aba; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
              aba === t.id
                ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <main className="p-4 max-w-lg mx-auto flex flex-col gap-4 pb-8">
        {aba === 'hoje' && (
          <>
            <BoxEscala />
            <BoxOcupacao />
            <BoxChamadas />
          </>
        )}
        {aba === 'escala' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <CalendarDays size={18} className="text-brand-600 dark:text-brand-400" />
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">Escala Mensal</h2>
            </div>
            <div className="p-4">
              <BoxEscalaMensal />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
