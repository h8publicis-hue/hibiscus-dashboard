import { useState, useEffect, useRef, useCallback } from 'react';
import { useAviso } from '../hooks/useAviso';

const MAX = 1000; // capacidade máxima do clube

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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCount().then(c => { setCount(c); setLoading(false); });
    const id = setInterval(() => fetchCount().then(setCount), 30_000);
    return () => clearInterval(id);
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

      </div>

      <div className="text-center py-6">
        <p className="text-[10px] text-gray-300 leading-tight">Desenvolvido por</p>
        <p className="text-[11px] font-bold text-gray-400 leading-tight">H8 Sistemas</p>
      </div>
    </div>
  );
}
