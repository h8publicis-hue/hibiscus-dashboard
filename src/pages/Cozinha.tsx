import { useState, useEffect } from 'react';
import { Megaphone } from 'lucide-react';
import { OccupancyState, SPACE_CONFIGS } from '../types';
import { useAviso } from '../hooks/useAviso';

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
  } catch {
    return { beach: 0, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0), prime: 0, parceiros: 0, colaboradores: 0, loungeObs: Array(SPACE_CONFIGS.lounge.count).fill('') };
  }
}

function pctColor(pct: number) {
  if (pct >= 0.9) return { border: 'border-red-400',    bg: 'bg-red-50',    num: 'text-red-600',    badge: 'bg-red-100 text-red-700',    bar: 'bg-red-500'    };
  if (pct >= 0.6) return { border: 'border-yellow-400', bg: 'bg-yellow-50', num: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700', bar: 'bg-yellow-400' };
  return               { border: 'border-green-400',  bg: 'bg-green-50',  num: 'text-green-700',  badge: 'bg-green-100 text-green-700',  bar: 'bg-green-500'  };
}

function KitchenCard({
  emoji, label, value, max, sub, accent,
}: {
  emoji: string; label: string; value: number; max?: number; sub?: string;
  accent?: { border: string; bg: string; num: string; badge: string; bar: string };
}) {
  const pct    = max ? value / max : null;
  const colors = accent ?? { border: 'border-blue-300', bg: 'bg-blue-50', num: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', bar: 'bg-blue-400' };

  return (
    <div className={`rounded-2xl border-2 ${colors.border} ${colors.bg} p-5 flex flex-col items-center gap-2 flex-1`}>
      <span className="text-3xl">{emoji}</span>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest text-center">{label}</p>
      <p className={`text-[5.5rem] font-black tabular-nums leading-none ${colors.num}`}>{value}</p>
      {pct !== null && max && (
        <>
          <div className="w-full h-2 bg-black/10 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${colors.bar}`} style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }} />
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
            {Math.round(pct * 100)}% · de {max}
          </span>
        </>
      )}
      {sub && <p className="text-[10px] text-gray-400 text-center mt-0.5">{sub}</p>}
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hhmm = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ss   = time.toLocaleTimeString('pt-BR', { second: '2-digit' });
  const data = time.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div className="text-center">
      <div className="flex items-end justify-center gap-1">
        <span className="text-5xl font-black text-gray-800 tabular-nums leading-none">{hhmm}</span>
        <span className="text-2xl font-bold text-gray-400 tabular-nums leading-none mb-0.5">{ss}</span>
      </div>
      <p className="text-xs text-gray-400 capitalize mt-0.5">{data}</p>
    </div>
  );
}

export function Cozinha() {
  const [occ, setOcc]           = useState<OccupancyState | null>(null);
  const [ticker, setTicker]     = useState(0);
  const [fade, setFade]         = useState(true);
  const { avisos }              = useAviso();
  const activeAvisos            = avisos.filter(a => a.active && a.text.trim());

  useEffect(() => {
    const load = () => fetchOcc().then(d => setOcc(d));
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (activeAvisos.length <= 1) return;
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => { setTicker(t => (t + 1) % activeAvisos.length); setFade(true); }, 300);
    }, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAvisos.length]);

  const loungesTotal = occ ? occ.lounges.reduce((a, b) => a + b, 0) : 0;
  const loungesMax   = SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count;
  const refeitorio   = occ ? (occ.colaboradores ?? 0) + (occ.parceiros ?? 0) : 0;
  const currentAviso = activeAvisos[ticker % Math.max(activeAvisos.length, 1)];

  // Horário do refeitório: 11h–15h (BRT)
  const REFEITORIO_OPEN  = 11;
  const REFEITORIO_CLOSE = 15;
  const nowBRT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Recife' }));
  const nowH   = nowBRT.getHours() + nowBRT.getMinutes() / 60;
  const refeitorioAberto = nowH >= REFEITORIO_OPEN && nowH < REFEITORIO_CLOSE;
  const refeitorioProgresso = refeitorioAberto
    ? Math.min(100, Math.round(((nowH - REFEITORIO_OPEN) / (REFEITORIO_CLOSE - REFEITORIO_OPEN)) * 100))
    : 0;
  const minutosParaAbrir  = refeitorioAberto ? 0 : Math.round((REFEITORIO_OPEN - nowH) * 60);
  const minutosParaFechar = refeitorioAberto ? Math.round((REFEITORIO_CLOSE - nowH) * 60) : 0;

  const beachColors  = occ ? pctColor(occ.beach / SPACE_CONFIGS.beach.max) : undefined;
  const loungeColors = occ ? pctColor(loungesTotal / loungesMax)             : undefined;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍳</span>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Hibiscus Beach Club</p>
            <h1 className="text-base font-black text-gray-900 leading-tight">Cozinha — Ocupação</h1>
          </div>
        </div>

        {/* Relógio */}
        <Clock />

        <div className="flex flex-col items-end gap-0.5">
        <img src="/logo.png" alt="Hibiscus Beach Club" className="h-7 object-contain" />
        <p className="text-[9px] text-gray-300 hidden lg:block">↺ atualiza a cada 10s</p>
      </div>
      </div>

      {/* Banner comunicados */}
      {activeAvisos.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
          <Megaphone size={14} className="text-amber-500 shrink-0" />
          <p
            className="flex-1 text-sm text-amber-800 font-medium leading-snug text-center transition-opacity duration-300"
            style={{ opacity: fade ? 1 : 0 }}
          >
            {currentAviso?.text}
          </p>
          {activeAvisos.length > 1 && (
            <span className="text-[10px] text-amber-400 font-medium shrink-0">
              {(ticker % activeAvisos.length) + 1}/{activeAvisos.length}
            </span>
          )}
        </div>
      )}

      {/* Cards — horizontal no desktop, vertical no mobile */}
      {!occ ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm animate-pulse">Carregando...</p>
        </div>
      ) : (
        <div className="flex-1 p-4 flex flex-col lg:flex-row gap-4 max-w-6xl mx-auto w-full items-stretch">
          <KitchenCard
            emoji="🏖️"
            label="Espaço Beach"
            value={occ.beach}
            max={SPACE_CONFIGS.beach.max}
            accent={beachColors}
          />
          <KitchenCard
            emoji="🛋️"
            label="Espaço Lounge"
            value={loungesTotal}
            max={loungesMax}
            accent={loungeColors}
          />
          {/* Refeitório */}
          <div className={`rounded-2xl border-2 p-5 flex flex-col items-center gap-2 flex-1 ${refeitorioAberto ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
            <span className="text-3xl">🍽️</span>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Refeitório</p>

            {/* Badge de status */}
            {refeitorioAberto ? (
              <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-0.5 rounded-full">
                ● Aberto · fecha em {minutosParaFechar}min
              </span>
            ) : (
              <span className="text-xs font-bold bg-gray-200 text-gray-500 px-3 py-0.5 rounded-full">
                ○ Encerrado · {minutosParaAbrir > 0 ? `abre em ${minutosParaAbrir}min` : 'abre às 11h'}
              </span>
            )}

            <p className={`text-[5.5rem] font-black tabular-nums leading-none ${refeitorioAberto ? 'text-blue-700' : 'text-gray-400'}`}>{refeitorio}</p>
            <p className="text-sm text-gray-400 -mt-1">Previsão de ocupação do refeitório</p>

            {/* Barra de progresso do período */}
            <div className="w-full flex flex-col gap-1 mt-1">
              <div className="w-full h-2.5 bg-black/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${refeitorioAberto ? 'bg-blue-500' : 'bg-gray-300'}`}
                  style={{ width: `${refeitorioProgresso}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>11h</span>
                <span>{refeitorioAberto ? `${refeitorioProgresso}% do período` : '—'}</span>
                <span>15h</span>
              </div>
            </div>

            <div className="flex gap-4 mt-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${refeitorioAberto ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                👷 {occ.colaboradores ?? 0} colab.
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${refeitorioAberto ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                🤝 {occ.parceiros ?? 0} parceiros
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div className="text-center py-3 border-t border-gray-200">
        <p className="text-[9px] text-gray-300 leading-tight">Desenvolvido por</p>
        <p className="text-[11px] font-bold text-gray-400 leading-tight">H8 Publicis</p>
      </div>
    </div>
  );
}
