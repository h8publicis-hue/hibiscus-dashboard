import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, MapPin, X, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useBeachTables, MesaEstado } from '../hooks/useBeachTables';

const PIN_KEY    = 'hibiscus-garcom-auth';
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

// ── PIN screen ────────────────────────────────────────────────────────────────

function PinScreen({ onAuth }: { onAuth: () => void }) {
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length >= 5) return;
    const next = pin + d;
    setPin(next);
    setErro(false);
    if (next.length === 5) {
      if (next === CORRECT_PIN) {
        sessionStorage.setItem(PIN_KEY, '1');
        onAuth();
      } else {
        setTimeout(() => { setPin(''); setErro(true); }, 300);
      }
    }
  };

  const handleDel = () => setPin(p => p.slice(0, -1));

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-200">
          <MapPin size={28} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Mapa Beach</h1>
        <p className="text-sm text-gray-400 mt-1">Digite o PIN para entrar</p>
      </div>

      {/* Bolhinhas */}
      <div className="flex gap-3 mb-8">
        {[0,1,2,3,4].map(i => (
          <div key={i} className={clsx(
            'w-4 h-4 rounded-full border-2 transition-all duration-150',
            pin.length > i
              ? erro ? 'bg-red-400 border-red-400' : 'bg-emerald-500 border-emerald-500'
              : 'bg-transparent border-gray-300',
          )} />
        ))}
      </div>

      {erro && <p className="text-xs text-red-500 mb-4 -mt-4">PIN incorreto, tente novamente</p>}

      {/* Teclado */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {digits.map((d, i) => (
          d === '' ? <div key={i} /> :
          d === '⌫' ? (
            <button key={i} onClick={handleDel}
              className="h-14 rounded-2xl bg-gray-200 text-gray-600 text-xl font-medium flex items-center justify-center active:bg-gray-300 transition-colors">
              ⌫
            </button>
          ) : (
            <button key={i} onClick={() => handleDigit(d)}
              className="h-14 rounded-2xl bg-white border border-gray-200 text-gray-900 text-xl font-semibold shadow-sm active:bg-gray-100 transition-colors">
              {d}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

// ── Modal da Mesa ─────────────────────────────────────────────────────────────

interface ModalProps {
  numero: string;
  estado: MesaEstado | undefined;
  onClose: () => void;
  onOcupar: (n: string, c: number) => void;
  onLiberar: (n: string) => void;
  onAtualizarClientes: (n: string, delta: number) => void;
}

function MesaModal({ numero, estado, onClose, onOcupar, onLiberar, onAtualizarClientes }: ModalProps) {
  const [clientes, setClientes] = useState(1);
  const [confirmLiberar, setConfirmLiberar] = useState(false);
  const status = estado?.status ?? 'livre';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <MapPin size={20} className="text-brand-500" />
            <h2 className="text-lg font-bold text-gray-900">Mesa {numero}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-5',
          status === 'ocupada'
            ? 'bg-red-100 text-red-700'
            : 'bg-green-100 text-green-700',
        )}>
          <span className={clsx('w-2 h-2 rounded-full', status === 'ocupada' ? 'bg-red-500' : 'bg-green-500')} />
          {status === 'ocupada' ? 'OCUPADA' : 'LIVRE'}
        </div>

        {status === 'ocupada' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-base text-gray-600 flex items-center gap-2">
                <Users size={16} /> Clientes
              </span>
              <div className="flex items-center gap-3">
                <button onClick={() => onAtualizarClientes(numero, -1)}
                  className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center active:bg-gray-200">
                  −
                </button>
                <span className="text-2xl font-black w-10 text-center tabular-nums">
                  {estado?.quantidadeClientes ?? 0}
                </span>
                <button onClick={() => onAtualizarClientes(numero, 1)}
                  className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center active:bg-gray-200">
                  +
                </button>
              </div>
            </div>

            {estado?.horaOcupacao && (
              <div className="bg-gray-50 rounded-xl p-3 mb-5 text-sm space-y-1">
                <div className="flex justify-between text-gray-500">
                  <span>Ocupada desde</span>
                  <span className="font-medium text-gray-700">{fmtHora(estado.horaOcupacao)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Tempo na mesa</span>
                  <span className="font-medium text-gray-700">{fmtTempo(estado.horaOcupacao)}</span>
                </div>
              </div>
            )}

            {!confirmLiberar ? (
              <button onClick={() => setConfirmLiberar(true)}
                className="w-full py-3.5 rounded-2xl bg-red-500 text-white text-base font-bold active:bg-red-600 transition-colors">
                Liberar mesa
              </button>
            ) : (
              <div className="border-2 border-red-200 rounded-2xl p-4 text-center space-y-3">
                <p className="text-sm font-medium text-gray-700">Confirmar liberação?</p>
                <div className="flex gap-2">
                  <button onClick={() => { onLiberar(numero); onClose(); }}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold active:bg-red-600">
                    Sim
                  </button>
                  <button onClick={() => setConfirmLiberar(false)}
                    className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold active:bg-gray-200">
                    Não
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <span className="text-base text-gray-600 flex items-center gap-2">
                <Users size={16} /> Quantos clientes?
              </span>
              <div className="flex items-center gap-3">
                <button onClick={() => setClientes(c => Math.max(1, c - 1))}
                  className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center active:bg-gray-200">
                  −
                </button>
                <span className="text-2xl font-black w-10 text-center tabular-nums">{clientes}</span>
                <button onClick={() => setClientes(c => c + 1)}
                  className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center active:bg-gray-200">
                  +
                </button>
              </div>
            </div>
            <button onClick={() => { onOcupar(numero, clientes); onClose(); }}
              className="w-full py-3.5 rounded-2xl bg-green-500 text-white text-base font-bold active:bg-green-600 transition-colors">
              Ocupar mesa
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Garcom App ────────────────────────────────────────────────────────────────

function GarcomApp() {
  const [searchParams] = useSearchParams();
  const { tables, estado, loading, ocuparMesa, liberarMesa, atualizarClientes } = useBeachTables();

  const [filtro, setFiltro] = useState<'todas' | 'livres' | 'ocupadas'>('todas');
  const [busca, setBusca]   = useState('');
  const [modal, setModal]   = useState<string | null>(null);
  const [irMesa, setIrMesa] = useState('');

  const handleIrMesa = useCallback(() => {
    const n = irMesa.trim().replace(/^0+/, '');
    if (!n) return;
    const found = tables.find(t => t.numero.replace(/^0+/, '') === n);
    if (found) { setModal(found.numero); setIrMesa(''); }
  }, [irMesa, tables]);

  // Se vier ?mesa=042, abre direto
  useEffect(() => {
    const m = searchParams.get('mesa');
    if (m) setModal(m.padStart(3, '0'));
  }, [searchParams]);

  const filtradas = tables.filter(t => {
    const e = estado[t.numero];
    if (filtro === 'livres'   && e?.status === 'ocupada') return false;
    if (filtro === 'ocupadas' && e?.status !== 'ocupada') return false;
    if (busca.trim()) {
      const q = busca.trim().replace(/^0+/, '');
      if (!t.numero.replace(/^0+/, '').startsWith(q)) return false;
    }
    return true;
  });

  const ocupadas  = Object.values(estado).filter(e => e.status === 'ocupada').length;
  const livres    = tables.length - ocupadas;
  const clientes  = Object.values(estado).reduce((s, e) => s + (e.quantidadeClientes ?? 0), 0);

  const handleLogout = () => {
    sessionStorage.removeItem(PIN_KEY);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center shadow">
            <MapPin size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">Mapa Beach</p>
            <p className="text-[10px] text-gray-400 leading-tight">
              {ocupadas} ocupadas · {livres} livres · {clientes} clientes
            </p>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 rounded-xl text-gray-400 active:bg-gray-100">
          <LogOut size={18} />
        </button>
      </header>

      {/* Ir para mesa */}
      <div className="px-4 pt-3 pb-1 flex gap-2">
        <input
          type="text"
          value={irMesa}
          onChange={e => setIrMesa(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleIrMesa()}
          placeholder="Nº da mesa"
          inputMode="numeric"
          className="flex-1 text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <button
          onClick={handleIrMesa}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold active:bg-emerald-600 transition-colors"
        >
          Ir
        </button>
      </div>

      {/* Filtros + busca */}
      <div className="px-4 pt-2 pb-2 flex gap-2 sticky top-[57px] bg-gray-50 z-10">
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar…"
          inputMode="numeric"
          className="w-20 text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <div className="flex flex-1 items-center gap-1 bg-white rounded-xl border border-gray-200 p-1">
          {(['todas', 'livres', 'ocupadas'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={clsx(
                'flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors',
                filtro === f
                  ? f === 'ocupadas' ? 'bg-red-500 text-white' : f === 'livres' ? 'bg-green-500 text-white' : 'bg-brand-500 text-white'
                  : 'text-gray-500',
              )}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grade de mesas */}
      <div className="flex-1 px-4 pb-6">
        {loading && tables.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {filtradas.map(mesa => {
              const e = estado[mesa.numero];
              const ocupada = e?.status === 'ocupada';
              return (
                <button
                  key={mesa.numero}
                  onClick={() => setModal(mesa.numero)}
                  className={clsx(
                    'aspect-square rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold text-white shadow-sm active:scale-95 transition-transform',
                    ocupada
                      ? 'bg-red-500 shadow-red-200'
                      : 'bg-green-500 shadow-green-200',
                  )}
                >
                  <span className="text-xs leading-none">{mesa.numero.replace(/^0+/, '')}</span>
                  {ocupada && e.quantidadeClientes > 0 && (
                    <span className="text-[8px] opacity-80 leading-none">{e.quantidadeClientes}p</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <MesaModal
          numero={modal}
          estado={estado[modal]}
          onClose={() => setModal(null)}
          onOcupar={ocuparMesa}
          onLiberar={liberarMesa}
          onAtualizarClientes={atualizarClientes}
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
