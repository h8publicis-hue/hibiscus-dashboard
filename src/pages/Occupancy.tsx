import clsx from 'clsx';
import { useRef, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { OccupancyState, SPACE_CONFIGS } from '../types';
import { OccupancyActions } from '../hooks/useOccupancy';

function useLongPress(callback: () => void) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const timerRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current)    { clearTimeout(timerRef.current);    timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    cbRef.current();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => cbRef.current(), 80);
    }, 400);
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); start(); },
    onTouchEnd: stop,
  };
}

interface OccupancyProps {
  occupancy: OccupancyState;
  actions: OccupancyActions;
}

interface CounterProps {
  name: string;
  current: number;
  max: number;
  onIncrement: () => void;
  onDecrement: () => void;
  compact?: boolean;
}

function occupancyColor(pct: number) {
  if (pct >= SPACE_CONFIGS.beach.alert)     return { bar: 'bg-red-500',    border: 'border-red-400',    text: 'text-red-600',    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
  if (pct >= SPACE_CONFIGS.beach.attention) return { bar: 'bg-yellow-400', border: 'border-yellow-400', text: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
  return                                           { bar: 'bg-green-500',  border: 'border-green-400',  text: 'text-green-600',  badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
}

function statusLabel(pct: number) {
  if (pct >= SPACE_CONFIGS.beach.alert)     return 'ALERTA';
  if (pct >= SPACE_CONFIGS.beach.attention) return 'ATENÇÃO';
  return 'DISPONÍVEL';
}

function OccupancyCounter({ name, current, max, onIncrement, onDecrement, compact }: CounterProps) {
  const pct = current / max;
  const colors = occupancyColor(pct);
  const pctDisplay = Math.round(pct * 100);

  const decPress = useLongPress(onDecrement);
  const incPress = useLongPress(onIncrement);

  if (compact) {
    return (
      <div className={clsx('bg-white dark:bg-gray-800 rounded-xl border-2 p-3 flex flex-col gap-2 transition-colors', colors.border)}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{name}</span>
          <span className={clsx('text-xs px-1.5 py-0.5 rounded font-bold', colors.badge)}>{pctDisplay}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={clsx('h-full rounded-full transition-all duration-300', colors.bar)} style={{ width: `${pctDisplay}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            {...decPress}
            disabled={current <= 0}
            className="flex-1 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-lg disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95 transition-all select-none"
          >−</button>
          <span className={clsx('text-base font-bold min-w-[2rem] text-center', colors.text)}>
            {current}<span className="text-xs text-gray-400 font-normal">/{max}</span>
          </span>
          <button
            {...incPress}
            disabled={current >= max}
            className="flex-1 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-lg disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95 transition-all select-none"
          >+</button>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('bg-white dark:bg-gray-800 rounded-2xl border-2 p-6 flex flex-col gap-4 transition-colors', colors.border)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white">{name}</h3>
        <span className={clsx('text-xs px-2 py-1 rounded-full font-bold tracking-wide', colors.badge)}>
          {statusLabel(pct)}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className={clsx('font-bold text-2xl', colors.text)}>{current} <span className="text-sm font-normal text-gray-400">/ {max} pessoas</span></span>
          <span className={clsx('text-lg font-bold', colors.text)}>{pctDisplay}%</span>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={clsx('h-full rounded-full transition-all duration-300', colors.bar)} style={{ width: `${pctDisplay}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>0</span>
          <span className="text-yellow-500">⚠ {Math.round(max * 0.6)}</span>
          <span className="text-red-500">🔴 {Math.round(max * 0.9)}</span>
          <span>{max}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          {...decPress}
          disabled={current <= 0}
          className="flex-1 py-5 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-3xl disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95 transition-all select-none"
        >−</button>
        <span className={clsx('text-4xl font-black min-w-[5rem] text-center', colors.text)}>{current}</span>
        <button
          {...incPress}
          disabled={current >= max}
          className="flex-1 py-5 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-3xl disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95 transition-all select-none"
        >+</button>
      </div>
    </div>
  );
}

export function Occupancy({ occupancy, actions }: OccupancyProps) {
  const totalLounge = occupancy.lounges.reduce((a, b) => a + b, 0);
  const totalMax    = SPACE_CONFIGS.beach.max + SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count + SPACE_CONFIGS.prime.max;
  const totalNow    = occupancy.beach + totalLounge + occupancy.prime;
  const totalPct    = Math.round((totalNow / totalMax) * 100);
  const totalColors = occupancyColor(totalNow / totalMax);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ocupação em Tempo Real</h2>
        <button
          onClick={actions.reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Zerar todos os contadores"
        >
          <RotateCcw size={13} />
          Zerar tudo
        </button>
      </div>

      {/* Total na casa */}
      <div className={clsx('rounded-2xl border-2 p-5 flex items-center justify-between', totalColors.border, 'bg-white dark:bg-gray-800')}>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total na Casa</p>
          <p className={clsx('text-4xl font-black', totalColors.text)}>
            {totalNow}
            <span className="text-lg font-normal text-gray-400 ml-2">/ {totalMax} pessoas</span>
          </p>
        </div>
        <div className="text-right">
          <span className={clsx('text-3xl font-black', totalColors.text)}>{totalPct}%</span>
          <p className="text-xs text-gray-400 mt-1">capacidade total</p>
        </div>
      </div>

      {/* Beach e Prime lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OccupancyCounter
          name="🏖️ Beach"
          current={occupancy.beach}
          max={SPACE_CONFIGS.beach.max}
          onIncrement={() => actions.setBeach(occupancy.beach + 1)}
          onDecrement={() => actions.setBeach(occupancy.beach - 1)}
        />
        <OccupancyCounter
          name="💎 Prime"
          current={occupancy.prime}
          max={SPACE_CONFIGS.prime.max}
          onIncrement={() => actions.setPrime(occupancy.prime + 1)}
          onDecrement={() => actions.setPrime(occupancy.prime - 1)}
        />
      </div>

      {/* Lounges */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">🛋️ Lounges</h3>
          <span className="text-xs text-gray-400">
            {totalLounge} / {SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count} ocupados
            · {SPACE_CONFIGS.lounge.count - occupancy.lounges.filter(l => l >= SPACE_CONFIGS.lounge.max).length} disponíveis
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {occupancy.lounges.map((count, idx) => (
            <OccupancyCounter
              key={idx}
              name={`L${idx + 1}`}
              current={count}
              max={SPACE_CONFIGS.lounge.max}
              onIncrement={() => actions.setLounge(idx, count + 1)}
              onDecrement={() => actions.setLounge(idx, count - 1)}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}
