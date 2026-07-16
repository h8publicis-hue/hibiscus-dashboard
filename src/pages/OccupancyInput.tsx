import { useState, useEffect, useRef, useCallback } from 'react';
import { OccupancyState, SPACE_CONFIGS, LoungeInfo, LoungeReserva, LOUNGE_INFO_EMPTY } from '../types';

const LOUNGE_GROUPS = [
  { label: 'Frente Mar', ids: [0, 2, 4, 6, 8, 10, 12] },
  { label: 'Atrás',      ids: [1, 3, 5, 7, 9, 11, 13] },
  { label: 'Anexo',      ids: [14] },
  { label: 'Prime ★',    ids: [15] },
  { label: 'Gramado',    ids: [16, 17] },
] as const;

const CANAIS   = ['', 'Balcão', 'Paytour', 'Comercial', 'Diretoria', 'Edilene', 'Outros'] as const;
const VEICULOS = ['', 'TX/UBER/PRIV', 'Particular', 'Luck', 'WS', 'CTZ', 'Van', 'Não identificado'] as const;

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function todayBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
}

function emptyInfo(): LoungeInfo { return { ...LOUNGE_INFO_EMPTY }; }

const DEFAULT: OccupancyState = {
  beach: 0, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0),
  prime: 0, parceiros: 0, colaboradores: 0,
  loungeObs: Array(SPACE_CONFIGS.lounge.count).fill(''),
  loungeData: Array(SPACE_CONFIGS.lounge.count).fill(null).map(emptyInfo),
};

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }

async function fetchOcc(): Promise<OccupancyState & { reservasHoje?: LoungeReserva[] }> {
  try {
    const r = await fetch('/api/ocupacao');
    if (!r.ok) throw new Error();
    const d = await r.json() as any;
    return {
      beach:         clamp(d.beach ?? 0, 0, 500),
      lounges:       Array(SPACE_CONFIGS.lounge.count).fill(0).map((_, i) => clamp(d.lounges?.[i] ?? 0, 0, 10)),
      prime:         clamp(d.prime ?? 0, 0, 10),
      parceiros:     clamp(d.parceiros ?? 0, 0, 999),
      colaboradores: clamp(d.colaboradores ?? 0, 0, 999),
      loungeObs:     Array(SPACE_CONFIGS.lounge.count).fill('').map((_, i) => d.loungeObs?.[i] ?? ''),
      loungeData:    Array(SPACE_CONFIGS.lounge.count).fill(null).map((_, i) => d.loungeData?.[i] ?? emptyInfo()),
      reservasHoje:  Array.isArray(d.reservasHoje) ? d.reservasHoje : [],
    };
  } catch { return { ...DEFAULT, reservasHoje: [] }; }
}

async function saveOcc(state: OccupancyState) {
  await fetch('/api/ocupacao', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
}

async function upsertReserva(reserva: LoungeReserva) {
  await fetch(`/api/ocupacao?action=reservas&data=${reserva.data}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reserva }),
  });
}

async function fetchReservas(data: string): Promise<LoungeReserva[]> {
  try {
    const r = await fetch(`/api/ocupacao?action=reservas&data=${data}`);
    const j = await r.json() as any;
    return Array.isArray(j.reservas) ? j.reservas : [];
  } catch { return []; }
}

// ── StepBtn com long-press ────────────────────────────────────────────────────
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
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
    >{label}</button>
  );
}

// ── Counter genérico ──────────────────────────────────────────────────────────
function Counter({ label, sublabel, value, max, color, onInc, onDec }: {
  label: string; sublabel?: string; value: number; max: number; color: string;
  onInc: () => void; onDec: () => void;
}) {
  const pct = value / max;
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
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${pct >= 0.9 ? 'bg-red-500' : pct >= 0.6 ? 'bg-yellow-400' : 'bg-green-500'}`}
          style={{ width: `${pctN}%` }} />
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

// ── Formulário de LoungeInfo ──────────────────────────────────────────────────
function LoungeInfoForm({ info, onChange }: { info: LoungeInfo; onChange: (i: LoungeInfo) => void }) {
  const set = (field: keyof LoungeInfo, val: any) => onChange({ ...info, [field]: val });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Nome</label>
          <input value={info.nome} onChange={e => set('nome', e.target.value)}
            placeholder="Nome do cliente" maxLength={100}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300" />
        </div>
        <div className="w-36 flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Telefone</label>
          <input value={info.telefone} onChange={e => set('telefone', e.target.value)}
            placeholder="(00) 00000-0000" maxLength={30}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300" />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Canal</label>
          <select value={info.canal} onChange={e => set('canal', e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300">
            {CANAIS.map(c => <option key={c} value={c}>{c || '— selecionar —'}</option>)}
          </select>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Veículo</label>
          <select value={info.veiculo} onChange={e => set('veiculo', e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300">
            {VEICULOS.map(v => <option key={v} value={v}>{v || '— selecionar —'}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Parceiro</label>
          <input value={info.parceiro} onChange={e => set('parceiro', e.target.value)}
            placeholder="Nome do parceiro" maxLength={100}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300" />
        </div>
        <div className="w-32 flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cód. Parceiro</label>
          <input value={info.codParceiro} onChange={e => set('codParceiro', e.target.value)}
            placeholder="Código" maxLength={50}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Observação</label>
        <textarea value={info.obs} onChange={e => set('obs', e.target.value)}
          placeholder="Informações adicionais..." rows={2} maxLength={500}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300" />
      </div>
    </div>
  );
}

// ── Modal de edição do lounge ─────────────────────────────────────────────────
function LoungeModal({ idx, value, info: infoInit, currentBeach, max, onClose, onSave }: {
  idx: number; value: number; info: LoungeInfo; currentBeach: number; max: number;
  onClose: () => void;
  onSave: (novoLounge: number, novoBeach: number, info: LoungeInfo) => void;
}) {
  const [qty,  setQty]  = useState(value);
  const [info, setInfo] = useState<LoungeInfo>({ ...infoInit });
  const [step, setStep] = useState<'edit' | 'transfer'>('edit');
  const name  = SPACE_CONFIGS.lounge.start + idx;
  const delta = qty - value;

  function handleConfirm() {
    if (delta > 0) { setStep('transfer'); }
    else { onSave(qty, currentBeach, info); onClose(); }
  }

  function handleTransfer(isTransfer: boolean) {
    const novoBeach = isTransfer ? clamp(currentBeach - delta, 0, SPACE_CONFIGS.beach.max) : currentBeach;
    onSave(qty, novoBeach, { ...info, transferido: isTransfer });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

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
              <div className={`h-full rounded-full transition-all ${qty / max >= 0.9 ? 'bg-red-500' : qty / max >= 0.6 ? 'bg-yellow-400' : 'bg-green-500'}`}
                style={{ width: `${Math.round((qty / max) * 100)}%` }} />
            </div>

            {info.transferido && (
              <p className="text-xs text-orange-500 font-medium flex items-center gap-1">🔄 Transferência do Beach registrada</p>
            )}

            <LoungeInfoForm info={info} onChange={setInfo} />

            <button onClick={handleConfirm}
              className="w-full py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold active:bg-gray-700">
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
              <button onClick={() => handleTransfer(true)}
                className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-semibold active:bg-orange-600">
                Sim — abater {delta} do Beach (Beach: {currentBeach} → {clamp(currentBeach - delta, 0, SPACE_CONFIGS.beach.max)})
              </button>
              <button onClick={() => handleTransfer(false)}
                className="w-full py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold active:bg-gray-700">
                Não — entrada direta no Lounge
              </button>
              <button onClick={() => setStep('edit')}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600">← Voltar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Modal de nova reserva ─────────────────────────────────────────────────────
function ReservaModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (r: LoungeReserva) => void;
}) {
  const hoje = todayBRT();
  const [loungeNum, setLoungeNum] = useState(501);
  const [data,      setData]      = useState(hoje);
  const [info,      setInfo]      = useState<LoungeInfo>(emptyInfo());
  const [saving,    setSaving]    = useState(false);

  async function handleSave() {
    if (!info.nome.trim()) return alert('Informe o nome do cliente.');
    setSaving(true);
    const reserva: LoungeReserva = {
      id: uuid(), loungeIdx: loungeNum - 501, data,
      info, status: 'reserva', criadaEm: Date.now(),
    };
    await upsertReserva(reserva);
    onSave(reserva);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800">Nova Reserva</h3>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">✕</button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Lounge</label>
            <select value={loungeNum} onChange={e => setLoungeNum(Number(e.target.value))}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300">
              {Array.from({ length: SPACE_CONFIGS.lounge.count }, (_, i) => (
                <option key={i} value={501 + i}>Lounge {501 + i}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Data</label>
            <input type="date" value={data} min={hoje}
              onChange={e => setData(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
          </div>
        </div>

        <LoungeInfoForm info={info} onChange={setInfo} />

        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 rounded-2xl bg-blue-600 text-white text-sm font-semibold active:bg-blue-700 disabled:opacity-50">
          {saving ? 'Salvando...' : 'Confirmar Reserva'}
        </button>
      </div>
    </div>
  );
}

// ── Modal para gerenciar reservas do dia ──────────────────────────────────────
function ReservasModal({ reservas, onClose, onUpdate }: {
  reservas: LoungeReserva[];
  onClose: () => void;
  onUpdate: (r: LoungeReserva) => void;
}) {
  const ativas = reservas.filter(r => r.status === 'reserva' || r.status === 'confirmada');

  async function changeStatus(reserva: LoungeReserva, status: LoungeReserva['status']) {
    const updated = { ...reserva, status };
    await upsertReserva(updated);
    onUpdate(updated);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800">Reservas de Hoje</h3>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">✕</button>
        </div>

        {ativas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma reserva ativa para hoje</p>
        ) : ativas.map(r => (
          <div key={r.id} className="border border-blue-200 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Lounge {501 + r.loungeIdx}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.status === 'confirmada' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {r.status === 'confirmada' ? '✓ Confirmada' : 'Aguardando'}
              </span>
            </div>
            {r.info.nome && <p className="text-xs text-gray-600">{r.info.nome} {r.info.telefone ? `· ${r.info.telefone}` : ''}</p>}
            {r.info.canal && <p className="text-xs text-gray-400">Canal: {r.info.canal}</p>}
            {r.info.obs   && <p className="text-xs text-gray-400 italic">"{r.info.obs}"</p>}
            <div className="flex gap-2 pt-1">
              {r.status === 'reserva' && (
                <button onClick={() => changeStatus(r, 'confirmada')}
                  className="flex-1 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold active:bg-green-700">
                  ✓ Confirmou que vem
                </button>
              )}
              <button onClick={() => changeStatus(r, 'chegou')}
                className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold active:bg-gray-700">
                Chegou
              </button>
              <button onClick={() => changeStatus(r, 'cancelada')}
                className="px-3 py-2 rounded-xl border border-red-200 text-red-500 text-xs font-semibold active:bg-red-50">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Grade dos lounges ─────────────────────────────────────────────────────────
function LoungeGrid({ occ, reservas, update, onReservaUpdate }: {
  occ: OccupancyState;
  reservas: LoungeReserva[];
  update: (s: OccupancyState) => void;
  onReservaUpdate: (r: LoungeReserva) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [moveOrigem, setMoveOrigem] = useState<number | null>(null);

  function hasActiveReserva(idx: number) {
    return reservas.some(r => r.loungeIdx === idx && (r.status === 'reserva' || r.status === 'confirmada'));
  }

  function cellColor(v: number, p: number, idx: number) {
    if (hasActiveReserva(idx) && v === 0) return 'bg-blue-50 border-blue-300 text-blue-600 border-dashed';
    if (v === 0) return 'bg-gray-50 border-gray-200 text-gray-400';
    if (p >= 0.9) return 'bg-red-100 border-red-400 text-red-700';
    if (p >= 0.6) return 'bg-yellow-100 border-yellow-400 text-yellow-700';
    return 'bg-green-100 border-green-400 text-green-700';
  }

  function executarMove(ori: number, dest: number) {
    const oriNum = SPACE_CONFIGS.lounge.start + ori;
    const destNum = SPACE_CONFIGS.lounge.start + dest;
    const destOcup = occ.lounges[dest] > 0;
    const msg = destOcup
      ? `Mover Lounge ${oriNum} → ${destNum}?\n\nATENÇÃO: o destino já tem ${occ.lounges[dest]} pessoa(s). Os dados serão substituídos.`
      : `Mover Lounge ${oriNum} → ${destNum}?\n\nTodos os dados serão transferidos.`;
    if (!window.confirm(msg)) return;
    const lounges    = [...occ.lounges];
    const loungeData = [...(occ.loungeData ?? Array(SPACE_CONFIGS.lounge.count).fill(null).map(emptyInfo))];
    const loungeObs  = [...occ.loungeObs];
    lounges[dest]    = lounges[ori];
    loungeData[dest] = { ...loungeData[ori] };
    loungeObs[dest]  = loungeObs[ori];
    lounges[ori]     = 0;
    loungeData[ori]  = emptyInfo();
    loungeObs[ori]   = '';
    update({ ...occ, lounges, loungeData, loungeObs });
    setMoveOrigem(null);
  }

  function handleChegou(reserva: LoungeReserva) {
    // Converte reserva em ocupação real
    const idx = reserva.loungeIdx;
    const lounges   = [...occ.lounges];
    const loungeData = [...(occ.loungeData ?? Array(SPACE_CONFIGS.lounge.count).fill(null).map(emptyInfo))];
    lounges[idx]    = clamp(lounges[idx] + 1, 0, SPACE_CONFIGS.lounge.max);
    loungeData[idx] = { ...reserva.info, transferido: false };
    update({ ...occ, lounges, loungeData });
    onReservaUpdate({ ...reserva, status: 'chegou' });
    upsertReserva({ ...reserva, status: 'chegou' });
  }

  function LoungeCell({ idx }: { idx: number }) {
    const v   = occ.lounges[idx];
    const p   = v / SPACE_CONFIGS.lounge.max;
    const num = SPACE_CONFIGS.lounge.start + idx;
    const info = occ.loungeData?.[idx];
    const hasData = info && (info.nome || info.obs || info.canal || info.veiculo || info.parceiro || info.telefone);
    const transferred = info?.transferido;
    const reserva = reservas.find(r => r.loungeIdx === idx && (r.status === 'reserva' || r.status === 'confirmada'));
    const isOrigem = moveOrigem !== null && moveOrigem >= 0 && moveOrigem === idx;
    const inMoveMode = moveOrigem !== null;

    function handleClick() {
      if (!inMoveMode) { setEditing(idx); return; }
      // Waiting for origin selection
      if (moveOrigem === -1) {
        if (v === 0) { window.alert('Selecione um lounge ocupado como origem.'); return; }
        setMoveOrigem(idx);
        return;
      }
      // Origin already selected
      if (isOrigem) { setMoveOrigem(-1); return; } // deselect origin, pick again
      if (idx === moveOrigem) return;
      executarMove(moveOrigem, idx);
    }

    let extraBorder = '';
    if (inMoveMode) {
      if (isOrigem) extraBorder = '!border-orange-400 !bg-orange-50 !text-orange-700 animate-pulse';
      else if (moveOrigem === -1 && v > 0) extraBorder = '!border-green-400';
      else if (moveOrigem >= 0 && !isOrigem) extraBorder = v === 0
        ? '!border-blue-300 border-dashed'
        : '!border-purple-300';
    }

    return (
      <div className="relative">
        <button onClick={handleClick}
          className={`w-full rounded-lg flex flex-col items-center justify-center py-2.5 border-2 transition-colors active:scale-95 ${cellColor(v, p, idx)} ${extraBorder}`}>
          <span className="text-[9px] opacity-60 leading-none">{num}</span>
          {reserva && v === 0 ? (
            <span className="text-[10px] font-bold leading-tight">📋</span>
          ) : (
            <span className="text-xl font-black leading-tight">{v}</span>
          )}
          <div className="w-5 h-0.5 bg-black/10 rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-current rounded-full" style={{ width: `${Math.round(p * 100)}%` }} />
          </div>
        </button>
        {hasData  && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-white" />}
        {transferred && <span className="absolute top-0.5 left-0.5 text-[9px] leading-none">🔄</span>}
        {reserva && v === 0 && (
          <button onClick={() => handleChegou(reserva)}
            className="absolute -bottom-1 left-0 right-0 mx-auto w-fit text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
            chegou
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Botão mover + banner de instrução */}
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => setMoveOrigem(prev => prev !== null ? null : -1)}
          className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
            moveOrigem !== null
              ? 'bg-orange-100 text-orange-700 border border-orange-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {moveOrigem !== null ? '✕ Cancelar mover' : '↔ Mover lounge'}
        </button>
        {moveOrigem !== null && moveOrigem === -1 && (
          <span className="text-[10px] text-gray-400">Toque no lounge de origem</span>
        )}
        {moveOrigem !== null && moveOrigem >= 0 && (
          <span className="text-[10px] text-orange-600 font-semibold">
            {SPACE_CONFIGS.lounge.start + moveOrigem} selecionado → toque no destino
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 pt-1">
        {[LOUNGE_GROUPS[0], LOUNGE_GROUPS[1]].map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              {group.label.includes('★') ? <>{group.label.replace('★','')}<span className="text-yellow-400">★</span></> : group.label}
            </p>
            <div className="grid grid-cols-7 gap-1.5">
              {group.ids.map(idx => <LoungeCell key={idx} idx={idx} />)}
            </div>
          </div>
        ))}

        <div className="flex gap-4">
          {[LOUNGE_GROUPS[2], LOUNGE_GROUPS[3], LOUNGE_GROUPS[4]].map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                {group.label.includes('★') ? <>{group.label.replace('★','')}<span className="text-yellow-400">★</span></> : group.label}
              </p>
              <div className="flex gap-1.5">
                {group.ids.map(idx => <LoungeCell key={idx} idx={idx} />)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing !== null && (
        <LoungeModal
          idx={editing}
          value={occ.lounges[editing]}
          info={occ.loungeData?.[editing] ?? emptyInfo()}
          currentBeach={occ.beach}
          max={SPACE_CONFIGS.lounge.max}
          onClose={() => setEditing(null)}
          onSave={(novoLounge, novoBeach, novaInfo) => {
            const lounges    = [...occ.lounges];
            const loungeData = [...(occ.loungeData ?? Array(SPACE_CONFIGS.lounge.count).fill(null).map(emptyInfo))];
            const loungeObs  = [...occ.loungeObs];
            lounges[editing]    = novoLounge;
            loungeData[editing] = novaInfo;
            loungeObs[editing]  = novaInfo.obs;
            update({ ...occ, lounges, loungeData, loungeObs, beach: novoBeach });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function getLogoBase64(): Promise<string> {
  try {
    const r = await fetch('/logo.png');
    const blob = await r.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return ''; }
}

async function gerarPDF(occ: OccupancyState, reservas: LoungeReserva[], dataRef?: string) {
  const today = dataRef || todayBRT();
  const totalOcup = occ.lounges.reduce((a, b) => a + b, 0);
  const logoSrc = await getLogoBase64();

  const linhas = Array.from({ length: SPACE_CONFIGS.lounge.count }, (_, i) => {
    const num   = 501 + i;
    const v     = occ.lounges[i];
    const info  = occ.loungeData?.[i];
    const res   = reservas.filter(r => r.loungeIdx === i && r.status !== 'cancelada');
    return { num, v, info, res };
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Relatório Lounges ${today}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 20px; }
    .header { display:flex; align-items:center; gap:14px; margin-bottom:14px; border-bottom:2px solid #1a1a2e; padding-bottom:10px; }
    .header img { height:52px; width:auto; }
    .header-text { display:flex; flex-direction:column; gap:2px; }
    .header-text .club { font-size:17px; font-weight:800; color:#1a1a2e; letter-spacing:-0.3px; }
    .header-text .report { font-size:12px; color:#555; }
    .header-text .meta { font-size:10px; color:#888; margin-top:2px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1a1a2e; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:nth-child(even) td { background: #f8f8f8; }
    .reserva { color: #1d4ed8; font-size: 10px; }
    .chip { display:inline-block; padding:1px 6px; border-radius:99px; font-size:9px; margin-right:3px; }
    .verde { background:#dcfce7; color:#166534; }
    .azul  { background:#dbeafe; color:#1d4ed8; }
    .trans { color:#f97316; font-size:10px; }
    .sumario { margin-top:16px; padding:10px; background:#f1f5f9; border-radius:8px; }
  </style></head><body>
  <div class="header">
    ${logoSrc ? `<img src="${logoSrc}" alt="Hibiscus" />` : ''}
    <div class="header-text">
      <span class="club">Hibiscus Beach Club</span>
      <span class="report">🛋️ Relatório de Lounges</span>
      <span class="meta">Data: ${today.split('-').reverse().join('/')} · Gerado em: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Recife' })}</span>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>Lounge</th><th>Pax</th><th>Nome</th><th>Tel</th><th>Canal</th><th>Veículo</th><th>Parceiro</th><th>Cód</th><th>Obs</th><th>Flags</th>
    </tr></thead>
    <tbody>
    ${linhas.map(({ num, v, info, res }) => {
      // Só reservas pendentes/confirmadas (não chegou/cancelada)
      const activeRes = res.filter(r => r.status === 'reserva' || r.status === 'confirmada');
      const rows: string[] = [];

      const hasInfoData = info && (info.nome || info.canal || info.veiculo || info.parceiro || info.telefone || info.obs);

      if (activeRes.length > 0 && v === 0) {
        // Lounge livre com reserva ativa: mostra reservas (sem linha de ocupação)
        activeRes.forEach(r => {
          rows.push(`<tr>
            <td><b>${num}</b></td>
            <td><span class="chip azul">Reserva</span></td>
            <td>${r.info.nome || ''}</td>
            <td>${r.info.telefone || ''}</td>
            <td>${r.info.canal || ''}</td>
            <td>${r.info.veiculo || ''}</td>
            <td>${r.info.parceiro || ''}</td>
            <td>${r.info.codParceiro || ''}</td>
            <td class="reserva">${r.info.obs || ''}</td>
            <td></td>
          </tr>`);
        });
      } else if (v > 0 || hasInfoData) {
        // Lounge ocupado OU com dados preenchidos: mostra dados de ocupação
        rows.push(`<tr>
          <td><b>${num}</b></td>
          <td>${v > 0 ? `<span class="chip verde">${v} pax</span>` : '<span style="color:#bbb">0 pax</span>'}</td>
          <td>${info?.nome || ''}</td>
          <td>${info?.telefone || ''}</td>
          <td>${info?.canal || ''}</td>
          <td>${info?.veiculo || ''}</td>
          <td>${info?.parceiro || ''}</td>
          <td>${info?.codParceiro || ''}</td>
          <td>${info?.obs || ''}</td>
          <td>${info?.transferido ? '<span class="trans">🔄 Transfer</span>' : ''}</td>
        </tr>`);
      } else {
        rows.push(`<tr><td><b>${num}</b></td><td colspan="9" style="color:#bbb">—</td></tr>`);
      }
      return rows.join('');
    }).join('')}
    </tbody>
  </table>
  <div class="sumario">
    <b>Resumo do dia</b><br>
    Total ocupado: <b>${totalOcup}</b> pax em lounges ·
    Beach: <b>${occ.beach}</b> ·
    Parceiros: <b>${occ.parceiros}</b> ·
    Reservas ativas: <b>${reservas.filter(r => r.status === 'reserva' || r.status === 'confirmada').length}</b>
  </div>
  </body></html>`;

  const win = window.open('', '_blank');
  if (!win) return alert('Permita pop-ups para exportar o PDF.');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

// ── Histórico de dias anteriores ─────────────────────────────────────────────
function HistoricoBtn() {
  const [data,    setData]    = useState('');
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState('');
  const hoje = todayBRT();

  async function handleCarregar() {
    if (!data) return;
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`/api/ocupacao?action=historico&data=${data}`);
      const j = await r.json() as any;
      if (!j.historico) { setMsg('Nenhum histórico encontrado para esta data.'); return; }
      const hist = j.historico;
      const occHist: OccupancyState = {
        beach:         hist.beach ?? 0,
        lounges:       Array(SPACE_CONFIGS.lounge.count).fill(0).map((_: unknown, i: number) => hist.lounges?.[i] ?? 0),
        prime:         hist.prime ?? 0,
        parceiros:     hist.parceiros ?? 0,
        colaboradores: hist.colaboradores ?? 0,
        loungeObs:     Array(SPACE_CONFIGS.lounge.count).fill('').map((_: unknown, i: number) => hist.loungeObs?.[i] ?? ''),
        loungeData:    Array(SPACE_CONFIGS.lounge.count).fill(null).map((_: unknown, i: number) => hist.loungeData?.[i] ?? emptyInfo()),
      };
      const reservasHist: LoungeReserva[] = [];
      gerarPDF(occHist, reservasHist, data);
    } catch { setMsg('Erro ao carregar histórico.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="date" value={data} max={hoje}
          onChange={e => { setData(e.target.value); setMsg(''); }}
          className="flex-1 rounded-2xl border-2 border-dashed border-gray-200 px-3 py-2.5 text-sm text-gray-600 focus:outline-none focus:border-blue-300"
        />
        <button
          onClick={handleCarregar} disabled={!data || loading}
          className="px-4 py-2.5 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-500 transition-colors disabled:opacity-40"
        >
          {loading ? '...' : '🕐 Histórico'}
        </button>
      </div>
      {msg && <p className="text-xs text-center text-gray-400">{msg}</p>}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export function OccupancyInput() {
  const [occ,      setOcc]      = useState<OccupancyState>({ ...DEFAULT });
  const [reservas, setReservas] = useState<LoungeReserva[]>([]);
  const [saved,    setSaved]    = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [showReservaModal,  setShowReservaModal]  = useState(false);
  const [showReservasModal, setShowReservasModal] = useState(false);
  const [alertaReservas, setAlertaReservas] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const occRef    = useRef(occ);
  occRef.current  = occ;

  useEffect(() => {
    fetchOcc().then(d => {
      const { reservasHoje, ...rest } = d as any;
      setOcc(rest);
      setReservas(reservasHoje ?? []);
      setLoading(false);
    });
    const id = setInterval(() => fetchOcc().then(d => {
      const { reservasHoje, ...rest } = d as any;
      setOcc(rest);
      setReservas(reservasHoje ?? []);
    }), 30_000);
    return () => clearInterval(id);
  }, []);

  // Alerta 10h30
  useEffect(() => {
    function checkAlerta() {
      const agora = new Date();
      const brt = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Recife' }));
      const h = brt.getHours(), m = brt.getMinutes();
      const depois1030 = h > 10 || (h === 10 && m >= 30);
      const pendentes = reservas.filter(r => r.data === todayBRT() && r.status === 'reserva').length;
      setAlertaReservas(depois1030 && pendentes > 0);
    }
    checkAlerta();
    const id = setInterval(checkAlerta, 60_000);
    return () => clearInterval(id);
  }, [reservas]);

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
  const badgeColor   = (pct: number) =>
    pct >= 0.9 ? 'bg-red-100 text-red-700' : pct >= 0.6 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';

  const reservasAtivas = reservas.filter(r => r.data === todayBRT() && (r.status === 'reserva' || r.status === 'confirmada'));

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

      {/* Banner alerta 10h30 */}
      {alertaReservas && (
        <div
          className="animate-pulse bg-amber-400 text-amber-900 text-sm font-semibold text-center py-2.5 px-4 cursor-pointer"
          onClick={() => setShowReservasModal(true)}
        >
          ⚠️ {reservasAtivas.filter(r => r.status === 'reserva').length} reserva(s) pendente(s) — confirmar com o comercial
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-5 flex flex-col gap-4">

        {/* Parceiros */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">🤝 Parceiros</p>
              <p className="text-xs text-gray-400">Uber, Táxi e Guias</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">hoje</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <StepBtn label="−" onClick={() => update({ ...occRef.current, parceiros: clamp((occRef.current.parceiros ?? 0) - 1, 0, 999) })} />
            <div className="flex-1 text-center">
              <span className="text-5xl font-bold text-gray-900">{occ.parceiros ?? 0}</span>
            </div>
            <StepBtn label="+" onClick={() => update({ ...occRef.current, parceiros: clamp((occRef.current.parceiros ?? 0) + 1, 0, 999) })} />
          </div>
          <p className="text-xs text-gray-300 text-center">Toque e segure +/− para alterar rapidamente</p>
        </div>

        {/* Beach */}
        <Counter
          label="🏖️ Beach"
          sublabel={`Capacidade total: ${SPACE_CONFIGS.beach.max} pessoas`}
          value={occ.beach} max={SPACE_CONFIGS.beach.max} color={badgeColor(pctBeach)}
          onInc={() => update({ ...occRef.current, beach: clamp(occRef.current.beach + 1, 0, SPACE_CONFIGS.beach.max) })}
          onDec={() => update({ ...occRef.current, beach: clamp(occRef.current.beach - 1, 0, SPACE_CONFIGS.beach.max) })}
        />

        {/* Lounges */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">🛋️ Lounges</p>
              <p className="text-xs text-gray-400">{SPACE_CONFIGS.lounge.count} lounges · {SPACE_CONFIGS.lounge.max} espreguiçadeiras cada</p>
            </div>
            <div className="flex items-center gap-2">
              {reservasAtivas.length > 0 && (
                <button onClick={() => setShowReservasModal(true)}
                  className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  📋 {reservasAtivas.length}
                </button>
              )}
              <button onClick={() => setShowReservaModal(true)}
                className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">
                + Reserva
              </button>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor(pctLounge)}`}>
                {Math.round(pctLounge * 100)}%
              </span>
            </div>
          </div>

          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${pctLounge >= 0.9 ? 'bg-red-500' : pctLounge >= 0.6 ? 'bg-yellow-400' : 'bg-green-500'}`}
              style={{ width: `${Math.round(pctLounge * 100)}%` }} />
          </div>

          <div className="text-center py-1">
            <span className="text-5xl font-bold text-gray-900">{totalLounges}</span>
            <span className="text-lg text-gray-400 ml-1">/{maxLounges}</span>
          </div>

          <LoungeGrid
            occ={occ} reservas={reservas}
            update={update}
            onReservaUpdate={r => setReservas(prev => prev.map(x => x.id === r.id ? r : x))}
          />
        </div>

        {/* Exportar PDF */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => gerarPDF(occ, reservas)}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-blue-200 text-sm text-blue-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            📄 Exportar relatório de hoje (PDF)
          </button>
          <HistoricoBtn />
        </div>

        {/* Zerar tudo */}
        <button
          onClick={() => {
            const senha = window.prompt('Digite a senha para zerar:');
            if (senha === null) return;
            if (senha !== '@!$') { window.alert('Senha incorreta.'); return; }
            update({
              beach: 0, lounges: Array(SPACE_CONFIGS.lounge.count).fill(0),
              prime: 0, parceiros: 0, colaboradores: occRef.current.colaboradores,
              loungeObs: Array(SPACE_CONFIGS.lounge.count).fill(''),
              loungeData: Array(SPACE_CONFIGS.lounge.count).fill(null).map(emptyInfo),
            });
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

      {showReservaModal  && <ReservaModal  onClose={() => setShowReservaModal(false)}  onSave={r => setReservas(prev => [...prev, r])} />}
      {showReservasModal && <ReservasModal reservas={reservasAtivas} onClose={() => setShowReservasModal(false)}
        onUpdate={r => setReservas(prev => prev.map(x => x.id === r.id ? r : x))} />}
    </div>
  );
}
