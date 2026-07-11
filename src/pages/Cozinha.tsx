import { useState, useEffect } from 'react';
import { OccupancyState, SPACE_CONFIGS } from '../types';

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
    };
  } catch {
    return { beach: 0, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0), prime: 0, parceiros: 0, colaboradores: 0 };
  }
}

function KitchenCard({
  emoji, label, value, sub, accent,
}: {
  emoji: string; label: string; value: number | string; sub?: string; accent: string;
}) {
  return (
    <div className={`rounded-2xl border-2 ${accent} p-6 flex flex-col items-center gap-2 bg-white`}>
      <span className="text-4xl">{emoji}</span>
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest">{label}</p>
      <p className="text-8xl font-black text-gray-900 tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function Cozinha() {
  const [occ, setOcc]         = useState<OccupancyState | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    const load = () => fetchOcc().then(d => { setOcc(d); setLastUpdate(new Date()); });
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const loungesTotal = occ ? occ.lounges.reduce((a, b) => a + b, 0) : 0;
  const refeitorio   = occ ? (occ.colaboradores ?? 0) + (occ.parceiros ?? 0) : 0;

  const hora = lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Hibiscus Beach Club</p>
          <h1 className="text-lg font-black text-gray-900">🍳 Cozinha — Ocupação</h1>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Atualizado</p>
          <p className="text-sm font-bold text-gray-600">{hora}</p>
        </div>
      </div>

      {/* Cards */}
      {!occ ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm animate-pulse">Carregando...</p>
        </div>
      ) : (
        <div className="flex-1 p-4 grid grid-cols-1 gap-4 max-w-lg mx-auto w-full">
          <KitchenCard
            emoji="🏖️"
            label="Espaço Beach"
            value={occ.beach}
            sub={`de ${SPACE_CONFIGS.beach.max} capacidade`}
            accent="border-orange-300"
          />
          <KitchenCard
            emoji="🛋️"
            label="Espaço Lounge"
            value={loungesTotal}
            sub={`de ${SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count} capacidade`}
            accent="border-purple-300"
          />
          <div className={`rounded-2xl border-2 border-blue-300 p-6 flex flex-col items-center gap-2 bg-white`}>
            <span className="text-4xl">🍽️</span>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Refeitório</p>
            <p className="text-8xl font-black text-gray-900 tabular-nums leading-none">{refeitorio}</p>
            <div className="flex gap-4 mt-1">
              <span className="text-xs text-gray-400">👷 {occ.colaboradores ?? 0} colaboradores</span>
              <span className="text-xs text-gray-400">🤝 {occ.parceiros ?? 0} parceiros</span>
            </div>
          </div>
        </div>
      )}

      {/* Auto-refresh indicator */}
      <div className="text-center py-3">
        <p className="text-[10px] text-gray-300">Atualiza automaticamente a cada 30s</p>
      </div>
    </div>
  );
}
