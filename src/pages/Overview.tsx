import { Users, Star, Target, MessageSquare, Smile, Info, Megaphone, X, Check, Pencil } from 'lucide-react';
import { ReviewsTicker } from '../components/ReviewsTicker';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useSurveyMonkey } from '../hooks/useSurveyMonkey';
import { useGoogleBusiness } from '../hooks/useGoogleBusiness';
import { usePaytour } from '../hooks/usePaytour';

import { useMonthRevenue } from '../hooks/useMonthRevenue';
import { useReceitaABS } from '../hooks/useReceitaABS';
import { useCheckin, checkinManualLogin } from '../hooks/useCheckin';
import { fetchNextMonthVisitData, NextMonthVisit } from '../services/paytour';
import { Period, Goals, OccupancyState, SPACE_CONFIGS } from '../types';
import { useAviso, AvisoList } from '../hooks/useAviso';
import { useChamadas, parseTempoSec } from '../hooks/useChamadas';
import clsx from 'clsx';

interface OverviewProps {
  period: Period;
  goals:  Goals;
  occupancy: OccupancyState;
}

// ── Tooltip de informação ─────────────────────────────────────────────────────
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<{ x: string; arrow: string }>({ x: '-translate-x-1/2 left-1/2', arrow: 'left-1/2 -translate-x-1/2' });
  const ref     = useRef<HTMLDivElement>(null);
  const tipRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Ajusta posição horizontal para não sair da tela
  useEffect(() => {
    if (!open || !tipRef.current || !ref.current) return;
    const tip    = tipRef.current.getBoundingClientRect();
    const margin = 8;
    if (tip.left < margin) {
      setPos({ x: 'left-0', arrow: 'left-3' });
    } else if (tip.right > window.innerWidth - margin) {
      setPos({ x: 'right-0', arrow: 'right-3' });
    } else {
      setPos({ x: '-translate-x-1/2 left-1/2', arrow: 'left-1/2 -translate-x-1/2' });
    }
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => { setPos({ x: '-translate-x-1/2 left-1/2', arrow: 'left-1/2 -translate-x-1/2' }); setOpen(o => !o); }}
        className="text-gray-300 hover:text-brand-500 dark:text-gray-500 dark:hover:text-brand-400 transition-colors"
        aria-label="Saiba mais"
      >
        <Info size={11} />
      </button>
      {open && (
        <div
          ref={tipRef}
          className={`absolute z-50 bottom-full mb-2 w-56 bg-gray-900 dark:bg-gray-700 text-white text-[11px] leading-relaxed rounded-lg px-3 py-2 shadow-xl ${pos.x}`}
        >
          {text}
          <div className={`absolute top-full border-4 border-transparent border-t-gray-900 dark:border-t-gray-700 ${pos.arrow}`} />
        </div>
      )}
    </div>
  );
}

function fmtN(v: number) {
  return v.toLocaleString('pt-BR');
}

function monthName(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ── Linha compacta Beach / Prime ──────────────────────────────────────────────
function OccupancyRow({ label, current, max }: { label: string; current: number; max: number }) {
  const pct  = current / max;
  const bar  = pct >= 0.9 ? 'bg-red-500' : pct >= 0.6 ? 'bg-yellow-400' : 'bg-green-500';
  const text = pct >= 0.9 ? 'text-red-600' : pct >= 0.6 ? 'text-yellow-600' : 'text-green-600';
  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-300', bar)} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <span className={clsx('text-xs font-bold w-12 text-right shrink-0', text)}>{current}/{max}</span>
    </div>
  );
}

// ── Grupos de lounges ────────────────────────────────────────────────────────
const LOUNGE_GROUPS = [
  { label: 'Frente Mar', ids: [0, 2, 4, 6, 8, 10, 12] },
  { label: 'Atrás',      ids: [1, 3, 5, 7, 9, 11, 13] },
  { label: 'Anexo',      ids: [14] },
  { label: 'Prime ★',    ids: [15] },
  { label: 'Gramado',    ids: [16, 17] },
] as const;

const MONTH_REV_TTL = 60 * 60 * 1000; // 1h — igual ao hook

function SyncCountdown({ ts }: { ts: number }) {
  const [pct, setPct] = useState(() => Math.max(0, 1 - (Date.now() - ts) / MONTH_REV_TTL));

  useEffect(() => {
    const id = setInterval(() => {
      const p = Math.max(0, 1 - (Date.now() - ts) / MONTH_REV_TTL);
      setPct(p);
    }, 10_000); // atualiza a cada 10s
    return () => clearInterval(id);
  }, [ts]);

  const mins = Math.ceil((ts + MONTH_REV_TTL - Date.now()) / 60_000);
  const color = pct > 0.5 ? 'bg-green-400' : pct > 0.2 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="mt-1">
      <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
        <span>Próxima atualização</span>
        <span>{mins > 0 ? `em ${mins} min` : 'atualizando...'}</span>
      </div>
      <div className="h-0.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-[10s]', color)} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
    </div>
  );
}

function LoungeLabel({ label, className }: { label: string; className?: string }) {
  if (!label.includes('★')) return <span className={className}>{label}</span>;
  const [before] = label.split('★');
  return <span className={className}>{before}<span className="text-yellow-400">★</span></span>;
}

function loungeBg(v: number, pct: number) {
  if (v === 0) return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';
  if (pct >= 0.9) return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-600';
  if (pct >= 0.6) return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-600';
  return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-600';
}

// ── Mapa de lounges — desktop ────────────────────────────────────────────────
function LoungeMap({ lounges, loungeObs, loungeData, reservas }: { lounges: number[]; loungeObs?: string[]; loungeData?: import('../types').LoungeInfo[]; reservas?: import('../types').LoungeReserva[] }) {
  const obs = loungeObs ?? [];
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  function hasActiveReserva(idx: number) {
    return (reservas ?? []).some(r => r.loungeIdx === idx && (r.status === 'reserva' || r.status === 'confirmada'));
  }

  function hasInfo(idx: number) {
    if ((lounges[idx] ?? 0) > 0) return true;
    if (hasActiveReserva(idx)) return true;
    const d = loungeData?.[idx];
    return !!(d && (d.nome || d.canal || d.veiculo || d.parceiro || d.obs));
  }

  function LoungeCell({ idx, extraClass }: { idx: number; extraClass?: string }) {
    const v = lounges[idx];
    const pct = v / SPACE_CONFIGS.lounge.max;
    const num = SPACE_CONFIGS.lounge.start + idx;
    const active = hasInfo(idx);
    const reserva = hasActiveReserva(idx) && v === 0;
    const baseBg = reserva
      ? 'bg-blue-50 dark:bg-blue-900/30 border border-dashed border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400'
      : loungeBg(v, pct);
    return (
      <div
        key={idx}
        onClick={() => active && setActiveIdx(idx)}
        className={clsx('relative rounded flex flex-col items-center justify-center py-2 text-center', baseBg, active ? 'cursor-pointer' : '', extraClass)}
      >
        <span className="text-[9px] leading-none opacity-60 font-medium">{num}</span>
        {reserva
          ? <span className="text-base font-bold leading-tight">📋</span>
          : <span className="text-2xl font-black leading-tight">{v}</span>
        }
        {active && !reserva && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-white dark:border-gray-800" />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">🛋️ Lounges</p>

      {/* Frente Mar + Atrás: duas linhas paralelas de 7 */}
      <div className="flex flex-col gap-1">
        {[LOUNGE_GROUPS[0], LOUNGE_GROUPS[1]].map((group) => (
          <div key={group.label} className="flex gap-1 items-center">
            <LoungeLabel label={group.label} className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 w-16 shrink-0 leading-tight" />
            <div className="flex flex-1 gap-1">
              {group.ids.map((idx) => (
                <LoungeCell key={idx} idx={idx} extraClass="flex-1" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Separador visual */}
      <div className="border-t border-gray-100 dark:border-gray-700" />

      {/* Anexo + Gramado à esquerda · Prime★ isolado à direita (abaixo do 514) */}
      <div className="flex items-start justify-between">
        <div className="flex gap-3 items-start">
          {[LOUNGE_GROUPS[2], LOUNGE_GROUPS[4]].map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <LoungeLabel label={group.label} className="text-[10px] font-semibold text-gray-500 dark:text-gray-400" />
              <div className="flex gap-1">
                {group.ids.map((idx) => (
                  <LoungeCell key={idx} idx={idx} extraClass="w-11" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Prime★ — isolado à direita abaixo do 514 */}
        <div className="flex flex-col gap-1 items-end">
          <LoungeLabel label="Prime ★" className="text-[10px] font-semibold text-yellow-600" />
          <div className="flex gap-1">
            {LOUNGE_GROUPS[3].ids.map((idx) => (
              <LoungeCell key={idx} idx={idx} extraClass="w-11 ring-1 ring-yellow-400" />
            ))}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex gap-2">
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-gray-200 dark:bg-gray-600 inline-block"/>Livre</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-green-200 dark:bg-green-800 inline-block"/>Ocupado</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-red-200 dark:bg-red-800 inline-block"/>Cheio</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-blue-200 dark:bg-blue-800 inline-block"/>Reservado</span>
      </div>

      {/* Painel de resumo ao clicar no lounge */}
      {activeIdx !== null && (() => {
        const idx = activeIdx;
        const num = SPACE_CONFIGS.lounge.start + idx;
        const d   = loungeData?.[idx];
        const note = obs[idx] ?? '';
        return (
          <div className="mt-1 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2 flex items-start gap-2">
            <span className="text-amber-500 shrink-0 mt-0.5">📝</span>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Lounge {num} · {lounges[idx]} pax</p>
              {d?.nome      && <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug"><b>Nome:</b> {d.nome}{d.telefone ? ` · ${d.telefone}` : ''}</p>}
              {d?.canal     && <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug"><b>Canal:</b> {d.canal}</p>}
              {d?.veiculo   && <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug"><b>Veículo:</b> {d.veiculo}</p>}
              {d?.parceiro  && <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug"><b>Parceiro:</b> {d.parceiro}{d.codParceiro ? ` (${d.codParceiro})` : ''}</p>}
              {d?.transferido && <p className="text-xs text-orange-500 leading-snug">🔄 Transferência do Beach</p>}
              {(d?.obs || note) && <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug italic">{d?.obs || note}</p>}
            </div>
            <button onClick={() => setActiveIdx(null)} className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 shrink-0">
              <X size={13} />
            </button>
          </div>
        );
      })()}
    </div>
  );
}

// ── Mini KPI compacto ─────────────────────────────────────────────────────────
function MiniKPI({
  icon, label, value, sub, color = 'brand', loading, info,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  loading?: boolean;
  info?: string;
}) {
  const colors: Record<string, string> = {
    brand:  'bg-brand-600',
    green:  'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };
  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-2">
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0', colors[color] ?? colors.brand)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{label}</p>
          {info && <InfoTooltip text={info} />}
        </div>
        {loading
          ? <div className="h-4 w-12 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
          : <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{value}</p>
        }
        {sub && !loading && <p className="text-[9px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ── Mapa de lounges compacto para mobile ─────────────────────────────────────
function LoungeMapMini({ lounges }: { lounges: number[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">🛋️ Lounges</p>

      {[LOUNGE_GROUPS[0], LOUNGE_GROUPS[1]].map((group) => (
        <div key={group.label} className="flex gap-1 items-center">
          <LoungeLabel label={group.label} className="text-[7px] text-gray-400 dark:text-gray-500 w-12 shrink-0 leading-tight" />
          <div className="flex flex-1 gap-0.5">
            {group.ids.map((idx) => {
              const v = lounges[idx];
              const pct = v / SPACE_CONFIGS.lounge.max;
              const num = SPACE_CONFIGS.lounge.start + idx;
              return (
                <div key={idx} className={clsx('flex-1 rounded flex flex-col items-center justify-center py-1 text-center', loungeBg(v, pct))}>
                  <span className="text-[6px] leading-none opacity-60">{num}</span>
                  <span className="text-xs font-black leading-tight">{v}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex gap-2 items-start">
        {[LOUNGE_GROUPS[2], LOUNGE_GROUPS[3], LOUNGE_GROUPS[4]].map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <LoungeLabel label={group.label} className="text-[7px] font-semibold text-gray-500 dark:text-gray-400" />
            <div className="flex gap-0.5">
              {group.ids.map((idx) => {
                const v = lounges[idx];
                const pct = v / SPACE_CONFIGS.lounge.max;
                const num = SPACE_CONFIGS.lounge.start + idx;
                return (
                  <div key={idx} className={clsx('w-8 rounded flex flex-col items-center justify-center py-1 text-center', loungeBg(v, pct))}>
                    <span className="text-[6px] leading-none opacity-60">{num}</span>
                    <span className="text-xs font-black leading-tight">{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <span className="flex items-center gap-1 text-[8px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-gray-200 dark:bg-gray-600 inline-block"/>Livre</span>
        <span className="flex items-center gap-1 text-[8px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-green-200 dark:bg-green-800 inline-block"/>Ocupado</span>
        <span className="flex items-center gap-1 text-[8px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-red-200 dark:bg-red-800 inline-block"/>Cheio</span>
      </div>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
const NPS_PERIODS = [
  { key: 'today', label: 'Hoje' },
  { key: '7d',    label: '7d'   },
  { key: 'month', label: 'Mês'  },
  { key: '30d',   label: '30d'  },
] as const;

export function Overview({ period, goals: _goals, occupancy }: OverviewProps) {
  const [npsPeriod, setNpsPeriod] = useState<string>('month');
  const { data: survey,  loading: smL } = useSurveyMonkey(npsPeriod);
  const { data: google,  loading: gL  } = useGoogleBusiness(period);
  const { data: paytour, loading: ptL } = usePaytour('today');
  const { avisos, saving: avisoSaving, save: saveAvisos } = useAviso();
  const [avisoDismissed, setAvisoDismissed] = useState(false);
  const [avisoEditing,   setAvisoEditing]   = useState(false);
  const [avisoCustom,    setAvisoCustom]    = useState('');
  const [avisoTicker,    setAvisoTicker]    = useState(0);
  const [avisoFade,      setAvisoFade]      = useState(true);
  const [avisoPresetsOpen, setAvisoPresetsOpen] = useState(false);
  const [portariaCount, setPortariaCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch('/api/portaria').then(r => r.json()).then((j: any) => { if (!cancelled) setPortariaCount(Number(j.count ?? 0)); }).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  const { chamadas, loading: chamadasL } = useChamadas();
  const { revenue: monthRevRaw, loading: monthRevL, ts: monthRevTs } = useMonthRevenue();
  const { data: absData, loading: absL } = useReceitaABS();
  const { data: checkinData, loading: checkinL, refresh: checkinRefresh, setData: setCheckinData } = useCheckin();
  const [loginForm, setLoginForm] = useState({ login: '', senha: '', error: '', sending: false });

  const [nextMonth,  setNextMonth]  = useState<NextMonthVisit | null>(null);
  const [nextMonthL, setNextMonthL] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setNextMonthL(true);
    // Atrasa 4s para não competir com os fetches principais (Paytour/Survey/Google) na inicialização
    const delay = setTimeout(() => {
      fetchNextMonthVisitData()
        .then(d  => { if (!cancelled) { setNextMonth(d);  setNextMonthL(false); } })
        .catch(() => { if (!cancelled) { setNextMonthL(false); } });
    }, 4_000);
    return () => { cancelled = true; clearTimeout(delay); };
  }, []);

  // ── Bloco: Ao Vivo ────────────────────────────────────────────────────────
  const todayRevenue = paytour?.todayRevenue ?? 0;
  const blocoAoVivo = (
    <div className="bg-gradient-to-r from-brand-700 to-brand-900 rounded-xl p-4 shadow-sm text-white">
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
        <h2 className="text-xs font-semibold uppercase tracking-wider opacity-90">Paytour — Ao Vivo</h2>
        {ptL && <span className="text-[10px] opacity-60 animate-pulse ml-auto">Carregando...</span>}
      </div>
      {ptL
        ? <div className="space-y-2"><div className="h-6 w-32 bg-white/20 rounded animate-pulse" /><div className="h-3 w-24 bg-white/10 rounded animate-pulse" /></div>
        : (
          <div className="space-y-3">
            <p className="text-2xl font-black">R$ {fmtN(Math.round(todayRevenue))}</p>
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/20">
              {[
                { label: 'Atividades',   val: paytour ? fmtN(paytour.todayItems)  : '—' },
                { label: 'Reservas',     val: paytour ? fmtN(paytour.todayOrders) : '—' },
                { label: 'Ticket médio', val: paytour && paytour.todayOrders > 0 ? `R$ ${fmtN(Math.round(paytour.todayRevenue / paytour.todayOrders))}` : '—' },
              ].map(({ label, val }) => (
                <div key={label} className="text-center">
                  <p className="text-[9px] opacity-60 uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-bold">{val}</p>
                </div>
              ))}
            </div>
          </div>
        )
      }
    </div>
  );

  // ── Bloco: Já Vendido ─────────────────────────────────────────────────────
  const monthRevenue  = monthRevRaw ?? 0;
  const monthGoal     = _goals.receitaTotal;
  const monthPct      = Math.min(monthRevenue / monthGoal, 1);
  const monthPctLabel = Math.round(monthPct * 100);
  const monthAbove    = monthRevenue > monthGoal ? Math.round((monthRevenue / monthGoal - 1) * 100) : 0;
  const blocoJaVendido = (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border border-gray-300 dark:border-gray-600">
      <div className="flex items-center gap-1.5 mb-3">
        <Target size={14} className="text-brand-600" />
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">
          Paytour — {monthName(0)}
        </h2>
      </div>
      {monthRevL
        ? <div className="space-y-2"><div className="h-6 w-32 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" /><div className="h-2 w-full bg-gray-200 dark:bg-gray-600 rounded animate-pulse" /></div>
        : monthRevRaw !== null
            ? (
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <p className="text-2xl font-black text-brand-600 dark:text-brand-400">
                    R$ {fmtN(Math.round(monthRevenue))}
                  </p>
                  {monthAbove > 0 && (
                    <span className="mb-0.5 text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded-full animate-bounce">
                      +{monthAbove}% acima
                    </span>
                  )}
                </div>
                {monthAbove > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-green-600 dark:text-green-400">
                    <span className="animate-ping inline-block w-2 h-2 rounded-full bg-green-500 opacity-75" />
                    <span>🏆 Meta arretada!</span>
                  </div>
                )}
                <div>
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>Meta: R$ {fmtN(monthGoal)}</span>
                    <span className={monthPct >= 1 ? 'text-green-600 font-semibold' : ''}>{monthPctLabel}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all', monthPct >= 1 ? 'bg-green-500' : monthPct >= 0.6 ? 'bg-brand-600' : 'bg-brand-400')}
                      style={{ width: `${monthPctLabel}%` }}
                    />
                  </div>
                </div>
                {monthRevTs && (
                  <p className="text-[10px] text-gray-400 text-right">
                    Atualizado às {new Date(monthRevTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}próx. às {new Date(monthRevTs + 10 * 60 * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            )
            : <p className="text-xs text-gray-400">Sem dados</p>
      }
    </div>
  );

  // ── Bloco: Resumo do Período ──────────────────────────────────────────────
  const blocoResumo = (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border border-gray-300 dark:border-gray-600 flex flex-col">
      <div className="flex items-center gap-1.5 mb-3">
        <Target size={14} className="text-brand-600" />
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Resumo do Período</h2>
      </div>
      {ptL
        ? <div className="flex-1 flex items-center justify-center"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" /></div>
        : paytour
          ? (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Receita',      val: `R$ ${fmtN(Math.round(paytour.totalRevenue))}` },
                { label: 'Pedidos',      val: fmtN(paytour.totalSales) },
                { label: 'Atividades',   val: fmtN(paytour.totalItems) },
                { label: 'Ticket Médio', val: `R$ ${fmtN(Math.round(paytour.averageTicket))}` },
              ].map(({ label, val }) => (
                <div key={label} className="text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">{val}</p>
                </div>
              ))}
            </div>
          )
          : <div className="flex-1 flex items-center justify-center"><p className="text-xs text-gray-400">Sem dados</p></div>
      }
    </div>
  );

  // ── Bloco: Top Produto + Status Reservas ──────────────────────────────────
  const blocoTopProduto = paytour ? (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">🏆 Top Produto</p>
      {paytour.topProducts[0] && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-800 dark:text-white truncate max-w-[60%]">{paytour.topProducts[0].name}</span>
          <span className="text-xs font-bold text-green-600">R$ {fmtN(Math.round(paytour.topProducts[0].revenue))}</span>
        </div>
      )}
      <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
        {[
          { label: 'Confirmadas', val: paytour.reservationStatus.confirmed, color: 'text-green-600' },
          { label: 'Pendentes',   val: paytour.reservationStatus.pending,   color: 'text-yellow-600' },
          { label: 'Canceladas',  val: paytour.reservationStatus.cancelled, color: 'text-red-500' },
        ].map(({ label, val, color }) => (
          <div key={label} className="flex-1 text-center">
            <p className="text-[9px] text-gray-400 uppercase">{label}</p>
            <p className={clsx('text-sm font-bold', color)}>{val}</p>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  // ── Bloco: Última avaliação Google ────────────────────────────────────────
  const blocoAvaliacao = google?.recentReviews?.[0] ? (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">⭐ Última Avaliação</p>
        <span className="text-[10px] text-yellow-500 font-bold">
          {'★'.repeat(google.recentReviews[0].rating)}{'☆'.repeat(5 - google.recentReviews[0].rating)}
        </span>
      </div>
      <p className="text-[11px] text-gray-700 dark:text-gray-300 line-clamp-2 italic">"{google.recentReviews[0].text}"</p>
      <p className="text-[10px] text-gray-400 mt-1">— {google.recentReviews[0].author}</p>
    </div>
  ) : null;

  // ── Bloco: Check-in Online ────────────────────────────────────────────────
  const blocoCheckin = (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border border-gray-300 dark:border-gray-600">
      <div className="flex items-center gap-1.5 mb-3">
        <Users size={14} className="text-brand-500" />
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Check-in Online</h2>
        {checkinData?.sessionActive && (
          <span className="ml-auto text-[9px] text-green-600 dark:text-green-400 font-medium">● loja ativa</span>
        )}
      </div>
      {checkinL ? (
        <div className="h-16 w-full bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Reservados',  val: checkinData?.reservados  ?? '—', color: 'text-purple-600 dark:text-purple-400' },
              { label: 'Disponíveis', val: checkinData?.disponiveis ?? '—', color: 'text-amber-500 dark:text-amber-400' },
              { label: 'Checkins',    val: checkinData?.checkins    ?? '—', color: 'text-green-600 dark:text-green-400' },
              { label: 'Pendentes',   val: checkinData?.pendentes   ?? '—', color: 'text-red-500 dark:text-red-400' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-2 text-center">
                <p className={`text-lg font-black ${color}`}>{val}</p>
                <p className="text-[9px] text-gray-400 mt-0.5 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>
          {checkinData?.sessionActive && (
            <>
              <div className="mt-3 h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: (checkinData.reservados ?? 0) > 0 ? `${Math.round(((checkinData.checkins ?? 0) / checkinData.reservados) * 100)}%` : '0%' }}
                />
              </div>
              <p className="text-[9px] text-gray-400 mt-1 text-center">
                {(checkinData.reservados ?? 0) > 0 ? Math.round(((checkinData.checkins ?? 0) / checkinData.reservados) * 100) : 0}% check-ins concluídos
              </p>
            </>
          )}
          {!checkinData?.sessionActive && (
            <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-[9px] text-gray-400 mb-1.5">
                Para ver check-ins físicos, cole o <strong>PHPSESSID</strong> do{' '}
                <a href="https://loja.hibiscusbeachclub.com.br/admin/checkin" target="_blank" rel="noopener noreferrer"
                  className="text-brand-600 dark:text-brand-400 underline">Paytour</a>:
              </p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="PHPSESSID"
                  value={loginForm.login}
                  onChange={e => setLoginForm(f => ({ ...f, login: e.target.value.trim(), error: '' }))}
                  className="text-xs font-mono border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white flex-1 min-w-0"
                />
                <button
                  disabled={loginForm.sending || !loginForm.login}
                  onClick={async () => {
                    setLoginForm(f => ({ ...f, sending: true, error: '' }));
                    const res = await checkinManualLogin('__phpsessid__', loginForm.login);
                    if (res.ok) {
                      setLoginForm({ login: '', senha: '', error: '', sending: false });
                      if (res.data) setCheckinData(res.data);
                      else checkinRefresh();
                    } else {
                      setLoginForm(f => ({ ...f, sending: false, error: res.error ?? 'Sessão inválida' }));
                    }
                  }}
                  className="text-xs font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded px-2 py-1 whitespace-nowrap"
                >
                  {loginForm.sending ? '…' : 'Ativar'}
                </button>
              </div>
              {loginForm.error && <p className="text-[10px] text-red-500 mt-1">{loginForm.error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── Bloco: Total do Dia ───────────────────────────────────────────────────
  const blocoTotalDia = (
    <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4 border border-green-400 dark:border-green-500">
      <div className="flex items-center gap-1.5 mb-2">
        <Target size={14} className="text-brand-600" />
        <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Total do dia</h2>
      </div>
      <p className="text-2xl font-black text-brand-600 dark:text-brand-400">
        R$ {fmtN(Math.round(todayRevenue))}
      </p>
      <p className="text-[10px] text-gray-400 mt-1">Paytour + A&amp;BS (quando disponível)</p>
    </div>
  );

  // ── Bloco: Receita A&BS ───────────────────────────────────────────────────
  const blocoReceitaABS = (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border border-gray-300 dark:border-gray-600">
      <div className="flex items-center gap-1.5 mb-2">
        <Target size={14} className="text-brand-500" />
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Receita Vendas</h2>
      </div>
      {absL ? (
        <div className="h-8 w-32 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
      ) : absData?.receita_abs != null ? (
        <>
          <p className="text-2xl font-black text-gray-900 dark:text-white">
            {absData.receita_abs.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          {absData.atualizado_em && (
            <p className="text-[10px] text-gray-400 mt-1">
              Atualizado às {new Date(absData.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-2xl font-black text-gray-300 dark:text-gray-600">R$ —</p>
          <p className="text-[10px] text-gray-400 mt-1">Aguardando envio do Power BI</p>
        </>
      )}
    </div>
  );

  // ── Bloco: Arretado / Em cima do muro / Putz ──────────────────────────────
  const blocoNPS = (() => {
    const promoters  = survey?.promoters  ?? null;
    const neutrals   = survey?.neutrals   ?? null;
    const detractors = survey?.detractors ?? null;
    const total      = survey?.surveys[0]?.responses ?? 0; // Fix 1: total do período, não all-time

    // Dias sem Putz: sempre global, independente do período
    const allNegs = (survey?.allTimeResponses ?? [])
      .filter(r => r.sentiment === 'negative')
      .map(r => new Date(r.date).getTime())
      .sort((a, b) => b - a); // mais recente primeiro

    const lastNegTs   = allNegs[0] ?? null;
    const daysSinceNeg = lastNegTs !== null
      ? Math.floor((Date.now() - lastNegTs) / (1000 * 60 * 60 * 24))
      : null;

    // Recorde: maior intervalo entre dois Putz consecutivos (ou desde o 1º Putz até hoje se só houve 1)
    let recordDays: number | null = null;
    if (allNegs.length === 1) {
      recordDays = Math.floor((Date.now() - allNegs[0]) / (1000 * 60 * 60 * 24));
    } else if (allNegs.length > 1) {
      const sorted = [...allNegs].sort((a, b) => a - b); // crescente
      let best = 0;
      for (let i = 1; i < sorted.length; i++) {
        const gap = Math.floor((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24));
        if (gap > best) best = gap;
      }
      // também considera desde o último Putz até hoje
      const sinceLastMs = Math.floor((Date.now() - sorted[sorted.length - 1]) / (1000 * 60 * 60 * 24));
      recordDays = Math.max(best, sinceLastMs);
    }

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border border-gray-300 dark:border-gray-600 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Satisfação &amp; Reputação do Dia</h2>
        {smL
          ? <div className="h-12 w-full bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
          : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-center">
                  <p className="text-lg font-black text-green-700 dark:text-green-400">
                    {promoters !== null ? `${promoters}%` : '—'}
                  </p>
                  <p className="text-[9px] text-green-600 dark:text-green-500 font-medium mt-0.5">Arretado</p>
                  {promoters !== null && total > 0 && (
                    <p className="text-[8px] text-green-500 mt-0.5">{Math.round(promoters / 100 * total)} pessoas</p>
                  )}
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-center">
                  <p className="text-lg font-black text-amber-700 dark:text-amber-400">
                    {neutrals !== null ? `${neutrals}%` : '—'}
                  </p>
                  <p className="text-[9px] text-amber-600 dark:text-amber-500 font-medium mt-0.5">Oxente</p>
                  {neutrals !== null && total > 0 && (
                    <p className="text-[8px] text-amber-500 mt-0.5">{Math.round(neutrals / 100 * total)} pessoas</p>
                  )}
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 text-center">
                  <p className="text-lg font-black text-red-600 dark:text-red-400">
                    {detractors !== null ? `${detractors}%` : '—'}
                  </p>
                  <p className="text-[9px] text-red-500 dark:text-red-400 font-medium mt-0.5">Putz</p>
                  {detractors !== null && total > 0 && (
                    <p className="text-[8px] text-red-400 mt-0.5">{Math.round(detractors / 100 * total)} pessoas</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 items-stretch">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-100 dark:border-green-800 relative flex flex-col items-center justify-center gap-0.5 pt-6">
                  <div className="absolute top-1.5 right-1.5">
                    <InfoTooltip text="Quantos dias seguidos passaram desde o último cliente que deu nota 1 ou 2 (Putz). Reinicia sempre que um novo Putz é registrado." />
                  </div>
                  <p className="text-2xl font-black text-green-600 dark:text-green-400">
                    {daysSinceNeg !== null ? daysSinceNeg : '🏆'}
                  </p>
                  <p className="text-[10px] text-green-600 dark:text-green-500 font-medium text-center">
                    {daysSinceNeg !== null ? (daysSinceNeg === 1 ? 'dia sem Putz' : 'dias sem Putz') : 'Sem Putz registrado'}
                  </p>
                  <p className="text-[9px] text-green-400 dark:text-green-600">sequência atual</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-100 dark:border-amber-800 relative flex flex-col items-center justify-center gap-0.5 pt-6">
                  <div className="absolute top-1.5 right-1.5">
                    <InfoTooltip text="O maior intervalo sem nenhum Putz já registrado em todo o histórico. Meta da equipe: superar esse número e bater o recorde." />
                  </div>
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {recordDays !== null ? recordDays : '—'}
                  </p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium text-center">
                    {recordDays !== null && recordDays !== 1 ? 'dias' : 'dia'} sem Putz
                  </p>
                  <p className="text-[9px] text-amber-400 dark:text-amber-600">🏆 recorde histórico</p>
                </div>
              </div>

              {/* Ranking inline de colaboradores mais citados */}
              {(() => {
                const allResponses = (survey?.allTimeResponses ?? []).filter(r => r.date?.startsWith('2026'));
                let staffList: { id: string; name: string; sector: string; aliases?: string[] }[] = [];
                try { staffList = JSON.parse(localStorage.getItem('hibiscus-staff') ?? '[]'); } catch { /* */ }
                if (!staffList.length || !allResponses.length) return null;

                const ranked = staffList
                  .map(m => {
                    const terms = [m.name.split(' ')[0], ...(m.aliases ?? [])].filter(t => t.length >= 3);
                    if (!terms.length) return { ...m, count: 0 };
                    const regex = new RegExp(terms.map(t => `\\b${t}\\b`).join('|'), 'i');
                    return { ...m, count: allResponses.filter(r => regex.test(r.text)).length };
                  })
                  .filter(m => m.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5);

                if (!ranked.length) return null;
                const medal = ['🥇', '🥈', '🥉'];
                const sc: Record<string, string> = {
                  'ATENDIMENTO': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
                  'A&B':         'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
                  'RECEPÇÃO':    'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
                };
                return (
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Users size={9} /> Mais citados na pesquisa interna / 2026
                    </p>
                    <div className="space-y-1">
                      {ranked.map((m, i) => (
                        <div key={m.id} className="flex items-center gap-1.5">
                          <span className="text-xs w-4 text-center shrink-0">{medal[i] ?? `${i + 1}`}</span>
                          <span className="flex-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate">{m.name}</span>
                          <span className={`text-[8px] px-1 py-0.5 rounded font-bold shrink-0 ${sc[m.sector] ?? 'bg-gray-100 text-gray-500'}`}>{m.sector}</span>
                          <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400 w-5 text-right shrink-0">{m.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )
        }
      </div>
    );
  })();

  const blocoStaffRanking = null; // integrado no blocoNPS

  // ── Bloco: Satisfação ─────────────────────────────────────────────────────
  const blocoSatisfacao = (() => {
    const surveyAvg    = survey?.avgScore ?? null;
    const surveyVol    = survey?.surveys[0]?.responses ?? 0;
    const googleAvg    = google?.averageRating ?? null;
    const googleVol    = google?.totalReviews ?? 0;

    // Combinado: média simples das duas notas na escala 0–5
    const combined = surveyAvg !== null && googleAvg !== null
      ? Math.round(((surveyAvg + googleAvg) / 2) * 10) / 10
      : surveyAvg ?? googleAvg;

    const loading = smL || gL;
    const color   = combined === null ? 'gray' : combined >= 4.5 ? 'green' : combined >= 4.0 ? 'orange' : 'red';
    const label   = combined === null ? '—' : combined >= 4.5 ? 'Excelente' : combined >= 4.0 ? 'Bom' : 'Atenção';

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border border-gray-300 dark:border-gray-600 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Avaliação NPS</h2>
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            {NPS_PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setNpsPeriod(p.key)}
                className={clsx(
                  'px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors',
                  npsPeriod === p.key
                    ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                )}
              >{p.label}</button>
            ))}
          </div>
        </div>

        {/* Combinado */}
        <div className={clsx(
          'rounded-xl p-3 flex items-center justify-between',
          color === 'green'  && 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800',
          color === 'orange' && 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800',
          color === 'red'    && 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
          color === 'gray'   && 'bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700',
        )}>
          <div>
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nota Geral</p>
              <InfoTooltip text="Média entre a nota média da pesquisa interna e a nota do Google, ambas na escala 0–5. Ex.: Survey 4.6 + Google 4.5 → (4.6+4.5)/2 = 4.5." />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Survey + Google · escala 0–5</p>
          </div>
          {loading
            ? <div className="h-8 w-16 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            : <div className="text-right">
                <p className={clsx('text-2xl font-bold',
                  color === 'green'  && 'text-green-600 dark:text-green-400',
                  color === 'orange' && 'text-yellow-600 dark:text-yellow-400',
                  color === 'red'    && 'text-red-600 dark:text-red-400',
                  color === 'gray'   && 'text-gray-400',
                )}>{combined != null ? `${combined} ★` : '—'}</p>
                <p className={clsx('text-[10px] font-medium',
                  color === 'green'  && 'text-green-500',
                  color === 'orange' && 'text-yellow-500',
                  color === 'red'    && 'text-red-500',
                  color === 'gray'   && 'text-gray-400',
                )}>{label}</p>
              </div>
          }
        </div>

        {/* Notas individuais */}
        <div className="grid grid-cols-2 gap-2">
          <MiniKPI icon={<Smile size={14} />} label="Survey" value={surveyAvg != null ? `${surveyAvg} ★` : '—'} sub={surveyVol > 0 ? `${surveyVol} respostas` : 'sem respostas'} color="green" loading={smL}
            info="Média das notas da pesquisa interna no período selecionado. Escala 1–5." />
          <MiniKPI icon={<Star size={14} />} label="Google" value={googleAvg != null ? `${googleAvg} ★` : '—'} sub={googleVol > 0 ? `${fmtN(googleVol)} avaliações · acumulado` : undefined} color="orange" loading={gL}
            info="Nota acumulada no Google Maps (escala 1–5). Não é filtrável por período — reflete todo o histórico do estabelecimento." />
          <MiniKPI icon={<Target size={14} />} label="NPS Survey" value={survey ? String(survey.npsScore) : '—'} sub="−100 a +100" color="purple" loading={smL}
            info="Net Promoter Score da pesquisa interna. Calculado como % Arretados (nota 4-5) menos % Putz (nota 1-2). Acima de 50 é Excelente." />
          <MiniKPI icon={<MessageSquare size={14} />} label="Sem Resposta" value={google ? String(google.unansweredCount) : '—'} sub="Google" color="brand" loading={gL}
            info="Avaliações do Google que ainda não receberam resposta da equipe." />
        </div>
      </div>
    );
  })();

  // ── Bloco: Ocupação ───────────────────────────────────────────────────────
  const blocoOcupacao = (() => {
    const primeVal     = occupancy.lounges[15] ?? occupancy.prime;
    const loungesFull  = occupancy.lounges.filter(v => v >= SPACE_CONFIGS.lounge.max).length;
    const loungesTotal = occupancy.lounges.reduce((a, b) => a + b, 0);
    const nacasa       = occupancy.beach + loungesTotal;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border border-gray-300 dark:border-gray-600 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-gray-500" />
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ocupação Atual</h3>
          </div>
          <a href="/ocupacao" className="text-[10px] text-brand-600 dark:text-white hover:underline">detalhes →</a>
        </div>

        {/* Portaria + Na Casa + Gap + Parceiros */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="border border-slate-400 dark:border-slate-500 rounded-lg p-1.5 text-center">
            <p className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">🚪 Portaria</p>
            <p className="text-lg font-black text-slate-800 dark:text-slate-100">{portariaCount ?? '—'}</p>
          </div>
          <div className="border border-brand-400 rounded-lg p-1.5 text-center">
            <p className="text-[8px] text-brand-500 dark:text-orange-300 uppercase tracking-wider">👥 Na Casa</p>
            <p className="text-lg font-black text-brand-700 dark:text-orange-400">{nacasa}</p>
          </div>
          <div className="border border-red-400 dark:border-red-600 rounded-lg p-1.5 text-center">
            <p className="text-[8px] text-red-400 dark:text-red-500 uppercase tracking-wider">− Gap</p>
            <p className="text-lg font-black text-red-600 dark:text-red-400">
              {portariaCount !== null ? Math.max(0, portariaCount - nacasa) : '—'}
            </p>
          </div>
          <div className="border border-blue-400 dark:border-blue-600 rounded-lg p-1.5 text-center">
            <p className="text-[8px] text-blue-500 dark:text-blue-400 uppercase tracking-wider">🤝 Parceiros</p>
            <p className="text-lg font-black text-blue-700 dark:text-blue-400">{occupancy.parceiros ?? 0}</p>
          </div>
        </div>

        {/* Beach / Lounges / Prime */}
        <div className="flex flex-col gap-1">
          <OccupancyRow label="🏖️ Beach"   current={occupancy.beach}   max={SPACE_CONFIGS.beach.max} />
          <OccupancyRow label="🛋️ Lounges" current={loungesTotal}       max={SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count} />
          <OccupancyRow label="💎 Prime"   current={primeVal}          max={SPACE_CONFIGS.prime.max} />
        </div>

        <LoungeMap lounges={occupancy.lounges} loungeObs={occupancy.loungeObs} loungeData={occupancy.loungeData} reservas={occupancy.reservasHoje} />
        {loungesFull > 0 && (
          <p className="text-xs text-red-600 font-semibold text-right">
            {loungesFull} lounge{loungesFull > 1 ? 's' : ''} em Ocupação Máxima
          </p>
        )}
      </div>
    );
  })();

  // ── Dados de satisfação (compartilhado entre mobile e desktop) ──────────────
  const surveyAvgShared  = survey?.avgScore ?? null;
  const googleAvgShared  = google?.averageRating ?? null;
  const combinedShared   = surveyAvgShared !== null && googleAvgShared !== null
    ? Math.round(((surveyAvgShared + googleAvgShared) / 2) * 10) / 10
    : surveyAvgShared ?? googleAvgShared;
  const satColor = combinedShared === null ? 'gray' : combinedShared >= 4.5 ? 'green' : combinedShared >= 4.0 ? 'orange' : 'red';
  const satLabel = combinedShared === null ? '—' : combinedShared >= 4.5 ? 'Excelente' : combinedShared >= 4.0 ? 'Bom' : 'Atenção';

  // ── Resumo de ocupação ────────────────────────────────────────────────────
  const occTotal      = occupancy.beach + occupancy.lounges.reduce((a, b) => a + b, 0) + occupancy.prime;
  const occMax        = SPACE_CONFIGS.beach.max + SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count + SPACE_CONFIGS.prime.max;
  const loungesFull   = occupancy.lounges.filter(v => v >= SPACE_CONFIGS.lounge.max).length;

  // ── Ticker de comunicados ─────────────────────────────────────────────────
  const FRASES_PRONTAS = [
    '🔴 Portaria fechada — capacidade máxima atingida',
    '🟡 Aproximando da capacidade máxima — portaria em atenção',
    '✅ Portaria aberta — vagas disponíveis',
    '➡️ Portaria fechada — indicar Hibiscus Mar & Cia',
    '🌊 Condições de mar adversas — passeio de lancha suspenso',
    '⚡ Sistema em manutenção — operar manualmente',
    '🍽️ A&B com alta demanda — reforçar equipe',
    '🅿️ Estacionamento lotado — orientar clientes para alternativas',
    '☀️ Dia de pico — equipe em alerta máximo',
    '🌧️ Previsão de chuva — ativar plano de contingência',
    '🎉 Evento especial hoje — seguir briefing do dia',
  ];

  const activeAvisos = avisos.filter(a => a.active && a.text.trim());

  useEffect(() => {
    if (activeAvisos.length <= 1) return;
    const id = setInterval(() => {
      setAvisoFade(false);
      setTimeout(() => {
        setAvisoTicker(t => (t + 1) % activeAvisos.length);
        setAvisoFade(true);
      }, 300);
    }, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAvisos.length]);

  const bannerAviso = (() => {
    const currentAviso = activeAvisos[avisoTicker % Math.max(activeAvisos.length, 1)];

    return (
      <div className="px-3 pt-2 lg:px-4 lg:pt-3">
        {/* Ticker de comunicados ativos */}
        {activeAvisos.length > 0 && !avisoDismissed && (
          <div className="relative flex items-center bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-2 mb-2">
            <Megaphone size={14} className="text-amber-500 shrink-0 mr-2" />
            <p
              className="flex-1 text-sm text-amber-800 dark:text-amber-300 font-medium leading-snug text-center transition-opacity duration-300"
              style={{ opacity: avisoFade ? 1 : 0 }}
            >
              {currentAviso?.text}
            </p>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {activeAvisos.length > 1 && (
                <span className="text-[10px] text-amber-400 font-medium">
                  {(avisoTicker % activeAvisos.length) + 1}/{activeAvisos.length}
                </span>
              )}
              <button onClick={() => setAvisoDismissed(true)} className="text-amber-400 hover:text-amber-600 transition-colors">
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Painel de gestão */}
        {avisoEditing ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 mb-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Comunicados ativos ({activeAvisos.length}/5)</p>
              <button onClick={() => setAvisoEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>

            {/* Lista dos comunicados */}
            {avisos.map((a, i) => a.text.trim() ? (
              <div key={i} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1.5">
                <p className="flex-1 text-xs text-amber-800 dark:text-amber-300 truncate">{a.text}</p>
                <button
                  onClick={async () => {
                    const next: AvisoList = avisos.filter((_, idx) => idx !== i);
                    await saveAvisos(next);
                  }}
                  className="shrink-0 text-amber-400 hover:text-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ) : null)}

            {/* Frases prontas */}
            {avisos.filter(a => a.active && a.text.trim()).length < 5 && (
              <div className="space-y-1.5">
                <div className="relative">
                  <button
                    onClick={() => setAvisoPresetsOpen(o => !o)}
                    className="w-full text-left text-xs px-3 py-1.5 rounded-lg border border-dashed border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-1"
                  >
                    <Megaphone size={11} /> Escolher frase pronta…
                  </button>
                  {avisoPresetsOpen && (
                    <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto">
                      {FRASES_PRONTAS.map((f, i) => (
                        <button
                          key={i}
                          onClick={() => { setAvisoCustom(f); setAvisoPresetsOpen(false); }}
                          className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    className="flex-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Ou escreva um comunicado pontual…"
                    maxLength={300}
                    value={avisoCustom}
                    onChange={e => setAvisoCustom(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && avisoCustom.trim()) {
                        const next: AvisoList = [...avisos.filter(a => a.text.trim()), { text: avisoCustom.trim(), active: true }];
                        await saveAvisos(next);
                        setAvisoCustom(''); setAvisoDismissed(false);
                      }
                    }}
                  />
                  <button
                    onClick={async () => {
                      if (!avisoCustom.trim()) return;
                      const next: AvisoList = [...avisos.filter(a => a.text.trim()), { text: avisoCustom.trim(), active: true }];
                      await saveAvisos(next);
                      setAvisoCustom(''); setAvisoDismissed(false);
                    }}
                    disabled={avisoSaving || !avisoCustom.trim()}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1 disabled:opacity-40 transition-colors"
                  >
                    <Check size={11} /> Adicionar
                  </button>
                </div>
              </div>
            )}

            {activeAvisos.length > 0 && (
              <button
                onClick={async () => { await saveAvisos([]); setAvisoEditing(false); setAvisoDismissed(false); }}
                className="text-[10px] text-red-400 hover:text-red-600 transition-colors"
              >
                Limpar todos os comunicados
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAvisoEditing(true)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-amber-500 transition-colors mb-2"
          >
            <Pencil size={10} /> {activeAvisos.length > 0 ? `Gerenciar comunicados (${activeAvisos.length})` : 'Adicionar comunicado'}
          </button>
        )}
      </div>
    );
  })();

  // ── Bloco: Chamadas ──────────────────────────────────────────────────────────
  const chamadasHoje = chamadas;
  const pendentes    = chamadasHoje.filter(c => c.status === 'pendente').length;
  const finalizadas  = chamadasHoje.filter(c => c.status === 'finalizado').length;
  const comEspera    = chamadasHoje.filter(c => c.tempoEspera);
  const avgEspera    = comEspera.length
    ? Math.round(comEspera.reduce((s, c) => s + parseTempoSec(c.tempoEspera), 0) / comEspera.length)
    : 0;
  const avgMin       = Math.floor(avgEspera / 60);
  const avgSec       = avgEspera % 60;
  const demoradas    = chamadasHoje.filter(c => parseTempoSec(c.tempoEspera) >= 60).length;

  const setoresCount = chamadasHoje.reduce<Record<string, number>>((acc, c) => {
    if (c.setor) acc[c.setor] = (acc[c.setor] ?? 0) + 1;
    return acc;
  }, {});
  const setoresTop = Object.entries(setoresCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxSetor   = setoresTop[0]?.[1] ?? 1;

  // Setores com chamadas pendentes agora
  const setoresPendentes = [...new Set(
    chamadasHoje.filter(c => c.status === 'pendente' && c.setor).map(c => c.setor)
  )];

  // Garçons com chamadas pendentes (qualquer tempo)
  const garconsPendentes = chamadasHoje
    .filter(c => c.status === 'pendente' && c.garcom)
    .map(c => c.tempoEspera ? `${c.garcom} (${c.tempoEspera})` : c.garcom);

  // Garçons com chamadas demoradas (≥60s) ainda pendentes
  const garconsDemorados = chamadasHoje
    .filter(c => c.status === 'pendente' && parseTempoSec(c.tempoEspera) >= 60 && c.garcom)
    .map(c => `${c.garcom} (${c.tempoEspera})`);

  const blocoChamadas = (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Chamadas — Hoje</h2>
        {chamadasL && <span className="text-[10px] text-gray-400 animate-pulse">Carregando...</span>}
      </div>

      {/* Stats na nova ordem: Pendentes · Demoradas · Finalizadas · Total */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Pendentes',   val: pendentes,           color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Demoradas',   val: demoradas,           color: demoradas > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200' },
          { label: 'Finalizadas', val: finalizadas,         color: 'text-green-600 dark:text-green-400' },
          { label: 'Total',       val: chamadasHoje.length, color: 'text-gray-800 dark:text-gray-200' },
        ].map(({ label, val, color }) => (
          <div key={label} className="text-center">
            <p className={`text-xl font-black ${color}`}>{val}</p>
            <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Ticker — garçons com chamadas pendentes */}
      {garconsPendentes.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-2 py-1 mb-1 overflow-hidden">
          <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 shrink-0 uppercase tracking-wide">⚠ Pendente</span>
          <div className="flex-1 overflow-hidden relative">
            <div
              className="flex gap-4 whitespace-nowrap"
              style={{ animation: `ticker ${Math.max(8, garconsPendentes.length * 4)}s linear infinite` }}
            >
              {[...garconsPendentes, ...garconsPendentes].map((g, i) => (
                <span key={i} className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">{g}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ticker — garçons com atendimento demorado */}
      {garconsDemorados.length > 0 && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-2 py-1 mb-2 overflow-hidden">
          <span className="text-[9px] font-bold text-red-600 dark:text-red-400 shrink-0 uppercase tracking-wide">⏱ Demora</span>
          <div className="flex-1 overflow-hidden relative">
            <div
              className="flex gap-4 whitespace-nowrap"
              style={{ animation: `ticker ${Math.max(8, garconsDemorados.length * 4)}s linear infinite` }}
            >
              {[...garconsDemorados, ...garconsDemorados].map((g, i) => (
                <span key={i} className="text-[10px] font-semibold text-red-700 dark:text-red-300">{g}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {setoresPendentes.length > 0 && (
        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-1.5 mb-2">
          <span className="text-amber-500 text-xs shrink-0">⚠️</span>
          <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium leading-snug">
            <span className="font-semibold">Aguardando:</span>{' '}
            {setoresPendentes.length <= 3
              ? setoresPendentes.join(' · ')
              : `${setoresPendentes.slice(0, 3).join(' · ')} +${setoresPendentes.length - 3}`
            }
          </p>
        </div>
      )}

      {avgEspera > 0 && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 text-center">
          Tempo médio de espera: <span className="font-semibold text-gray-700 dark:text-gray-300">{avgMin}m {avgSec}s</span>
        </p>
      )}

      {/* Legenda compacta */}
      <div className="flex gap-3 mb-2">
        <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>Até 30s Rápido</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>31–59s Médio</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>≥60s Demorado</span>
      </div>

      {setoresTop.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-700">
          {setoresTop.map(([setor, count]) => {
            const pct = Math.round((count / chamadasHoje.length) * 100);
            return (
            <div key={setor} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 w-16 truncate shrink-0">{setor}</span>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(count / maxSetor) * 100}%`, backgroundColor: '#3b82f6' }} />
              </div>
              <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 w-6 text-right">{count}</span>
              <span className="text-[9px] text-gray-400 w-7 text-right">{pct}%</span>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* ── MOBILE: mesma estrutura do desktop em scroll vertical ────────── */}
      <div className="lg:hidden overflow-y-auto flex flex-col pb-20">
        {bannerAviso}
        <div className="p-3 flex flex-col gap-3">

        {/* RECEITA */}
        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-1">Receita</p>

        {blocoAoVivo}

        {blocoJaVendido}

        {blocoReceitaABS}

        {blocoTotalDia}

        {/* OCUPAÇÃO */}
        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-1 mt-1">Ocupação</p>

        {blocoOcupacao}

        {blocoCheckin}

        {/* CHAMADAS */}
        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-1 mt-1">Atendimento</p>

        {blocoChamadas}

        {/* REPUTAÇÃO */}
        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-1 mt-1">Reputação</p>

        {blocoSatisfacao}

        {blocoNPS}

        <ReviewsTicker googleData={google} surveyData={survey} />

        {blocoStaffRanking}

        </div>{/* fecha div p-3 flex flex-col */}
      </div>

      {/* ── DESKTOP: grid ───────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col h-full overflow-hidden">
        {bannerAviso}
        <div className="flex flex-1 overflow-hidden px-4 pb-4">
        <div className="grid grid-cols-3 gap-3 w-full min-h-0">

          {/* Coluna 1 — Receita + Chamadas */}
          <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
            {blocoAoVivo}
            {blocoJaVendido}
            {blocoReceitaABS}
            {blocoTotalDia}
            {blocoChamadas}
          </div>

          {/* Coluna 2 — Ocupação + Check-in */}
          <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
            {blocoOcupacao}
            {blocoCheckin}
          </div>

          {/* Coluna 3 — Reputação */}
          <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
            {blocoSatisfacao}
            {blocoNPS}
            <ReviewsTicker googleData={google} surveyData={survey} />
            {blocoStaffRanking}
          </div>

        </div>
        </div>{/* fecha flex flex-1 overflow-hidden */}
      </div>
    </>
  );
}
