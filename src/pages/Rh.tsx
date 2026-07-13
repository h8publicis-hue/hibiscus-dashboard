import { useState, useEffect, useRef, useCallback } from 'react';
import { OccupancyState, SPACE_CONFIGS } from '../types';

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

export function Rh() {
  const [occ, setOcc]         = useState<OccupancyState>({ ...DEFAULT, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0) });
  const [saved, setSaved]     = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            <h1 className="text-base font-bold text-gray-900">Colaboradores do Dia</h1>
          </div>
          <div className={`text-xs font-medium px-3 py-1 rounded-full transition-all ${
            saved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}>
            {saved ? '✓ Salvo' : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-8 flex flex-col items-center gap-6">

        {/* Data */}
        <p className="text-sm text-gray-400 capitalize">{hoje}</p>

        {/* Card contador */}
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

          <p className="text-xs text-gray-300">
            Toque e segure +/− para alterar rapidamente
          </p>
        </div>

        {/* Zerar */}
        <button
          onClick={() => {
            if (window.confirm('Zerar o contador de colaboradores?')) {
              update({ ...occ, colaboradores: 0 });
            }
          }}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors"
        >
          Zerar colaboradores
        </button>

        {/* Info refeitório */}
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

      <div className="text-center py-8">
        <p className="text-[10px] text-gray-300 leading-tight">Desenvolvido por</p>
        <p className="text-[11px] font-bold text-gray-400 leading-tight">H8 Publicis</p>
      </div>
    </div>
  );
}
