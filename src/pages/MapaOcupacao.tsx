import { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Pencil, Save, X, Users, MapPin, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useBeachTables, MesaConfig, MesaEstado } from '../hooks/useBeachTables';
import mapaImg from '../assets/mapa-hibiscus-beach.webp';

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

// ── StatsBar ──────────────────────────────────────────────────────────────────

function StatsBar({ estado, total }: { estado: Record<string, MesaEstado>; total: number }) {
  const ocupadas = Object.values(estado).filter(e => e.status === 'ocupada').length;
  const livres   = total - ocupadas;
  const clientes = Object.values(estado).reduce((s, e) => s + (e.quantidadeClientes ?? 0), 0);
  const taxa     = total > 0 ? Math.round((ocupadas / total) * 100) : 0;

  return (
    <div className="grid grid-cols-5 gap-2 mb-3">
      {[
        { label: 'Total',    value: total,      color: 'text-gray-700 dark:text-gray-200' },
        { label: 'Ocupadas', value: ocupadas,   color: 'text-red-600 dark:text-red-400' },
        { label: 'Livres',   value: livres,     color: 'text-green-600 dark:text-green-400' },
        { label: 'Clientes', value: clientes,   color: 'text-brand-600 dark:text-brand-400' },
        { label: 'Ocupação', value: `${taxa}%`, color: taxa >= 80 ? 'text-red-600' : taxa >= 50 ? 'text-yellow-600' : 'text-green-600' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-2.5 text-center shadow border border-gray-200 dark:border-gray-700">
          <p className={clsx('text-lg font-black tabular-nums', color)}>{value}</p>
          <p className="text-[9px] text-gray-400 uppercase tracking-wider mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── TableMarker ───────────────────────────────────────────────────────────────

interface TableMarkerProps {
  mesa:         MesaConfig;
  estado:       MesaEstado | undefined;
  highlight:    boolean;
  dimmed:       boolean;
  editMode:     boolean;
  onClickMesa:  (numero: string) => void;
  onDrag:       (numero: string, x: number, y: number) => void;
  onRemove:     (numero: string) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

function TableMarker({ mesa, estado, highlight, dimmed, editMode, onClickMesa, onDrag, onRemove, containerRef }: TableMarkerProps) {
  const status    = estado?.status ?? 'livre';
  const dragging  = useRef(false);
  const moved     = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    moved.current = false;
    const startMx = e.clientX, startMy = e.clientY;
    const startOx = mesa.x,    startOy = mesa.y;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const dx = ev.clientX - startMx, dy = ev.clientY - startMy;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved.current = true;
      onDrag(mesa.numero,
        Math.max(1, Math.min(99, startOx + (dx / r.width)  * 100)),
        Math.max(1, Math.min(99, startOy + (dy / r.height) * 100)),
      );
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [editMode, mesa.x, mesa.y, mesa.numero, onDrag, containerRef]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (editMode && moved.current) return;
    onClickMesa(mesa.numero);
  }, [editMode, onClickMesa, mesa.numero]);

  return (
    <div
      style={{ left: `${mesa.x}%`, top: `${mesa.y}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2"
    >
      <button
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        className={clsx(
          'rounded-full flex items-center justify-center font-bold text-white text-[8px] leading-none select-none transition-all w-6 h-6',
          editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:scale-125',
          status === 'ocupada'
            ? 'bg-red-500 hover:bg-red-600 shadow-md shadow-red-200 dark:shadow-red-900/40'
            : 'bg-green-500 hover:bg-green-600 shadow-md shadow-green-200 dark:shadow-green-900/40',
          highlight && 'ring-2 ring-white ring-offset-1 scale-125 animate-pulse',
          dimmed && 'opacity-30',
        )}
      >
        {mesa.numero.replace(/^0+/, '')}
      </button>

      {/* Botão remover — só em edit mode */}
      {editMode && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(mesa.numero); }}
          className="absolute -top-2 -right-2 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center shadow hover:bg-red-700 z-10"
        >
          <X size={8} />
        </button>
      )}
    </div>
  );
}

// ── Modal: editar número da mesa ──────────────────────────────────────────────

function EditMesaModal({
  numero,
  todosNumeros,
  onSave,
  onClose,
}: {
  numero:       string;
  todosNumeros: string[];
  onSave:       (antigo: string, novo: string) => void;
  onClose:      () => void;
}) {
  const [val, setVal] = useState(numero.replace(/^0+/, ''));
  const [erro, setErro] = useState('');

  const handleSave = () => {
    const trimmed = val.trim();
    if (!trimmed || isNaN(Number(trimmed)) || Number(trimmed) < 1) {
      setErro('Número inválido'); return;
    }
    const novo = String(Number(trimmed)).padStart(3, '0');
    if (novo !== numero && todosNumeros.includes(novo)) {
      setErro(`Mesa ${novo} já existe`); return;
    }
    onSave(numero, novo);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-xs p-5 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Editar Mesa {numero.replace(/^0+/, '')}</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Número da mesa</label>
        <input
          type="number"
          min={1}
          value={val}
          onChange={e => { setVal(e.target.value); setErro(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 mb-1"
          autoFocus
        />
        {erro && <p className="text-xs text-red-500 mb-3">{erro}</p>}
        <button
          onClick={handleSave}
          className="w-full mt-3 py-2 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
        >
          Salvar número
        </button>
      </div>
    </div>
  );
}

// ── Modal da mesa (ocupar/liberar) ────────────────────────────────────────────

interface TableModalProps {
  numero:              string;
  estado:              MesaEstado | undefined;
  onClose:             () => void;
  onOcupar:            (n: string, c: number) => void;
  onLiberar:           (n: string) => void;
  onAtualizarClientes: (n: string, delta: number) => void;
}

function TableModal({ numero, estado, onClose, onOcupar, onLiberar, onAtualizarClientes }: TableModalProps) {
  const [clientes, setClientes] = useState(1);
  const [confirmLiberar, setConfirmLiberar] = useState(false);
  const status = estado?.status ?? 'livre';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-xs p-5 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-brand-500" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Mesa {numero.replace(/^0+/, '')}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4',
          status === 'ocupada'
            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
        )}>
          <span className={clsx('w-2 h-2 rounded-full', status === 'ocupada' ? 'bg-red-500' : 'bg-green-500')} />
          {status === 'ocupada' ? 'OCUPADA' : 'LIVRE'}
        </div>

        {status === 'ocupada' ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                <Users size={14} /> Clientes
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => onAtualizarClientes(numero, -1)}
                  className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center">
                  −
                </button>
                <span className="text-lg font-black w-8 text-center tabular-nums text-gray-900 dark:text-white">
                  {estado?.quantidadeClientes ?? 0}
                </span>
                <button onClick={() => onAtualizarClientes(numero, 1)}
                  className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center">
                  +
                </button>
              </div>
            </div>
            {estado?.horaOcupacao && (
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3 mb-4 text-sm">
                <div className="flex justify-between text-gray-500 dark:text-gray-400">
                  <span>Ocupada desde</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">{fmtHora(estado.horaOcupacao)}</span>
                </div>
                <div className="flex justify-between text-gray-500 dark:text-gray-400 mt-1">
                  <span>Tempo</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">{fmtTempo(estado.horaOcupacao)}</span>
                </div>
              </div>
            )}
            {!confirmLiberar ? (
              <button onClick={() => setConfirmLiberar(true)}
                className="w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
                Liberar mesa
              </button>
            ) : (
              <div className="border border-red-200 dark:border-red-800 rounded-xl p-3 text-center space-y-2">
                <p className="text-sm text-gray-700 dark:text-gray-300">Confirmar liberação?</p>
                <div className="flex gap-2">
                  <button onClick={() => { onLiberar(numero); onClose(); }}
                    className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold">
                    Sim, liberar
                  </button>
                  <button onClick={() => setConfirmLiberar(false)}
                    className="flex-1 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                <Users size={14} /> Clientes
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setClientes(c => Math.max(1, c - 1))}
                  className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center">
                  −
                </button>
                <span className="text-lg font-black w-8 text-center tabular-nums text-gray-900 dark:text-white">{clientes}</span>
                <button onClick={() => setClientes(c => c + 1)}
                  className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center">
                  +
                </button>
              </div>
            </div>
            <button onClick={() => { onOcupar(numero, clientes); onClose(); }}
              className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors">
              Ocupar mesa
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── MapaOcupacao ──────────────────────────────────────────────────────────────

export function MapaOcupacao() {
  const { tables, estado, loading, ocuparMesa, liberarMesa, atualizarClientes, salvarPosicoes } = useBeachTables();

  const [zoom, setZoom]     = useState(1);
  const [pan, setPan]       = useState({ x: 0, y: 0 });
  const [draggingMap, setDraggingMap] = useState(false);
  const [panStart, setPanStart]       = useState({ mx: 0, my: 0, px: 0, py: 0 });
  const [panMoved, setPanMoved]       = useState(false);

  const [editMode, setEditMode]     = useState(false);
  const [draftTables, setDraft]     = useState<MesaConfig[]>([]);
  const [editNumero, setEditNumero] = useState<string | null>(null); // modal renomear

  const [busca, setBusca]   = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'livres' | 'ocupadas'>('todas');
  const [modal, setModal]   = useState<string | null>(null); // modal ocupar/liberar

  const containerRef = useRef<HTMLDivElement>(null!);

  useEffect(() => { setDraft(tables); }, [tables]);

  const activeTables = editMode ? draftTables : tables;

  // ── Zoom / pan ──────────────────────────────────────────────────────────────

  const handleZoom = (delta: number) =>
    setZoom(z => Math.max(0.5, Math.min(4, z + delta)));

  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleMapMouseDown = useCallback((e: React.MouseEvent) => {
    if (editMode) return;
    setDraggingMap(true);
    setPanMoved(false);
    setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y });
  }, [editMode, pan]);

  const handleMapMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingMap) return;
    const dx = e.clientX - panStart.mx, dy = e.clientY - panStart.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setPanMoved(true);
    setPan({ x: panStart.px + dx, y: panStart.py + dy });
  }, [draggingMap, panStart]);

  const handleMapMouseUp = useCallback(() => setDraggingMap(false), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    handleZoom(e.deltaY < 0 ? 0.2 : -0.2);
  }, []);

  // ── Clique em mesa ──────────────────────────────────────────────────────────

  const handleClickMesa = useCallback((numero: string) => {
    if (panMoved) return;
    if (editMode) {
      setEditNumero(numero); // modo edição → renomear
    } else {
      setModal(numero);      // modo normal → ocupar/liberar
    }
  }, [panMoved, editMode]);

  // ── Drag de mesa ───────────────────────────────────────────────────────────

  const handleDrag = useCallback((numero: string, x: number, y: number) => {
    setDraft(prev => prev.map(t => t.numero === numero ? { ...t, x, y } : t));
  }, []);

  // ── Adicionar mesa ─────────────────────────────────────────────────────────

  const handleAddMesa = () => {
    // Próximo número disponível
    const existentes = new Set(draftTables.map(t => t.numero));
    let n = 1;
    while (existentes.has(String(n).padStart(3, '0'))) n++;
    const novo: MesaConfig = { numero: String(n).padStart(3, '0'), x: 50, y: 50 };
    setDraft(prev => [...prev, novo]);
  };

  // ── Remover mesa ───────────────────────────────────────────────────────────

  const handleRemoveMesa = useCallback((numero: string) => {
    setDraft(prev => prev.filter(t => t.numero !== numero));
  }, []);

  // ── Renomear mesa ──────────────────────────────────────────────────────────

  const handleRenomear = (antigo: string, novo: string) => {
    setDraft(prev => prev.map(t => t.numero === antigo ? { ...t, numero: novo } : t));
  };

  // ── Salvar edição ──────────────────────────────────────────────────────────

  const handleSaveEdit = async () => {
    await salvarPosicoes(draftTables);
    setEditMode(false);
  };

  const handleCancelEdit = () => {
    setDraft(tables);
    setEditMode(false);
  };

  // ── Filtro / highlight ─────────────────────────────────────────────────────

  const buscaNum = busca.trim().replace(/^0+/, '');

  const isDimmed = (numero: string): boolean => {
    const e = estado[numero];
    if (filtro === 'livres'   && e?.status === 'ocupada') return true;
    if (filtro === 'ocupadas' && e?.status !== 'ocupada') return true;
    return false;
  };

  if (loading && tables.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Carregando mapa…</p>
        </div>
      </div>
    );
  }

  const todosNumeros = draftTables.map(t => t.numero);

  return (
    <div className="flex-1 flex flex-col p-3 gap-3 min-h-0">
      {/* Título */}
      <div>
        <h1 className="text-sm font-bold text-gray-900 dark:text-white">Mapa de Ocupação</h1>
        <p className="text-[10px] text-gray-400">Beach · tempo real</p>
      </div>

      {/* Stats */}
      <StatsBar estado={estado} total={activeTables.length} />

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Busca */}
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar mesa…"
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 w-28 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />

        {/* Filtros */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          {(['todas', 'livres', 'ocupadas'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={clsx(
                'px-2 py-0.5 text-[10px] font-semibold rounded-md capitalize transition-colors',
                filtro === f
                  ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400',
              )}>
              {f}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          {[
            { icon: <ZoomOut size={14} />, fn: () => handleZoom(-0.2) },
            { icon: <ZoomIn  size={14} />, fn: () => handleZoom(0.2)  },
            { icon: <RotateCcw size={14} />, fn: handleReset          },
          ].map((b, i) => (
            <button key={i} onClick={b.fn}
              className="w-7 h-7 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50">
              {b.icon}
            </button>
          ))}
        </div>

        {/* Editar / Salvar */}
        {!editMode ? (
          <button onClick={() => setEditMode(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600">
            <Pencil size={12} /> Editar mapa
          </button>
        ) : (
          <div className="flex gap-1">
            <button onClick={handleAddMesa}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600">
              <Plus size={12} /> Mesa
            </button>
            <button onClick={handleSaveEdit}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600">
              <Save size={12} /> Salvar
            </button>
            <button onClick={handleCancelEdit}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500">
              <X size={12} /> Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Mapa */}
      <div
        className="relative flex-1 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-sky-100 dark:bg-gray-800 cursor-grab active:cursor-grabbing min-h-[300px]"
        onMouseDown={handleMapMouseDown}
        onMouseMove={handleMapMouseMove}
        onMouseUp={handleMapMouseUp}
        onMouseLeave={handleMapMouseUp}
        onWheel={handleWheel}
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

          {activeTables.map(mesa => {
            const isHighlighted = buscaNum.length >= 1 && mesa.numero.replace(/^0+/, '') === buscaNum;
            return (
              <TableMarker
                key={mesa.numero}
                mesa={mesa}
                estado={estado[mesa.numero]}
                highlight={isHighlighted}
                dimmed={isDimmed(mesa.numero)}
                editMode={editMode}
                onClickMesa={handleClickMesa}
                onDrag={handleDrag}
                onRemove={handleRemoveMesa}
                containerRef={containerRef}
              />
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-[10px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Livre</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Ocupada</span>
        {editMode && (
          <span className="text-brand-500 font-medium flex items-center gap-1">
            <Pencil size={10} /> Arraste · clique para renomear · <Trash2 size={10} /> para remover
          </span>
        )}
      </div>

      {/* Modal ocupar/liberar */}
      {modal && !editMode && (
        <TableModal
          numero={modal}
          estado={estado[modal]}
          onClose={() => setModal(null)}
          onOcupar={ocuparMesa}
          onLiberar={liberarMesa}
          onAtualizarClientes={atualizarClientes}
        />
      )}

      {/* Modal renomear (edit mode) */}
      {editNumero && editMode && (
        <EditMesaModal
          numero={editNumero}
          todosNumeros={todosNumeros}
          onSave={handleRenomear}
          onClose={() => setEditNumero(null)}
        />
      )}
    </div>
  );
}
