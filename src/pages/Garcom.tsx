import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapPin, X, LogOut, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { useBeachTables, MesaEstado, MesaConfig, AREAS, AREA_COLORS } from '../hooks/useBeachTables';
import { useOccupancy } from '../hooks/useOccupancy';
import mapaImg from '../assets/mapa-hibiscus-beach.webp';

const PIN_KEY     = 'hibiscus-garcom-auth';
const CORRECT_PIN = '12345';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTempo(horaOcupacao: string | null): string {
  if (!horaOcupacao) return '';
  const mins = Math.floor((Date.now() - new Date(horaOcupacao).getTime()) / 60000);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

function fmtHora(horaOcupacao: string | null): string {
  if (!horaOcupacao) return '';
  return new Date(horaOcupacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Portaria polling ──────────────────────────────────────────────────────────

function usePortaria() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/portaria')
        .then(r => r.json())
        .then((j: any) => { if (!cancelled) setCount(Number(j.count ?? 0)); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return count;
}

// ── PIN screen ────────────────────────────────────────────────────────────────

function PinScreen({ onAuth }: { onAuth: () => void }) {
  const [pin, setPin]   = useState('');
  const [erro, setErro] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length >= 5) return;
    const next = pin + d;
    setPin(next);
    setErro(false);
    if (next.length === 5) {
      if (next === CORRECT_PIN) { sessionStorage.setItem(PIN_KEY, '1'); onAuth(); }
      else setTimeout(() => { setPin(''); setErro(true); }, 300);
    }
  };

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-900/40">
          <MapPin size={28} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">Mapa Beach</h1>
        <p className="text-sm text-white/40 mt-1">Digite o PIN para entrar</p>
      </div>

      <div className="flex gap-3 mb-8">
        {[0,1,2,3,4].map(i => (
          <div key={i} className={clsx(
            'w-4 h-4 rounded-full border-2 transition-all duration-150',
            pin.length > i
              ? erro ? 'bg-red-400 border-red-400' : 'bg-emerald-500 border-emerald-500'
              : 'bg-transparent border-white/20',
          )} />
        ))}
      </div>

      {erro && <p className="text-xs text-red-400 mb-4 -mt-4">PIN incorreto, tente novamente</p>}

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {digits.map((d, i) => (
          d === '' ? <div key={i} /> :
          d === '⌫' ? (
            <button key={i} onClick={() => setPin(p => p.slice(0, -1))}
              className="h-14 rounded-2xl bg-white/10 text-white/60 text-xl font-medium flex items-center justify-center active:bg-white/20 transition-colors">
              ⌫
            </button>
          ) : (
            <button key={i} onClick={() => handleDigit(d)}
              className="h-14 rounded-2xl bg-white/10 text-white text-xl font-semibold active:bg-white/20 transition-colors">
              {d}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

// ── Modal da Mesa ─────────────────────────────────────────────────────────────

function MesaModal({
  numero, estado, onClose, onOcupar, onLiberar,
}: {
  numero: string;
  estado: MesaEstado | undefined;
  onClose: () => void;
  onOcupar: (n: string, c: number) => void;
  onLiberar: (n: string) => void;
}) {
  const [confirmLiberar, setConfirmLiberar] = useState(false);
  const status = estado?.status ?? 'livre';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-800 rounded-t-3xl shadow-xl w-full max-w-sm p-6 z-10 pb-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <MapPin size={20} className="text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Mesa {numero.replace(/^0+/, '')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-white/10 text-white/50">
            <X size={18} />
          </button>
        </div>

        <div className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-5',
          status === 'ocupada' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400',
        )}>
          <span className={clsx('w-2 h-2 rounded-full', status === 'ocupada' ? 'bg-red-500' : 'bg-emerald-500')} />
          {status === 'ocupada' ? 'OCUPADA' : 'LIVRE'}
        </div>

        {status === 'ocupada' ? (
          <>
            {estado?.horaOcupacao && (
              <div className="bg-white/5 rounded-xl p-3 mb-5 text-sm space-y-1">
                <div className="flex justify-between text-white/50">
                  <span>Ocupada desde</span>
                  <span className="font-medium text-white/80">{fmtHora(estado.horaOcupacao)}</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>Tempo na mesa</span>
                  <span className="font-medium text-white/80">{fmtTempo(estado.horaOcupacao)}</span>
                </div>
              </div>
            )}
            {!confirmLiberar ? (
              <button onClick={() => setConfirmLiberar(true)}
                className="w-full py-3.5 rounded-2xl bg-red-500 text-white text-base font-bold active:bg-red-600 transition-colors">
                Liberar mesa
              </button>
            ) : (
              <div className="border border-red-500/30 rounded-2xl p-4 text-center space-y-3">
                <p className="text-sm font-medium text-white/70">Confirmar liberação?</p>
                <div className="flex gap-2">
                  <button onClick={() => { onLiberar(numero); onClose(); }}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold active:bg-red-600">Sim</button>
                  <button onClick={() => setConfirmLiberar(false)}
                    className="flex-1 py-3 rounded-xl bg-white/10 text-white/70 font-bold active:bg-white/20">Não</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <button onClick={() => { onOcupar(numero, 0); onClose(); }}
            className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white text-base font-bold active:bg-emerald-600 transition-colors">
            Ocupar mesa
          </button>
        )}
      </div>
    </div>
  );
}

// ── Marcador readonly no mapa ─────────────────────────────────────────────────

function MapaDot({ mesa, estado, size, onPress }: { mesa: MesaConfig; estado: MesaEstado | undefined; size: number; onPress: () => void }) {
  const status = estado?.status ?? 'livre';
  return (
    <button
      onClick={onPress}
      style={{ left: `${mesa.x}%`, top: `${mesa.y}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2"
    >
      <div
        style={{ width: size, height: size, fontSize: Math.max(6, Math.round(size * 0.38)) }}
        className={clsx(
          'rounded-full flex items-center justify-center font-bold text-white leading-none shadow active:scale-110 transition-transform',
          status === 'ocupada' ? 'bg-red-500' : 'bg-emerald-500',
        )}
      >
        {mesa.numero.replace(/^0+/, '')}
      </div>
    </button>
  );
}

// ── GarcomApp ─────────────────────────────────────────────────────────────────

function GarcomApp() {
  const [searchParams] = useSearchParams();
  const { tables, estado, markerSize, ocuparMesa, liberarMesa } = useBeachTables();
  const [occupancy] = useOccupancy();
  const portaria    = usePortaria();

  const [modal, setModal]   = useState<string | null>(null);
  const [irMesa, setIrMesa] = useState('');
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [dotSize, setDotSize] = useState<number>(() => {
    try { return Number(localStorage.getItem('garcom-dot-size') ?? '12') || 12; } catch { return 12; }
  });
  const containerRef = useRef<HTMLDivElement>(null!);
  const inputRef     = useRef<HTMLInputElement>(null);

  const changeDotSize = (delta: number) => {
    setDotSize(prev => {
      const next = Math.max(8, Math.min(20, prev + delta));
      try { localStorage.setItem('garcom-dot-size', String(next)); } catch { /* */ }
      return next;
    });
  };

  useEffect(() => {
    const m = searchParams.get('mesa');
    if (m) setModal(m.padStart(3, '0'));
  }, [searchParams]);

  const handleIrMesa = useCallback(() => {
    const n = irMesa.trim().replace(/^0+/, '');
    if (!n) return;
    const found = tables.find(t => t.numero.replace(/^0+/, '') === n);
    if (found) { setModal(found.numero); setIrMesa(''); inputRef.current?.blur(); }
  }, [irMesa, tables]);

  const handleLogout = () => { sessionStorage.removeItem(PIN_KEY); window.location.reload(); };

  // Stats
  const loungesTotal = occupancy.lounges.reduce((a, b) => a + b, 0);
  const naCasa       = occupancy.beach + loungesTotal;
  const gap          = portaria !== null ? Math.max(0, portaria - naCasa) : null;
  const ocupadas     = Object.values(estado).filter(e => e.status === 'ocupada').length;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col pb-6">

      {/* Header */}
      <header className="bg-gray-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center shadow">
            <MapPin size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Mapa Beach</p>
            <p className="text-[10px] text-white/40 leading-tight">{ocupadas} ocupadas · {tables.length - ocupadas} livres</p>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 rounded-xl text-white/40 active:bg-white/10">
          <LogOut size={18} />
        </button>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-4">

        {/* Clube */}
        <div className="bg-gray-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Portaria',  value: portaria ?? '—', color: 'text-white' },
            { label: 'Na Casa',   value: naCasa,          color: 'text-blue-300' },
            { label: 'GAP',       value: gap ?? '—',      color: gap && gap > 0 ? 'text-red-400' : 'text-white/30' },
            { label: 'Parceiros', value: occupancy.parceiros, color: 'text-yellow-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <p className="text-[10px] text-white/40 uppercase tracking-wide">{label}</p>
              <span className={clsx('text-2xl font-black tabular-nums leading-none', color)}>{value}</span>
            </div>
          ))}
        </div>

        {/* Áreas */}
        {AREAS.some(a => tables.some(t => t.area === a)) && (
          <div className="bg-gray-800 rounded-2xl p-4 flex flex-col gap-2.5">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Áreas</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {AREAS.map(area => {
                const mesas = tables.filter(t => t.area === area);
                const total = mesas.length;
                if (total === 0) return null;
                const ocup = mesas.filter(t => estado[t.numero]?.status === 'ocupada').length;
                const pct  = Math.round((ocup / total) * 100);
                return (
                  <div key={area} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: AREA_COLORS[area].dot }} />
                        <p className="text-[9px] text-white/60 truncate leading-none">{area}</p>
                      </div>
                      <span className="text-[10px] font-bold text-white/80 tabular-nums shrink-0">{ocup}/{total} <span className="text-white/40">{pct}%</span></span>
                    </div>
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: AREA_COLORS[area].dot }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Campo grande de mesa */}
        <div className="bg-gray-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Número da mesa</p>
          <div className="flex gap-2 w-full">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={irMesa}
              onChange={e => setIrMesa(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleIrMesa()}
              placeholder="Ex: 42"
              className="min-w-0 flex-1 text-2xl font-black text-white bg-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-white/20"
            />
            <button
              onClick={handleIrMesa}
              className="shrink-0 w-14 rounded-xl bg-emerald-500 text-white font-bold active:bg-emerald-600 transition-colors flex items-center justify-center"
            >
              <ArrowRight size={22} />
            </button>
          </div>
        </div>

        {/* Mapa */}
        <div className="bg-gray-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Mapa</p>
            <div className="flex items-center gap-1">
              <button onClick={() => changeDotSize(-2)}
                className="w-6 h-6 rounded-lg bg-white/10 text-white/60 text-sm font-bold flex items-center justify-center active:bg-white/20">−</button>
              <span className="text-[9px] text-white/30 tabular-nums w-7 text-center">{dotSize}px</span>
              <button onClick={() => changeDotSize(2)}
                className="w-6 h-6 rounded-lg bg-white/10 text-white/60 text-sm font-bold flex items-center justify-center active:bg-white/20">+</button>
            </div>
          </div>
          <div className="flex items-center justify-center bg-gray-900/50 px-2 pb-3">
            <div
              ref={containerRef}
              style={{
                position: 'relative',
                ...(imgAspect
                  ? { aspectRatio: String(imgAspect), width: '100%' }
                  : { width: '100%', paddingBottom: '66%' }),
              }}
            >
              <img
                src={mapaImg}
                alt="Mapa Beach"
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain select-none"
                onLoad={e => {
                  const img = e.currentTarget;
                  setImgAspect(img.naturalWidth / img.naturalHeight);
                }}
              />
              {tables.map(mesa => (
                <MapaDot
                  key={mesa.numero}
                  mesa={mesa}
                  estado={estado[mesa.numero]}
                  size={dotSize}
                  onPress={() => setModal(mesa.numero)}
                />
              ))}
            </div>
          </div>
        </div>

      </div>

      {modal && (
        <MesaModal
          numero={modal}
          estado={estado[modal]}
          onClose={() => setModal(null)}
          onOcupar={ocuparMesa}
          onLiberar={liberarMesa}
        />
      )}
    </div>
  );
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export function Garcom() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(PIN_KEY) === '1');
  if (!authed) return <PinScreen onAuth={() => setAuthed(true)} />;
  return <GarcomApp />;
}
