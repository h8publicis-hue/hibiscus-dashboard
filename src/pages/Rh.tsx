import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { OccupancyState, SPACE_CONFIGS } from '../types';

// ── Ocupação ──────────────────────────────────────────────────────────────────

const DEFAULT: OccupancyState = {
  beach: 0, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0),
  prime: 0, parceiros: 0, colaboradores: 0, loungeObs: Array(SPACE_CONFIGS.lounge.count).fill(''),
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

async function fetchOcc(): Promise<OccupancyState> {
  try {
    const r = await fetch('/api/ocupacao');
    if (!r.ok) throw new Error();
    const d = await r.json() as Partial<OccupancyState>;
    return {
      beach:         clamp(d.beach ?? 0, 0, 500),
      lounges:       Array(SPACE_CONFIGS.lounge.count).fill(0).map((_, i) => clamp(d.lounges?.[i] ?? 0, 0, 10)),
      prime:         clamp(d.prime ?? 0, 0, 10),
      parceiros:     clamp(d.parceiros ?? 0, 0, 999),
      colaboradores: clamp(d.colaboradores ?? 0, 0, 999),
      loungeObs:     Array(SPACE_CONFIGS.lounge.count).fill('').map((_, i) => d.loungeObs?.[i] ?? ''),
    };
  } catch { return { ...DEFAULT }; }
}

async function saveOcc(state: OccupancyState) {
  await fetch('/api/ocupacao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
}

function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onClickRef  = useRef(onClick);
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);

  const stop = useCallback(() => {
    if (timerRef.current)    { clearTimeout(timerRef.current);    timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    onClickRef.current();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => onClickRef.current(), 80);
    }, 400);
  }, []);

  return (
    <button
      disabled={disabled}
      className="w-20 h-20 rounded-2xl bg-white border-2 border-gray-200 text-4xl font-light text-gray-700 active:bg-gray-100 select-none shadow-sm disabled:opacity-30"
      onPointerDown={(e) => { if (disabled) return; e.preventDefault(); start(); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {label}
    </button>
  );
}

// ── Escalas ───────────────────────────────────────────────────────────────────

interface EscalaRow { num: number; nome: string; funcao: string; dias: string[]; }
interface EscalaSheet { setor: string; dias: string[]; rows: EscalaRow[]; }
interface EscalaMeta { id: string; mes: string; token: string; uploadedAt: string; setores: string[]; }

const STATUS_COLORS: Record<string, string> = {
  T:  'bg-emerald-100 text-emerald-800',
  X:  'bg-red-100 text-red-700',
  C:  'bg-amber-100 text-amber-700',
  F:  'bg-blue-100 text-blue-700',
  A:  'bg-orange-100 text-orange-700',
  CA: 'bg-amber-100 text-amber-700',
  '': 'bg-gray-50 text-gray-300',
};

function statusColor(v: string) {
  return STATUS_COLORS[v.toUpperCase()] ?? 'bg-gray-50 text-gray-400';
}

function parseEscalaSheet(ws: XLSX.WorkSheet): { dias: string[]; rows: EscalaRow[] } {
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][];

  // Encontra linha com números 1-31 (cabeçalho de dias)
  let dayHeaderRow = -1;
  let dayColMap: { col: number; dia: string }[] = [];
  let bestScore = 0;

  for (let r = 0; r < Math.min(raw.length, 25); r++) {
    const row = raw[r];
    const matches: { col: number; dia: string }[] = [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c]).trim().replace(/^0+/, '') || '0';
      const n = Number(v);
      if (!isNaN(n) && n >= 1 && n <= 31) {
        matches.push({ col: c, dia: String(n).padStart(2, '0') });
      }
    }
    if (matches.length > bestScore) {
      bestScore = matches.length;
      if (matches.length >= 10) { dayHeaderRow = r; dayColMap = matches; }
    }
  }

  if (dayHeaderRow === -1) return { dias: [], rows: [] };

  const dias    = dayColMap.map(d => d.dia);
  const dayCols = new Set(dayColMap.map(d => d.col));
  const STATUS  = /^[TXCFAtxcfa]/;
  const rows: EscalaRow[] = [];
  const minFilled = Math.max(3, Math.floor(dayColMap.length * 0.25));

  for (let r = dayHeaderRow + 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row || row.every(c => String(c).trim() === '')) continue;

    const filled = dayColMap.filter(({ col }) => STATUS.test(String(row[col] ?? '').trim())).length;
    if (filled < minFilled) continue;

    const nonDay = row
      .map((v, ci) => ({ v: String(v).trim(), ci }))
      .filter(({ ci, v }) => !dayCols.has(ci) && v !== '');

    const num    = /^\d+$/.test(nonDay[0]?.v ?? '') ? Number(nonDay[0].v) : rows.length + 1;
    const nome   = nonDay.find(({ ci }) => ci > 0 && !/^\d+$/.test(nonDay.find(x => x.ci === ci)?.v ?? ''))?.v
                   ?? nonDay[1]?.v ?? '';
    const funcao = nonDay.filter(({ v }) => v.length > 2 && !/^\d+$/.test(v))[1]?.v ?? '';
    const diaVals = dayColMap.map(({ col }) => String(row[col] ?? '').trim().toUpperCase() || '');

    if (nome) rows.push({ num, nome, funcao, dias: diaVals });
  }

  return { dias, rows };
}

function parseWorkbook(file: File): Promise<EscalaSheet[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data   = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb     = XLSX.read(data, { type: 'array' });
        const sheets: EscalaSheet[] = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name];
          const { dias, rows } = parseEscalaSheet(ws);
          return { setor: name.trim(), dias, rows };
        }).filter(s => s.rows.length > 0);
        resolve(sheets);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function fetchEscalasMeta(): Promise<EscalaMeta[]> {
  try {
    const r = await fetch('/api/goals?type=escala');
    if (!r.ok) return [];
    const d = await r.json() as { escalas: EscalaMeta[] };
    return d.escalas ?? [];
  } catch { return []; }
}

async function publicarEscala(mes: string, sheets: EscalaSheet[]): Promise<{ token: string } | null> {
  try {
    const r = await fetch('/api/goals?type=escala', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes, sheets }),
    });
    if (!r.ok) return null;
    return await r.json() as { token: string };
  } catch { return null; }
}

async function deletarEscala(id: string) {
  await fetch('/api/goals?type=escala', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

function TabEscalas() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets]         = useState<EscalaSheet[] | null>(null);
  const [parsing, setParsing]       = useState(false);
  const [mes, setMes]               = useState('');
  const [publishing, setPublishing] = useState(false);
  const [link, setLink]             = useState('');
  const [metas, setMetas]           = useState<EscalaMeta[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [copiado, setCopiado]       = useState('');
  const [confirmDel, setConfirmDel] = useState('');

  const reload = useCallback(() => {
    setLoadingMeta(true);
    fetchEscalasMeta().then(d => { setMetas(d); setLoadingMeta(false); });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setParsing(true);
    setLink('');
    try {
      // Parseia todos os arquivos em paralelo e junta as abas
      const allParsed = await Promise.all(files.map(f => parseWorkbook(f)));
      const merged: EscalaSheet[] = allParsed.flat();
      setSheets(merged.length > 0 ? merged : null);
      if (merged.length === 0) { alert('Nenhum dado encontrado nos arquivos.'); }
      // Tenta extrair mês do nome do primeiro arquivo
      const m = files[0].name.match(/jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{4}/gi);
      if (m && !mes) setMes(m.join(' '));
    } catch {
      alert('Erro ao ler um dos arquivos. Verifique se todos são .xlsx válidos.');
    }
    setParsing(false);
    e.target.value = '';
  };

  const publicar = async () => {
    if (!sheets || !mes.trim()) return;
    setPublishing(true);
    const result = await publicarEscala(mes.trim(), sheets);
    setPublishing(false);
    if (!result) { alert('Erro ao publicar. Tente novamente.'); return; }
    const url = `${window.location.origin}/escala?t=${result.token}`;
    setLink(url);
    setSheets(null);
    setMes('');
    reload();
  };

  const copiar = (url: string, id: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(id);
      setTimeout(() => setCopiado(''), 2000);
    });
  };

  const deletar = async (id: string) => {
    await deletarEscala(id);
    setConfirmDel('');
    reload();
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Upload */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
        <div>
          <p className="text-sm font-bold text-gray-800">Enviar nova escala</p>
          <p className="text-xs text-gray-400 mt-0.5">Selecione um ou vários .xlsx — cada arquivo é juntado automaticamente</p>
        </div>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className="w-full py-8 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center gap-2 text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors disabled:opacity-50"
        >
          <span className="text-2xl">{parsing ? '⏳' : '📂'}</span>
          <span className="text-sm font-medium">
            {parsing ? 'Lendo arquivos…' : 'Clique para selecionar um ou mais arquivos .xlsx'}
          </span>
          <span className="text-xs text-gray-300">Selecione vários de uma vez — cada arquivo é um setor</span>
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onFile} />

        {sheets && (
          <div className="flex flex-col gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1">
                ✓ {sheets.length} setor(es) lido(s)
              </p>
              {sheets.map(s => (
                <p key={s.setor} className="text-xs text-emerald-600">
                  • {s.setor} — {s.rows.length} colaboradores, {s.dias.length} dias
                </p>
              ))}
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Identificação (ex: Outubro 2026)</label>
              <input
                type="text"
                value={mes}
                onChange={e => setMes(e.target.value)}
                placeholder="Mês Ano"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <button
              onClick={publicar}
              disabled={publishing || !mes.trim()}
              className="w-full py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {publishing ? 'Publicando…' : '🔗 Publicar e gerar link'}
            </button>
          </div>
        )}

        {link && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-blue-700">Link gerado com sucesso!</p>
            <p className="text-[11px] text-blue-600 break-all font-mono">{link}</p>
            <button
              onClick={() => copiar(link, 'novo')}
              className="w-full py-2 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition-colors"
            >
              {copiado === 'novo' ? '✓ Copiado!' : 'Copiar link'}
            </button>
          </div>
        )}
      </div>

      {/* Lista publicadas */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3">
        <p className="text-sm font-bold text-gray-800">Escalas publicadas</p>

        {loadingMeta && <p className="text-xs text-gray-400 animate-pulse">Carregando…</p>}
        {!loadingMeta && metas.length === 0 && (
          <p className="text-xs text-gray-400">Nenhuma escala publicada ainda.</p>
        )}

        {metas.map(m => {
          const url = `${window.location.origin}/escala?t=${m.token}`;
          const data = new Date(m.uploadedAt).toLocaleDateString('pt-BR');
          return (
            <div key={m.id} className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{m.mes}</p>
                  <p className="text-[11px] text-gray-400">{m.setores.join(', ')}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">Publicada em {data}</p>
                </div>
                {confirmDel !== m.id ? (
                  <button
                    onClick={() => setConfirmDel(m.id)}
                    className="text-[11px] text-red-400 hover:text-red-600 shrink-0"
                  >
                    Excluir
                  </button>
                ) : (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => deletar(m.id)} className="text-[11px] text-white bg-red-500 rounded px-2 py-0.5 hover:bg-red-600">Sim</button>
                    <button onClick={() => setConfirmDel('')} className="text-[11px] text-gray-500 bg-gray-100 rounded px-2 py-0.5">Não</button>
                  </div>
                )}
              </div>
              <button
                onClick={() => copiar(url, m.id)}
                className="w-full py-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors"
              >
                {copiado === m.id ? '✓ Copiado!' : '📋 Copiar link de visualização'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export function Rh() {
  const [aba, setAba]           = useState<'dia' | 'escalas'>('dia');
  const [occ, setOcc]           = useState<OccupancyState>({ ...DEFAULT, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0) });
  const [saved, setSaved]       = useState(false);
  const [loading, setLoading]   = useState(true);
  const saveTimer               = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchOcc().then(d => { setOcc(d); setLoading(false); });
  }, []);

  const update = useCallback((next: OccupancyState) => {
    setOcc(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveOcc(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 300);
  }, []);

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">RH · Hibiscus Beach Club</p>
            <h1 className="text-base font-bold text-gray-900">
              {aba === 'dia' ? 'Colaboradores do Dia' : 'Escalas de Trabalho'}
            </h1>
          </div>
          <div className={`text-xs font-medium px-3 py-1 rounded-full transition-all ${
            saved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}>
            {saved ? '✓ Salvo' : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Abas */}
        <div className="max-w-lg mx-auto px-4 flex gap-0 border-t border-gray-100">
          {(['dia', 'escalas'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setAba(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                aba === tab
                  ? 'text-emerald-600 border-emerald-500'
                  : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {tab === 'dia' ? '👷 Colaboradores do Dia' : '📅 Escalas'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6">
        {aba === 'dia' ? (
          <div className="flex flex-col items-center gap-6">
            <p className="text-sm text-gray-400 capitalize">{hoje}</p>

            <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5 items-center">
              <div className="text-center">
                <p className="text-2xl">👷</p>
                <p className="text-base font-bold text-gray-800 mt-1">Colaboradores em Serviço</p>
                <p className="text-xs text-gray-400 mt-0.5">Inclui toda a equipe operacional do dia</p>
              </div>

              <div className="flex items-center justify-between gap-6 w-full">
                <StepBtn
                  label="−"
                  onClick={() => update({ ...occ, colaboradores: clamp((occ.colaboradores ?? 0) - 1, 0, 999) })}
                  disabled={(occ.colaboradores ?? 0) <= 0}
                />
                <div className="flex-1 text-center">
                  <span className="text-7xl font-black text-gray-900 tabular-nums">{occ.colaboradores ?? 0}</span>
                </div>
                <StepBtn
                  label="+"
                  onClick={() => update({ ...occ, colaboradores: clamp((occ.colaboradores ?? 0) + 1, 0, 999) })}
                />
              </div>

              <p className="text-xs text-gray-300">Toque e segure +/− para alterar rapidamente</p>
            </div>

            <button
              onClick={() => { if (window.confirm('Zerar o contador de colaboradores?')) update({ ...occ, colaboradores: 0 }); }}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors"
            >
              Zerar colaboradores
            </button>

            <div className="w-full bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-xl">🍽️</span>
              <div>
                <p className="text-sm font-semibold text-blue-800">Previsão Refeitório</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {(occ.colaboradores ?? 0)} colaboradores + {occ.parceiros ?? 0} parceiros ={' '}
                  <span className="font-bold">{(occ.colaboradores ?? 0) + (occ.parceiros ?? 0)} refeições</span>
                </p>
              </div>
            </div>
          </div>
        ) : (
          <TabEscalas />
        )}
      </div>

      <div className="text-center py-8">
        <p className="text-[10px] text-gray-300 leading-tight">Desenvolvido por</p>
        <p className="text-[11px] font-bold text-gray-400 leading-tight">H8 Sistemas</p>
      </div>
    </div>
  );
}

export { statusColor };
