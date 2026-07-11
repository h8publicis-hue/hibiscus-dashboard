import { useState, useEffect, useRef, useCallback } from 'react';
import { OccupancyState, SPACE_CONFIGS } from '../types';

const LOUNGE_GROUPS = [
  { label: 'Frente Mar', ids: [0, 2, 4, 6, 8, 10, 12] },
  { label: 'Atrás',      ids: [1, 3, 5, 7, 9, 11, 13] },
  { label: 'Anexo',      ids: [14] },
  { label: 'Prime ★',    ids: [15] },
  { label: 'Gramado',    ids: [16, 17] },
] as const;

const DEFAULT: OccupancyState = { beach: 0, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0), prime: 0, parceiros: 0, colaboradores: 0 };

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
  } catch { return { ...DEFAULT, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0) }; }
}

async function saveOcc(state: OccupancyState) {
  await fetch('/api/ocupacao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
}

// ── Botão com long-press para incremento/decremento rápido ───────────────────
function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onClickRef  = useRef(onClick);
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);

  const stop = useCallback(() => {
    if (timerRef.current)    { clearTimeout(timerRef.current);    timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    onClickRef.current();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => onClickRef.current(), 80);
    }, 400);
  }, []);

  return (
    <button
      disabled={disabled}
      className="w-16 h-16 rounded-2xl bg-white border-2 border-gray-200 text-3xl font-light text-gray-700 active:bg-gray-100 select-none shadow-sm disabled:opacity-30"
      onPointerDown={(e) => { if (disabled) return; e.preventDefault(); start(); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {label}
    </button>
  );
}

// ── Contador individual ───────────────────────────────────────────────────────
function Counter({
  label, sublabel, value, max, color,
  onInc, onDec,
}: {
  label: string; sublabel?: string; value: number; max: number; color: string;
  onInc: () => void; onDec: () => void;
}) {
  const pct  = value / max;
  const pctN = Math.round(pct * 100);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-800">{label}</p>
          {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{pctN}%</span>
      </div>

      {/* Barra de progresso */}
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            pct >= 0.9 ? 'bg-red-500' : pct >= 0.6 ? 'bg-yellow-400' : 'bg-green-500'
          }`}
          style={{ width: `${pctN}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <StepBtn label="−" onClick={onDec} />
        <div className="flex-1 text-center">
          <span className="text-5xl font-bold text-gray-900">{value}</span>
          <span className="text-lg text-gray-400 ml-1">/{max}</span>
        </div>
        <StepBtn label="+" onClick={onInc} />
      </div>
    </div>
  );
}

// ── Modal de edição de lounge individual ─────────────────────────────────────
function LoungeModal({
  idx, value, currentBeach, max, onClose, onSave,
}: {
  idx: number; value: number; currentBeach: number; max: number;
  onClose: () => void; onSave: (novoLounge: number, novoBeach: number) => void;
}) {
  const [qty,      setQty]      = useState(value);
  const [step,     setStep]     = useState<'edit' | 'transfer'>('edit');
  const name = SPACE_CONFIGS.lounge.start + idx;
  const delta = qty - value; // positivo = adicionou pessoas no lounge

  function handleConfirm() {
    if (delta > 0) {
      setStep('transfer');
    } else {
      onSave(qty, currentBeach);
      onClose();
    }
  }

  function handleTransfer(isTransfer: boolean) {
    const novoBeach = isTransfer ? clamp(currentBeach - delta, 0, SPACE_CONFIGS.beach.max) : currentBeach;
    onSave(qty, novoBeach);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-sm p-6 flex flex-col gap-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {step === 'edit' ? (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">Lounge {name}</h3>
              <button onClick={onClose} className="text-gray-400 text-xl leading-none">✕</button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <StepBtn label="−" onClick={() => setQty(q => clamp(q - 1, 0, max))} />
              <div className="flex-1 text-center">
                <span className="text-5xl font-bold text-gray-900">{qty}</span>
                <span className="text-lg text-gray-400 ml-1">/{max}</span>
              </div>
              <StepBtn label="+" onClick={() => setQty(q => clamp(q + 1, 0, max))} disabled={qty >= max} />
            </div>

            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  qty / max >= 0.9 ? 'bg-red-500' : qty / max >= 0.6 ? 'bg-yellow-400' : 'bg-green-500'
                }`}
                style={{ width: `${Math.round((qty / max) * 100)}%` }}
              />
            </div>

            <button
              onClick={handleConfirm}
              className="w-full py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold active:bg-gray-700"
            >
              Confirmar
            </button>
          </>
        ) : (
          <>
            <div className="text-center">
              <p className="text-2xl mb-1">🔄</p>
              <h3 className="text-base font-bold text-gray-800">Transferência do Beach?</h3>
              <p className="text-xs text-gray-400 mt-1">
                +{delta} {delta === 1 ? 'pessoa' : 'pessoas'} adicionada{delta === 1 ? '' : 's'} no Lounge {name}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleTransfer(true)}
                className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-semibold active:bg-orange-600"
              >
                Sim — abater {delta} do Beach (Beach: {currentBeach} → {clamp(currentBeach - delta, 0, SPACE_CONFIGS.beach.max)})
              </button>
              <button
                onClick={() => handleTransfer(false)}
                className="w-full py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold active:bg-gray-700"
              >
                Não — entrada direta no Lounge
              </button>
              <button
                onClick={() => setStep('edit')}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600"
              >
                ← Voltar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LoungeGrid({ occ, update }: { occ: OccupancyState; update: (s: OccupancyState) => void }) {
  const [editing, setEditing] = useState<number | null>(null);


  function cellColor(v: number, p: number) {
    if (v === 0) return 'bg-gray-50 border-gray-200 text-gray-400';
    if (p >= 0.9) return 'bg-red-100 border-red-400 text-red-700';
    if (p >= 0.6) return 'bg-yellow-100 border-yellow-400 text-yellow-700';
    return 'bg-green-100 border-green-400 text-green-700';
  }

  return (
    <>
      <div className="flex flex-col gap-3 pt-1">
        {/* Frente Mar + Atrás: duas fileiras de 7 */}
        {[LOUNGE_GROUPS[0], LOUNGE_GROUPS[1]].map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{group.label.includes('★') ? <>{group.label.replace('★','')}<span className="text-yellow-400">★</span></> : group.label}</p>
            <div className="grid grid-cols-7 gap-1.5">
              {group.ids.map((idx) => {
                const v = occ.lounges[idx];
                const p = v / SPACE_CONFIGS.lounge.max;
                const num = SPACE_CONFIGS.lounge.start + idx;
                return (
                  <button
                    key={idx}
                    onClick={() => setEditing(idx)}
                    className={`rounded-lg flex flex-col items-center justify-center py-2.5 border-2 transition-colors active:scale-95 ${cellColor(v, p)}`}
                  >
                    <span className="text-[9px] opacity-60 leading-none">{num}</span>
                    <span className="text-xl font-black leading-tight">{v}</span>
                    {/* mini barra de ocupação */}
                    <div className="w-5 h-0.5 bg-black/10 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-current rounded-full" style={{ width: `${Math.round(p * 100)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Anexo + Gramado + Prime */}
        <div className="flex gap-4">
          {[LOUNGE_GROUPS[2], LOUNGE_GROUPS[3], LOUNGE_GROUPS[4]].map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{group.label.includes('★') ? <>{group.label.replace('★','')}<span className="text-yellow-400">★</span></> : group.label}</p>
              <div className="flex gap-1.5">
                {group.ids.map((idx) => {
                  const v = occ.lounges[idx];
                  const p = v / SPACE_CONFIGS.lounge.max;
                  const num = SPACE_CONFIGS.lounge.start + idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => setEditing(idx)}
                      className={`w-14 rounded-lg flex flex-col items-center justify-center py-2.5 border-2 transition-colors active:scale-95 ${cellColor(v, p)}`}
                    >
                      <span className="text-[9px] opacity-60 leading-none">{num}</span>
                      <span className="text-xl font-black leading-tight">{v}</span>
                      <div className="w-5 h-0.5 bg-black/10 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-current rounded-full" style={{ width: `${Math.round(p * 100)}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing !== null && (
        <LoungeModal
          idx={editing}
          value={occ.lounges[editing]}
          currentBeach={occ.beach}
          max={SPACE_CONFIGS.lounge.max}
          onClose={() => setEditing(null)}
          onSave={(novoLounge, novoBeach) => {
            const lounges = [...occ.lounges];
            lounges[editing] = novoLounge;
            update({ ...occ, lounges, beach: novoBeach });
          }}
        />
      )}
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export function OccupancyInput() {
  const [occ, setOcc]         = useState<OccupancyState>({ ...DEFAULT, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0) });
  const [saved, setSaved]     = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchOcc().then(d => { setOcc(d); setLoading(false); });
    const id = setInterval(() => fetchOcc().then(setOcc), 30_000);
    return () => clearInterval(id);
  }, []);

  const update = useCallback((next: OccupancyState) => {
    setOcc(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveOcc(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 300);
  }, []);

  const totalLounges = occ.lounges.reduce((a, b) => a + b, 0);
  const maxLounges   = SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count;
  const pctLounge    = totalLounges / maxLounges;
  const pctBeach     = occ.beach / SPACE_CONFIGS.beach.max;
  const badgeColor = (pct: number) =>
    pct >= 0.9 ? 'bg-red-100 text-red-700' : pct >= 0.6 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Hibiscus Beach Club</p>
            <h1 className="text-base font-bold text-gray-900">Controle de Ocupação</h1>
          </div>
          <div className={`text-xs font-medium px-3 py-1 rounded-full transition-all ${
            saved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}>
            {saved ? '✓ Salvo' : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 flex flex-col gap-4">

        {/* Parceiros */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">🤝 Parceiros</p>
              <p className="text-xs text-gray-400">Uber, Táxi e Guias</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              hoje
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <StepBtn label="−" onClick={() => update({ ...occ, parceiros: clamp((occ.parceiros ?? 0) - 1, 0, 999) })} />
            <div className="flex-1 text-center">
              <span className="text-5xl font-bold text-gray-900">{occ.parceiros ?? 0}</span>
            </div>
            <StepBtn label="+" onClick={() => update({ ...occ, parceiros: clamp((occ.parceiros ?? 0) + 1, 0, 999) })} />
          </div>
        </div>

        {/* Beach */}
        <Counter
          label="🏖️ Beach"
          sublabel={`Capacidade total: ${SPACE_CONFIGS.beach.max} pessoas`}
          value={occ.beach}
          max={SPACE_CONFIGS.beach.max}
          color={badgeColor(pctBeach)}
          onInc={() => update({ ...occ, beach: clamp(occ.beach + 1, 0, SPACE_CONFIGS.beach.max) })}
          onDec={() => update({ ...occ, beach: clamp(occ.beach - 1, 0, SPACE_CONFIGS.beach.max) })}
        />

        {/* Lounges */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">🛋️ Lounges</p>
              <p className="text-xs text-gray-400">{SPACE_CONFIGS.lounge.count} lounges · {SPACE_CONFIGS.lounge.max} espreguiçadeiras cada</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor(pctLounge)}`}>
              {Math.round(pctLounge * 100)}%
            </span>
          </div>

          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pctLounge >= 0.9 ? 'bg-red-500' : pctLounge >= 0.6 ? 'bg-yellow-400' : 'bg-green-500'
              }`}
              style={{ width: `${Math.round(pctLounge * 100)}%` }}
            />
          </div>

          <div className="text-center py-1">
            <span className="text-5xl font-bold text-gray-900">{totalLounges}</span>
            <span className="text-lg text-gray-400 ml-1">/{maxLounges}</span>
          </div>

          {/* Grade dos lounges individuais */}
          <LoungeGrid occ={occ} update={update} />
        </div>

        {/* Zerar tudo */}
        <button
          onClick={() => {
            const senha = window.prompt('Digite a senha para zerar:');
            if (senha === null) return;
            if (senha !== '@!$') { window.alert('Senha incorreta.'); return; }
            update({ beach: 0, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0), prime: 0, parceiros: 0, colaboradores: occ.colaboradores });
          }}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors"
        >
          Zerar tudo
        </button>

      </div>

      <div className="text-center py-6">
        <p className="text-[10px] text-gray-300 leading-tight">Desenvolvido por</p>
        <p className="text-[11px] font-bold text-gray-400 leading-tight">H8 Sistemas</p>
      </div>
    </div>
  );
}
