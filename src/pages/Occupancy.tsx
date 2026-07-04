import clsx from 'clsx';
import { useRef, useCallback, useEffect, useState } from 'react';
import { RotateCcw, QrCode, X } from 'lucide-react';
import QRCode from 'qrcode';
import { OccupancyState, SPACE_CONFIGS } from '../types';
import { OccupancyActions } from '../hooks/useOccupancy';

const LOUNGE_GROUPS = [
  { label: 'Frente Mar', ids: [0, 2, 4, 6, 8, 10, 12] },
  { label: 'Atrás',      ids: [1, 3, 5, 7, 9, 11, 13] },
  { label: 'Anexo',      ids: [14] },
  { label: 'Gramado',    ids: [15, 16, 17] },
  { label: 'Prime ★',    ids: [18] },
] as const;

const LOUNGE_NAMES: Record<number, string> = {
  14: 'Anexo',
  15: 'Gramado 1',
  16: 'Gramado 2',
  17: 'Gramado 3',
  18: '★ Prime',
};

function loungeName(idx: number): string {
  return LOUNGE_NAMES[idx] ?? `${SPACE_CONFIGS.lounge.start + idx}`;
}

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

function QrModal({ path, title, onClose }: { path: string; title: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string>('');
  const url = window.location.origin + path;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 220, margin: 2 }).then(setDataUrl).catch(() => {});
  }, [url]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl flex flex-col items-center gap-4 max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>
        {dataUrl ? (
          <img src={dataUrl} alt="QR Code" className="rounded-lg w-[220px] h-[220px]" />
        ) : (
          <div className="w-[220px] h-[220px] bg-gray-100 rounded-lg animate-pulse" />
        )}
        <p className="text-xs text-gray-400 text-center">
          Escaneie com o celular para abrir o controle
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-600 hover:underline break-all text-center"
        >
          {url}
        </a>
      </div>
    </div>
  );
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
  selected?: boolean;
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

function OccupancyCounter({ name, current, max, onIncrement, onDecrement, compact, selected }: CounterProps) {
  const pct = current / max;
  const colors = occupancyColor(pct);
  const pctDisplay = Math.round(pct * 100);

  const decPress = useLongPress(onDecrement);
  const incPress = useLongPress(onIncrement);

  if (compact) {
    return (
      <div className={clsx(
        'bg-white dark:bg-gray-800 rounded-xl border-2 p-3 flex flex-col gap-2 transition-colors',
        selected ? 'border-brand-400 ring-2 ring-brand-400/40' : colors.border
      )}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{name}</span>
          <span className={clsx('text-xs px-1.5 py-0.5 rounded font-bold', colors.badge)}>{pctDisplay}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={clsx('h-full rounded-full transition-all duration-300', colors.bar)} style={{ width: `${pctDisplay}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
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

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg">
      {msg}
    </div>
  );
}


export function Occupancy({ occupancy, actions }: OccupancyProps) {
  const [showQr, setShowQr]               = useState<'entrada' | 'portaria' | null>(null);
  const [selectedLounge, setSelectedLounge] = useState<number | null>(null);
  const [toast, setToast]                 = useState<string | null>(null);

  const showToast = useCallback((msg: string) => { setToast(msg); }, []);
  const totalLounge = occupancy.lounges.reduce((a, b) => a + b, 0);
  const totalMax    = SPACE_CONFIGS.beach.max + SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count;
  const totalNow    = occupancy.beach + totalLounge;
  const totalPct    = Math.round((totalNow / totalMax) * 100);
  const totalColors = occupancyColor(totalNow / totalMax);

  return (
    <div className="p-6 space-y-6">
      {showQr === 'entrada'  && <QrModal path="/entrada"  title="Controle de Ocupação" onClose={() => setShowQr(null)} />}
      {showQr === 'portaria' && <QrModal path="/portaria" title="Controle de Portaria"  onClose={() => setShowQr(null)} />}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ocupação em Tempo Real</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQr('entrada')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors shadow-sm"
            title="Abrir QR code para celular/tablet"
          >
            <QrCode size={13} />
            Abrir controle
          </button>
          <button
            onClick={() => setShowQr('portaria')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-600 text-white hover:bg-slate-700 transition-colors shadow-sm"
            title="Abrir QR code da portaria"
          >
            <QrCode size={13} />
            Abrir portaria
          </button>
          <button
            onClick={actions.reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Zerar todos os contadores"
          >
            <RotateCcw size={13} />
            Zerar tudo
          </button>
        </div>
      </div>

      {/* Planilha ao vivo */}

      {/* Controle manual de lounges individuais */}
      <div className="flex items-center gap-2 pt-2">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Controle Manual — Lounges Individuais</span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Beach */}
      <OccupancyCounter
        name="🏖️ Beach"
        current={occupancy.beach}
        max={SPACE_CONFIGS.beach.max}
        onIncrement={() => actions.setBeach(occupancy.beach + 1)}
        onDecrement={() => actions.setBeach(occupancy.beach - 1)}
      />

      {/* Lounges — agrupados */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">🛋️ Lounges</h3>
          <span className="text-xs text-gray-400">
            {totalLounge} / {SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count} ocupados
            · {SPACE_CONFIGS.lounge.count - occupancy.lounges.filter(l => l >= SPACE_CONFIGS.lounge.max).length} disponíveis
          </span>
        </div>
        {selectedLounge !== null && (
          <p className="text-xs text-brand-400 mb-2 font-medium">
            Lounge {SPACE_CONFIGS.lounge.start + selectedLounge} selecionado
          </p>
        )}

        <div className="flex flex-col gap-3">
          {/* Frente Mar + Atrás: 2 fileiras de 7 */}
          {[LOUNGE_GROUPS[0], LOUNGE_GROUPS[1]].map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.label}</p>
              <div className="grid grid-cols-7 gap-1.5">
                {group.ids.map((idx) => {
                  const count = occupancy.lounges[idx];
                  const isSelected = selectedLounge === idx;
                  return (
                    <div key={idx} onClick={() => setSelectedLounge(prev => prev === idx ? null : idx)} className="cursor-pointer">
                      <OccupancyCounter
                        name={`${SPACE_CONFIGS.lounge.start + idx}`}
                        current={count}
                        max={SPACE_CONFIGS.lounge.max}
                        selected={isSelected}
                        onIncrement={() => { if (!isSelected) { showToast('Selecione o lounge antes'); return; } actions.setLounge(idx, count + 1); }}
                        onDecrement={() => { if (!isSelected) { showToast('Selecione o lounge antes'); return; } actions.setLounge(idx, count - 1); }}
                        compact
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Anexo + Gramado + Prime — grade de 7 colunas igual às fileiras acima */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Anexo · Gramado · <span className="text-yellow-400">Prime ★</span>
            </p>
            <div className="grid grid-cols-7 gap-1.5">
              {[...LOUNGE_GROUPS[2].ids, ...LOUNGE_GROUPS[3].ids, ...LOUNGE_GROUPS[4].ids].map((idx) => {
                const count = occupancy.lounges[idx];
                const isSelected = selectedLounge === idx;
                return (
                  <div key={idx} onClick={() => setSelectedLounge(prev => prev === idx ? null : idx)} className="cursor-pointer">
                    <OccupancyCounter
                      name={loungeName(idx)}
                      current={count}
                      max={SPACE_CONFIGS.lounge.max}
                      selected={isSelected}
                      onIncrement={() => { if (!isSelected) { showToast('Selecione o lounge antes'); return; } actions.setLounge(idx, count + 1); }}
                      onDecrement={() => { if (!isSelected) { showToast('Selecione o lounge antes'); return; } actions.setLounge(idx, count - 1); }}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
