import { useState, useEffect, useRef, useCallback } from 'react';
import { OccupancyState, SPACE_CONFIGS } from '../types';

const DEFAULT: OccupancyState = { beach: 0, lounges: Array(14).fill(0), prime: 0 };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

async function fetchOcc(): Promise<OccupancyState> {
  try {
    const r = await fetch('/api/ocupacao');
    if (!r.ok) throw new Error();
    const d = await r.json() as Partial<OccupancyState>;
    return {
      beach:   clamp(d.beach ?? 0, 0, 500),
      lounges: Array(14).fill(0).map((_, i) => clamp(d.lounges?.[i] ?? 0, 0, 10)),
      prime:   clamp(d.prime ?? 0, 0, 10),
    };
  } catch { return { ...DEFAULT, lounges: Array(14).fill(0) }; }
}

async function saveOcc(state: OccupancyState) {
  await fetch('/api/ocupacao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
}

// ── Botão com long-press para incremento/decremento rápido ───────────────────
function StepBtn({ label, onClick }: { label: string; onClick: () => void }) {
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current)    { clearTimeout(timerRef.current);    timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    onClick();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(onClick, 80);
    }, 400);
  }, [onClick]);

  return (
    <button
      className="w-16 h-16 rounded-2xl bg-white border-2 border-gray-200 text-3xl font-light text-gray-700 active:bg-gray-100 select-none shadow-sm"
      onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}
      onTouchStart={(e) => { e.preventDefault(); start(); }} onTouchEnd={stop}
    >
      {label}
    </button>
  );
}

// ── Contador individual ───────────────────────────────────────────────────────
function Counter({
  label, sublabel, value, max, color,
  onInc, onDec,
}: {
  label: string; sublabel?: string; value: number; max: number; color: string;
  onInc: () => void; onDec: () => void;
}) {
  const pct  = value / max;
  const pctN = Math.round(pct * 100);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-800">{label}</p>
          {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{pctN}%</span>
      </div>

      {/* Barra de progresso */}
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            pct >= 0.9 ? 'bg-red-500' : pct >= 0.6 ? 'bg-yellow-400' : 'bg-green-500'
          }`}
          style={{ width: `${pctN}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <StepBtn label="−" onClick={onDec} />
        <div className="flex-1 text-center">
          <span className="text-5xl font-bold text-gray-900">{value}</span>
          <span className="text-lg text-gray-400 ml-1">/{max}</span>
        </div>
        <StepBtn label="+" onClick={onInc} />
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export function OccupancyInput() {
  const [occ, setOcc]         = useState<OccupancyState>({ ...DEFAULT, lounges: Array(14).fill(0) });
  const [saved, setSaved]     = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchOcc().then(d => { setOcc(d); setLoading(false); });
    const id = setInterval(() => fetchOcc().then(setOcc), 30_000);
    return () => clearInterval(id);
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

  const totalLounges = occ.lounges.reduce((a, b) => a + b, 0);
  const maxLounges   = SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count;
  const pctLounge    = totalLounges / maxLounges;
  const pctBeach     = occ.beach / SPACE_CONFIGS.beach.max;
  const pctPrime     = occ.prime / SPACE_CONFIGS.prime.max;

  const badgeColor = (pct: number) =>
    pct >= 0.9 ? 'bg-red-100 text-red-700' : pct >= 0.6 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';

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
            <h1 className="text-base font-bold text-gray-900">Controle de Ocupação</h1>
          </div>
          <div className={`text-xs font-medium px-3 py-1 rounded-full transition-all ${
            saved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}>
            {saved ? '✓ Salvo' : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 flex flex-col gap-4">

        {/* Beach */}
        <Counter
          label="🏖️ Beach"
          sublabel={`Capacidade total: ${SPACE_CONFIGS.beach.max} pessoas`}
          value={occ.beach}
          max={SPACE_CONFIGS.beach.max}
          color={badgeColor(pctBeach)}
          onInc={() => update({ ...occ, beach: clamp(occ.beach + 1, 0, SPACE_CONFIGS.beach.max) })}
          onDec={() => update({ ...occ, beach: clamp(occ.beach - 1, 0, SPACE_CONFIGS.beach.max) })}
        />

        {/* Lounges */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">🛋️ Lounges</p>
              <p className="text-xs text-gray-400">{SPACE_CONFIGS.lounge.count} lounges · {SPACE_CONFIGS.lounge.max} espreguiçadeiras cada</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor(pctLounge)}`}>
              {Math.round(pctLounge * 100)}%
            </span>
          </div>

          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pctLounge >= 0.9 ? 'bg-red-500' : pctLounge >= 0.6 ? 'bg-yellow-400' : 'bg-green-500'
              }`}
              style={{ width: `${Math.round(pctLounge * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <StepBtn label="−" onClick={() => {
              const lounges = [...occ.lounges];
              const idx = [...lounges].reverse().findIndex(v => v > 0);
              if (idx >= 0) { lounges[lounges.length - 1 - idx]--; update({ ...occ, lounges }); }
            }} />
            <div className="flex-1 text-center">
              <span className="text-5xl font-bold text-gray-900">{totalLounges}</span>
              <span className="text-lg text-gray-400 ml-1">/{maxLounges}</span>
            </div>
            <StepBtn label="+" onClick={() => {
              const lounges = [...occ.lounges];
              const idx = lounges.findIndex(v => v < SPACE_CONFIGS.lounge.max);
              if (idx >= 0) { lounges[idx]++; update({ ...occ, lounges }); }
            }} />
          </div>

          {/* Grade dos lounges individuais */}
          <div className="grid grid-cols-7 gap-1.5 pt-1">
            {occ.lounges.map((v, i) => {
              const p = v / SPACE_CONFIGS.lounge.max;
              return (
                <button key={i}
                  onClick={() => {
                    const lounges = [...occ.lounges];
                    lounges[i] = v >= SPACE_CONFIGS.lounge.max ? 0 : v + 1;
                    update({ ...occ, lounges });
                  }}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] font-bold border-2 transition-colors ${
                    p >= 0.9 ? 'bg-red-100 border-red-300 text-red-700' :
                    p >= 0.6 ? 'bg-yellow-100 border-yellow-300 text-yellow-700' :
                    p > 0    ? 'bg-green-100 border-green-300 text-green-700' :
                               'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <span className="text-[9px] opacity-60">L{i + 1}</span>
                  <span>{v}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prime */}
        <Counter
          label="💎 Prime"
          sublabel={`Capacidade: ${SPACE_CONFIGS.prime.max} espreguiçadeiras`}
          value={occ.prime}
          max={SPACE_CONFIGS.prime.max}
          color={badgeColor(pctPrime)}
          onInc={() => update({ ...occ, prime: clamp(occ.prime + 1, 0, SPACE_CONFIGS.prime.max) })}
          onDec={() => update({ ...occ, prime: clamp(occ.prime - 1, 0, SPACE_CONFIGS.prime.max) })}
        />

        {/* Zerar tudo */}
        <button
          onClick={() => {
            if (window.confirm('Zerar todos os contadores?')) {
              update({ beach: 0, lounges: Array(14).fill(0), prime: 0 });
            }
          }}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors"
        >
          Zerar tudo
        </button>

      </div>
    </div>
  );
}
