import { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { useBeachTables, MesaConfig, MesaEstado } from '../hooks/useBeachTables';
import { useOccupancy } from '../hooks/useOccupancy';
import mapaImg from '../assets/mapa-hibiscus-beach.webp';

// ── Portaria polling (igual ao Overview) ─────────────────────────────────────

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

// ── Boxes superiores ──────────────────────────────────────────────────────────

interface BoxProps { label: string; value: string | number; sub?: string; color?: string; border?: string }

function Box({ label, value, sub, color = 'text-gray-800', border = 'border-gray-200' }: BoxProps) {
  return (
    <div className={clsx('bg-white rounded-xl border-2 px-3 py-2 flex flex-col gap-0.5 shadow-sm', border)}>
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      <p className={clsx('text-xl font-black tabular-nums leading-none', color)}>{value}</p>
      {sub && <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Marcador de mesa (readonly) ───────────────────────────────────────────────

function TableDot({ mesa, estado }: { mesa: MesaConfig; estado: MesaEstado | undefined }) {
  const status = estado?.status ?? 'livre';
  return (
    <div
      style={{ left: `${mesa.x}%`, top: `${mesa.y}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
    >
      <div className={clsx(
        'rounded-full flex items-center justify-center font-bold text-white text-[7px] leading-none w-5 h-5 shadow',
        status === 'ocupada'
          ? 'bg-red-500'
          : 'bg-green-500',
      )}>
        {mesa.numero.replace(/^0+/, '')}
      </div>
    </div>
  );
}

// ── MapaKds ───────────────────────────────────────────────────────────────────

export function MapaKds() {
  const { tables, estado } = useBeachTables();
  const [occupancy]        = useOccupancy();
  const portaria           = usePortaria();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan]   = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, px: 0, py: 0 });
  const containerRef = useRef<HTMLDivElement>(null!);

  // ── Cálculos ─────────────────────────────────────────────────────────────────

  const loungesTotal = occupancy.lounges.reduce((a, b) => a + b, 0);
  const naCasa       = occupancy.beach + loungesTotal;
  const gap          = portaria !== null ? Math.max(0, portaria - naCasa) : null;

  const ocupadas  = Object.values(estado).filter(e => e.status === 'ocupada').length;
  const livres    = tables.length - ocupadas;
  const clientes  = Object.values(estado).reduce((s, e) => s + (e.quantidadeClientes ?? 0), 0);
  const taxa      = tables.length > 0 ? Math.round((ocupadas / tables.length) * 100) : 0;

  // ── Zoom / pan ────────────────────────────────────────────────────────────────

  const handleZoom = (delta: number) => setZoom(z => Math.max(0.5, Math.min(4, z + delta)));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({ x: panStart.px + e.clientX - panStart.mx, y: panStart.py + e.clientY - panStart.my });
  }, [dragging, panStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden" style={{ userSelect: 'none' }}>

      {/* Header compacto */}
      <header className="shrink-0 bg-gray-900 px-4 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Hibiscus"
            className="h-6 w-auto object-contain brightness-0 invert opacity-80"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-xs font-bold text-white/70 tracking-wide">Mapa de Ocupação · Beach</span>
        </div>
        <span className="text-[9px] text-white/30">atualiza a cada 30s</span>
      </header>

      {/* Área principal: painel fixo + mapa lado a lado */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Painel lateral fixo */}
        <div className="w-48 shrink-0 flex flex-col gap-2 p-3 overflow-y-auto">

          {/* Bloco clube */}
          <div className="bg-gray-800 rounded-2xl p-3 flex flex-col gap-2.5">
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Clube</p>
            {[
              { label: 'Portaria',  value: portaria ?? '—', color: 'text-white' },
              { label: 'Na Casa',   value: naCasa,          color: 'text-blue-300', sub: `Beach ${occupancy.beach} · Lounge ${loungesTotal}` },
              { label: '– GAP',     value: gap ?? '—',      color: gap && gap > 0 ? 'text-red-400' : 'text-white/30' },
              { label: 'Parceiros', value: occupancy.parceiros, color: 'text-yellow-300' },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[9px] text-white/40 leading-none truncate">{label}</p>
                  {sub && <p className="text-[8px] text-white/25 leading-none mt-0.5 truncate">{sub}</p>}
                </div>
                <span className={clsx('text-xl font-black tabular-nums leading-none shrink-0', color)}>{value}</span>
              </div>
            ))}
          </div>

          {/* Bloco mesas */}
          <div className="bg-gray-800 rounded-2xl p-3 flex flex-col gap-2.5">
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Mesas Beach</p>
            {[
              { label: 'Ocupadas', value: ocupadas,   color: 'text-red-400' },
              { label: 'Livres',   value: livres,     color: 'text-green-400' },
              { label: 'Clientes', value: clientes,   color: 'text-blue-300' },
              { label: 'Taxa',     value: `${taxa}%`, color: taxa >= 80 ? 'text-red-400' : taxa >= 50 ? 'text-yellow-300' : 'text-green-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <p className="text-[9px] text-white/40 leading-none">{label}</p>
                <span className={clsx('text-xl font-black tabular-nums leading-none', color)}>{value}</span>
              </div>
            ))}
          </div>

          {/* Legenda + zoom */}
          <div className="bg-gray-800 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[9px] text-white/50">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" /> Livre
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-white/50">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" /> Ocupada
            </div>
            <div className="flex gap-1 mt-1">
              {[
                { icon: <ZoomOut size={11} />, fn: () => handleZoom(-0.2) },
                { icon: <ZoomIn  size={11} />, fn: () => handleZoom(0.2)  },
                { icon: <RotateCcw size={11} />, fn: handleReset          },
              ].map((b, i) => (
                <button key={i} onClick={b.fn}
                  className="flex-1 h-6 rounded-lg bg-white/10 text-white/60 flex items-center justify-center hover:bg-white/20 transition-colors">
                  {b.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mapa — ocupa o restante */}
        <div
          className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            ref={containerRef}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              width: '100%',
              height: '100%',
              position: 'relative',
            }}
          >
            <img
              src={mapaImg}
              alt="Mapa Beach"
              draggable={false}
              className="w-full h-full object-contain select-none"
              onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }}
            />
            {tables.map(mesa => (
              <TableDot key={mesa.numero} mesa={mesa} estado={estado[mesa.numero]} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
