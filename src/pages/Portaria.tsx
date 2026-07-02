import { useState, useEffect, useRef, useCallback } from 'react';

async function fetchCount(): Promise<number> {
  try {
    const r = await fetch('/api/portaria');
    if (!r.ok) return 0;
    const j = await r.json() as any;
    return Number(j.count ?? 0);
  } catch { return 0; }
}

async function postDelta(delta: number): Promise<number> {
  try {
    const r = await fetch('/api/portaria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta }),
    });
    const j = await r.json() as any;
    return Number(j.count ?? 0);
  } catch { return 0; }
}

async function postSet(value: number): Promise<number> {
  try {
    const r = await fetch('/api/portaria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set: value }),
    });
    const j = await r.json() as any;
    return Number(j.count ?? 0);
  } catch { return 0; }
}

// Botão com long-press
function BigBtn({
  label, color, onClick, disabled,
}: { label: string; color: string; onClick: () => void; disabled?: boolean }) {
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current)    { clearTimeout(timerRef.current);    timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    if (disabled) return;
    onClick();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(onClick, 100);
    }, 500);
  }, [onClick, disabled]);

  return (
    <button
      disabled={disabled}
      className={`flex-1 h-20 rounded-2xl text-white text-3xl font-bold select-none active:opacity-80 disabled:opacity-30 shadow-md ${color}`}
      onPointerDown={e => { e.preventDefault(); start(); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {label}
    </button>
  );
}

export function Portaria() {
  const [count,   setCount]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [flash,   setFlash]   = useState<'in' | 'out' | null>(null);
  const pendingRef = useRef<number>(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCount().then(c => { setCount(c); setLoading(false); });
    const id = setInterval(() => fetchCount().then(setCount), 20_000);
    return () => clearInterval(id);
  }, []);

  // Agrupa os deltas e envia um único POST após 400ms de inatividade
  const applyDelta = useCallback((delta: number) => {
    pendingRef.current += delta;
    setCount(c => Math.max(0, c + delta));
    setFlash(delta > 0 ? 'in' : 'out');
    setTimeout(() => setFlash(null), 600);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const d = pendingRef.current;
      pendingRef.current = 0;
      const actual = await postDelta(d);
      setCount(actual);
    }, 400);
  }, []);

  const handleZerar = () => {
    const senha = window.prompt('Senha para zerar:');
    if (senha === null) return;
    if (senha !== '@!$') { window.alert('Senha incorreta.'); return; }
    postSet(0).then(c => setCount(c));
  };

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const bgFlash = flash === 'in'
    ? 'bg-green-50'
    : flash === 'out'
    ? 'bg-red-50'
    : 'bg-gray-50';

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${bgFlash}`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-sm mx-auto px-4 py-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Hibiscus Beach Club</p>
          <h1 className="text-base font-bold text-gray-900">Controle de Portaria</h1>
          <p className="text-xs text-gray-400 capitalize">{today}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 max-w-sm mx-auto w-full">

        {/* Contador principal */}
        <div className="text-center">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Total do dia</p>
          {loading ? (
            <div className="w-32 h-24 bg-gray-200 rounded-2xl animate-pulse mx-auto" />
          ) : (
            <span className="text-[96px] font-black text-gray-900 leading-none tabular-nums">
              {count}
            </span>
          )}
        </div>

        {/* Botões de entrada rápida */}
        <div className="w-full flex flex-col gap-3">
          <div className="flex gap-3">
            <BigBtn label="+1"  color="bg-green-500" onClick={() => applyDelta(1)}  disabled={loading} />
            <BigBtn label="+5"  color="bg-green-600" onClick={() => applyDelta(5)}  disabled={loading} />
            <BigBtn label="+10" color="bg-green-700" onClick={() => applyDelta(10)} disabled={loading} />
          </div>
          <div className="flex gap-3">
            <BigBtn label="−1" color="bg-red-400" onClick={() => applyDelta(-1)} disabled={loading || count === 0} />
            <BigBtn label="−5" color="bg-red-500" onClick={() => applyDelta(-5)} disabled={loading || count === 0} />
          </div>
        </div>

        {/* Zerar */}
        <button
          onClick={handleZerar}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors"
        >
          Zerar (senha)
        </button>
      </div>

      <div className="text-center py-4">
        <p className="text-[10px] text-gray-300">Desenvolvido por <span className="font-semibold text-gray-400">H8 Sistemas</span></p>
      </div>
    </div>
  );
}
