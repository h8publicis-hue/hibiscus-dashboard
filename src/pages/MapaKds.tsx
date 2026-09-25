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
    <div className="min-h-screen bg-gray-100 flex flex-col overflow-hidden" style={{ userSelect: 'none' }}>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-black text-gray-900 tracking-tight">Mapa de Ocupação · Beach</h1>
          <p className="text-[9px] text-gray-400">Tempo real · atualiza a cada 30s</p>
        </div>
        <img
          src="/logo.png"
          alt="Hibiscus"
          className="h-8 w-auto object-contain"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </header>

      {/* Boxes superiores */}
      <div className="px-4 pt-2 pb-1 grid grid-cols-4 gap-2 shrink-0">
        {/* Linha 1 — Ocupação do clube */}
        <div className="col-span-4 grid grid-cols-4 gap-2">
          <Box
            label="Portaria"
            value={portaria ?? '—'}
            border="border-gray-300"
            color="text-gray-800"
          />
          <Box
            label="Na Casa"
            value={naCasa}
            sub={`Beach ${occupancy.beach} · Lounge ${loungesTotal}`}
            border="border-blue-300"
            color="text-blue-700"
          />
          <Box
            label="– GAP"
            value={gap ?? '—'}
            border="border-red-300"
            color={gap && gap > 0 ? 'text-red-600' : 'text-gray-400'}
          />
          <Box
            label="Parceiros"
            value={occupancy.parceiros}
            border="border-yellow-300"
            color="text-yellow-600"
          />
        </div>

        {/* Linha 2 — Mesas Beach */}
        <div className="col-span-4 grid grid-cols-4 gap-2">
          <Box
            label="Mesas Ocupadas"
            value={ocupadas}
            border="border-red-200"
            color="text-red-600"
          />
          <Box
            label="Mesas Livres"
            value={livres}
            border="border-green-200"
            color="text-green-600"
          />
          <Box
            label="Clientes Beach"
            value={clientes}
            border="border-brand-200"
            color="text-brand-600"
          />
          <Box
            label="Taxa Ocupação"
            value={`${taxa}%`}
            border={taxa >= 80 ? 'border-red-300' : taxa >= 50 ? 'border-yellow-300' : 'border-green-300'}
            color={taxa >= 80 ? 'text-red-600' : taxa >= 50 ? 'text-yellow-600' : 'text-green-600'}
          />
        </div>
      </div>

      {/* Controles do mapa */}
      <div className="px-4 pb-1 flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          {[
            { icon: <ZoomOut size={14} />, fn: () => handleZoom(-0.2) },
            { icon: <ZoomIn  size={14} />, fn: () => handleZoom(0.2)  },
            { icon: <RotateCcw size={14} />, fn: handleReset           },
          ].map((b, i) => (
            <button key={i} onClick={b.fn}
              className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm">
              {b.icon}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 ml-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Livre</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Ocupada</span>
        </div>
      </div>

      {/* Mapa */}
      <div
        className="flex-1 mx-4 mb-4 rounded-2xl overflow-hidden border border-gray-200 bg-sky-100 cursor-grab active:cursor-grabbing shadow-inner"
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
            position: 'relative',
            width: '100%',
            height: '100%',
          }}
        >
          <img
            src={mapaImg}
            alt="Mapa Beach"
            draggable={false}
            className="w-full h-full object-cover select-none"
            onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }}
          />
          {tables.map(mesa => (
            <TableDot key={mesa.numero} mesa={mesa} estado={estado[mesa.numero]} />
          ))}
        </div>
      </div>
    </div>
  );
}
