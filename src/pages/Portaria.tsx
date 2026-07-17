import { useState, useEffect, useRef, useCallback } from 'react';
import { useAviso } from '../hooks/useAviso';
import { SPACE_CONFIGS, OccupancyState, LoungeReserva } from '../types';
import clsx from 'clsx';

const MAX = 1000; // capacidade máxima do clube

// ── Ocupação read-only ────────────────────────────────────────────────────────

const LOUNGE_GROUPS = [
  { label: 'Frente Mar', ids: [0, 2, 4, 6, 8, 10, 12] },
  { label: 'Atrás',      ids: [1, 3, 5, 7, 9, 11, 13] },
  { label: 'Anexo',      ids: [14] },
  { label: 'Prime ★',    ids: [15] },
  { label: 'Gramado',    ids: [16, 17] },
] as const;

const OCC_DEFAULT: OccupancyState = {
  beach: 0, lounges: Array(18).fill(0), prime: 0,
  parceiros: 0, colaboradores: 0, loungeObs: [],
};

async function fetchOcc(): Promise<OccupancyState> {
  try {
    const r = await fetch('/api/ocupacao');
    if (!r.ok) return OCC_DEFAULT;
    const j = await r.json() as any;
    return {
      beach: Number(j.beach ?? 0),
      lounges: Array.isArray(j.lounges) ? j.lounges.map(Number) : Array(18).fill(0),
      prime: Number(j.prime ?? 0),
      parceiros: Number(j.parceiros ?? 0),
      colaboradores: Number(j.colaboradores ?? 0),
      loungeObs: Array.isArray(j.loungeObs) ? j.loungeObs : [],
      loungeData: j.loungeData,
      reservasHoje: j.reservasHoje,
    };
  } catch { return OCC_DEFAULT; }
}

function loungeBg(v: number, pct: number) {
  if (v === 0) return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';
  if (pct >= 0.9) return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-600';
  if (pct >= 0.6) return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-600';
  return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-600';
}

function LoungeLabel({ label, className }: { label: string; className?: string }) {
  if (!label.includes('★')) return <span className={className}>{label}</span>;
  const [before] = label.split('★');
  return <span className={className}>{before}<span className="text-yellow-400">★</span></span>;
}

function OccupancyRow({ label, current, max }: { label: string; current: number; max: number }) {
  const pct  = current / max;
  const bar  = pct >= 0.9 ? 'bg-red-500' : pct >= 0.6 ? 'bg-yellow-400' : 'bg-green-500';
  const text = pct >= 0.9 ? 'text-red-600' : pct >= 0.6 ? 'text-yellow-600' : 'text-green-600';
  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-300', bar)} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <span className={clsx('text-xs font-bold w-12 text-right shrink-0', text)}>{current}/{max}</span>
    </div>
  );
}

function LoungeMap({ lounges, reservas }: { lounges: number[]; reservas?: LoungeReserva[] }) {
  function hasActiveReserva(idx: number) {
    return (reservas ?? []).some(r => r.loungeIdx === idx && (r.status === 'reserva' || r.status === 'confirmada'));
  }

  function LoungeCell({ idx, extraClass }: { idx: number; extraClass?: string }) {
    const v    = lounges[idx] ?? 0;
    const pct  = v / SPACE_CONFIGS.lounge.max;
    const num  = SPACE_CONFIGS.lounge.start + idx;
    const reserva = hasActiveReserva(idx) && v === 0;
    const baseBg = reserva
      ? 'bg-blue-50 dark:bg-blue-900/30 border border-dashed border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400'
      : loungeBg(v, pct);
    return (
      <div className={clsx('relative rounded flex flex-col items-center justify-center py-2 text-center', baseBg, extraClass)}>
        <span className="text-[9px] leading-none opacity-60 font-medium">{num}</span>
        {reserva
          ? <span className="text-base font-bold leading-tight">📋</span>
          : <span className="text-2xl font-black leading-tight">{v}</span>
        }
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">🛋️ Lounges</p>
      <div className="flex flex-col gap-1">
        {[LOUNGE_GROUPS[0], LOUNGE_GROUPS[1]].map((group) => (
          <div key={group.label} className="flex gap-1 items-center">
            <LoungeLabel label={group.label} className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 w-16 shrink-0 leading-tight" />
            <div className="flex flex-1 gap-1">
              {group.ids.map((idx) => <LoungeCell key={idx} idx={idx} extraClass="flex-1" />)}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700" />
      <div className="flex items-start justify-between">
        <div className="flex gap-3 items-start">
          {[LOUNGE_GROUPS[2], LOUNGE_GROUPS[4]].map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <LoungeLabel label={group.label} className="text-[10px] font-semibold text-gray-500 dark:text-gray-400" />
              <div className="flex gap-1">
                {group.ids.map((idx) => <LoungeCell key={idx} idx={idx} extraClass="w-11" />)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1 items-end">
          <LoungeLabel label="Prime ★" className="text-[10px] font-semibold text-yellow-600" />
          <div className="flex gap-1">
            {LOUNGE_GROUPS[3].ids.map((idx) => <LoungeCell key={idx} idx={idx} extraClass="w-11 ring-1 ring-yellow-400" />)}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-gray-200 dark:bg-gray-600 inline-block"/>Livre</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-green-200 dark:bg-green-800 inline-block"/>Ocupado</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-red-200 dark:bg-red-800 inline-block"/>Cheio</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-blue-200 dark:bg-blue-800 inline-block"/>Reservado</span>
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

async function fetchCount(): Promise<number> {
  try {
    const r = await fetch('/api/portaria');
    if (!r.ok) return 0;
    const j = await r.json() as any;
    return clamp(Number(j.count ?? 0), 0, MAX);
  } catch { return 0; }
}

async function saveCount(value: number): Promise<void> {
  await fetch('/api/portaria', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ set: value }),
  });
}

// ── Botão com long-press ──────────────────────────────────────────────────────
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
      className="w-16 h-16 rounded-2xl bg-white border-2 border-gray-200 text-3xl font-light text-gray-700 active:bg-gray-100 select-none shadow-sm disabled:opacity-30"
      onPointerDown={(e) => { if (disabled) return; e.preventDefault(); start(); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {label}
    </button>
  );
}

export function Portaria() {
  const { avisos } = useAviso();
  const activeAvisos = avisos.filter(a => a.active && a.text.trim());

  const [count,   setCount]   = useState(0);
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [occ,     setOcc]     = useState<OccupancyState>(OCC_DEFAULT);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCount().then(c => { setCount(c); setLoading(false); });
    fetchOcc().then(setOcc);
    const id1 = setInterval(() => fetchCount().then(setCount), 30_000);
    const id2 = setInterval(() => fetchOcc().then(setOcc), 30_000);
    return () => { clearInterval(id1); clearInterval(id2); };
  }, []);

  const update = useCallback((next: number) => {
    setCount(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveCount(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 300);
  }, []);

  const pct  = count / MAX;
  const pctN = Math.round(pct * 100);
  const badgeColor = pct >= 0.9
    ? 'bg-red-100 text-red-700'
    : pct >= 0.6
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-green-100 text-green-700';

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
            <p className="text-xs text-gray-400 uppercase tracking-wider">Hibiscus Beach Club</p>
            <h1 className="text-base font-bold text-gray-900">Controle de Portaria</h1>
          </div>
          <div className={`text-xs font-medium px-3 py-1 rounded-full transition-all ${
            saved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}>
            {saved ? '✓ Salvo' : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        {/* Avisos */}
        {activeAvisos.length > 0 && (
          <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 flex flex-col gap-1">
            {activeAvisos.map((a, i) => (
              <p key={i} className="text-xs font-medium text-amber-800 flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">📢</span> {a.text}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 flex flex-col gap-4">

        {/* Contador de portaria */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">🚪 Portaria</p>
              <p className="text-xs text-gray-400">Entradas do dia · capacidade {MAX}</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>{pctN}%</span>
          </div>

          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pct >= 0.9 ? 'bg-red-500' : pct >= 0.6 ? 'bg-yellow-400' : 'bg-green-500'
              }`}
              style={{ width: `${pctN}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <StepBtn label="−" onClick={() => update(clamp(count - 1, 0, MAX))} disabled={count <= 0} />
            <div className="flex-1 text-center">
              <span className="text-5xl font-bold text-gray-900">{count}</span>
              <span className="text-lg text-gray-400 ml-1">/{MAX}</span>
            </div>
            <StepBtn label="+" onClick={() => update(clamp(count + 1, 0, MAX))} disabled={count >= MAX} />
          </div>

          {/* Atalhos de volume */}
          <div className="flex gap-2 pt-1">
            {[2, 5, 10].map(n => (
              <button
                key={n}
                onClick={() => update(clamp(count + n, 0, MAX))}
                disabled={count >= MAX}
                className="flex-1 py-3 rounded-2xl bg-gray-900 text-white text-sm font-bold active:bg-gray-700 disabled:opacity-30 select-none"
              >
                +{n}
              </button>
            ))}
          </div>
        </div>

        {/* Zerar */}
        <button
          onClick={async () => {
            const senha = window.prompt('Digite a senha para zerar:');
            if (senha === null) return;
            if (senha !== '@!$') { window.alert('Senha incorreta.'); return; }
            await fetch('/api/fluxo-snapshot', { method: 'POST' }).catch(() => {});
            update(0);
          }}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors"
        >
          Zerar
        </button>

        {/* Ocupação geral — somente leitura */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <p className="text-sm font-bold text-gray-800">🏖️ Ocupação Geral</p>
          <OccupancyRow label="Beach" current={occ.beach} max={SPACE_CONFIGS.beach.max} />
          <OccupancyRow label="Lounges" current={occ.lounges.reduce((a, b) => a + b, 0)} max={SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count} />
          <OccupancyRow label="Prime" current={occ.prime} max={SPACE_CONFIGS.prime.max} />
          <div className="border-t border-gray-100 pt-2">
            <LoungeMap lounges={occ.lounges} reservas={occ.reservasHoje} />
          </div>
        </div>

      </div>

      <div className="text-center py-6">
        <p className="text-[10px] text-gray-300 leading-tight">Desenvolvido por</p>
        <p className="text-[11px] font-bold text-gray-400 leading-tight">H8 Sistemas</p>
      </div>
    </div>
  );
}
