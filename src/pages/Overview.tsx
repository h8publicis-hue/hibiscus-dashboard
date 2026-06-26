import { Users, Star, Target, MessageSquare, Smile, Info } from 'lucide-react';
import { ReviewsTicker } from '../components/ReviewsTicker';
import { useState, useRef, useEffect } from 'react';
import { useSurveyMonkey } from '../hooks/useSurveyMonkey';
import { useGoogleBusiness } from '../hooks/useGoogleBusiness';
import { usePaytour } from '../hooks/usePaytour';
import { useSheetOccupancy } from '../hooks/useSheetOccupancy';
import { useMonthRevenue } from '../hooks/useMonthRevenue';
import { useReceitaABS } from '../hooks/useReceitaABS';
import { useCheckin } from '../hooks/useCheckin';
import { fetchNextMonthVisitData, NextMonthVisit } from '../services/paytour';
import { Period, Goals, OccupancyState, SPACE_CONFIGS, SHEET_CAPS } from '../types';
import clsx from 'clsx';

interface OverviewProps {
  period: Period;
  goals:  Goals;
  occupancy: OccupancyState;
}

// ── Tooltip de informação ─────────────────────────────────────────────────────
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-gray-300 hover:text-brand-500 dark:text-gray-500 dark:hover:text-brand-400 transition-colors"
        aria-label="Saiba mais"
      >
        <Info size={11} />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-900 dark:bg-gray-700 text-white text-[11px] leading-relaxed rounded-lg px-3 py-2 shadow-xl">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
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
  { label: 'Gramado',    ids: [15, 16, 17] },
  { label: 'Prime ★',    ids: [18] },
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
function LoungeMap({ lounges }: { lounges: number[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">🛋️ Lounges</p>

      {/* Frente Mar + Atrás: duas linhas paralelas de 7 */}
      <div className="flex flex-col gap-1">
        {[LOUNGE_GROUPS[0], LOUNGE_GROUPS[1]].map((group) => (
          <div key={group.label} className="flex gap-1 items-center">
            <LoungeLabel label={group.label} className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 w-16 shrink-0 leading-tight" />
            <div className="flex flex-1 gap-1">
              {group.ids.map((idx) => {
                const v = lounges[idx];
                const pct = v / SPACE_CONFIGS.lounge.max;
                const num = SPACE_CONFIGS.lounge.start + idx;
                return (
                  <div key={idx} className={clsx('flex-1 rounded flex flex-col items-center justify-center py-2 text-center', loungeBg(v, pct))}>
                    <span className="text-[9px] leading-none opacity-60 font-medium">{num}</span>
                    <span className="text-2xl font-black leading-tight">{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Separador visual */}
      <div className="border-t border-gray-100 dark:border-gray-700" />

      {/* Anexo + Gramado + Prime */}
      <div className="flex gap-3 items-start">
        {[LOUNGE_GROUPS[2], LOUNGE_GROUPS[3], LOUNGE_GROUPS[4]].map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <LoungeLabel label={group.label} className="text-[10px] font-semibold text-gray-500 dark:text-gray-400" />
            <div className="flex gap-1">
              {group.ids.map((idx) => {
                const v = lounges[idx];
                const pct = v / SPACE_CONFIGS.lounge.max;
                const num = SPACE_CONFIGS.lounge.start + idx;
                return (
                  <div key={idx} className={clsx('w-11 rounded flex flex-col items-center justify-center py-2 text-center', loungeBg(v, pct))}>
                    <span className="text-[9px] leading-none opacity-60 font-medium">{num}</span>
                    <span className="text-2xl font-black leading-tight">{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex gap-2">
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-gray-200 dark:bg-gray-600 inline-block"/>Livre</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-green-200 dark:bg-green-800 inline-block"/>Ocupado</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500"><span className="w-2 h-2 rounded-sm bg-red-200 dark:bg-red-800 inline-block"/>Cheio</span>
      </div>
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
export function Overview({ period, goals: _goals, occupancy }: OverviewProps) {
  const { data: survey,  loading: smL } = useSurveyMonkey(period);
  const { data: google,  loading: gL  } = useGoogleBusiness(period);
  const { data: paytour, loading: ptL } = usePaytour(period);
  const { data: sheetOcc } = useSheetOccupancy();
  const { revenue: monthRevRaw, loading: monthRevL, ts: monthRevTs } = useMonthRevenue();
  const { data: absData, loading: absL } = useReceitaABS();
  const { data: checkinData, loading: checkinL } = useCheckin();

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
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
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
                  <>
                    <p className="text-[10px] text-gray-400 text-right">
                      Atualizado às {new Date(monthRevTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <SyncCountdown ts={monthRevTs} />
                  </>
                )}
              </div>
            )
            : <p className="text-xs text-gray-400">Sem dados</p>
      }
    </div>
  );

  // ── Bloco: Resumo do Período ──────────────────────────────────────────────
  const blocoResumo = (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
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
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-1.5 mb-3">
        <Users size={14} className="text-brand-500" />
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Check-in Online</h2>
      </div>
      {checkinL ? (
        <div className="h-16 w-full bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
      ) : (
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
      )}
      {checkinData && (
        <>
          <div className="mt-3 h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: checkinData.reservados > 0 ? `${Math.round((checkinData.checkins / checkinData.reservados) * 100)}%` : '0%' }}
            />
          </div>
          <p className="text-[9px] text-gray-400 mt-1 text-center">
            {checkinData.reservados > 0 ? Math.round((checkinData.checkins / checkinData.reservados) * 100) : 0}% check-ins concluídos
          </p>
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
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
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
    const total      = survey?.totalResponses ?? 0;

    // Dias sem Putz: calcula desde o último detrator (sentiment=negative)
    const lastNeg = survey?.recentResponses
      .filter(r => r.sentiment === 'negative')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const daysSinceNeg = lastNeg
      ? Math.floor((Date.now() - new Date(lastNeg.date).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Avaliações NPS</h2>
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
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center border border-green-100 dark:border-green-800">
                {daysSinceNeg !== null ? (
                  <>
                    <p className="text-2xl font-black text-green-600 dark:text-green-400">{daysSinceNeg}</p>
                    <p className="text-[10px] text-green-600 dark:text-green-500 font-medium">
                      {daysSinceNeg === 1 ? 'dia sem Putz' : 'dias sem Putz'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-black text-green-600 dark:text-green-400">🏆</p>
                    <p className="text-[10px] text-green-600 dark:text-green-500 font-medium">Sem registros de Putz</p>
                  </>
                )}
              </div>
            </>
          )
        }
      </div>
    );
  })();

  // ── Bloco: Satisfação ─────────────────────────────────────────────────────
  const blocoSatisfacao = (() => {
    const surveyNPS    = survey?.npsScore ?? null;
    const surveyVol    = survey?.totalResponses ?? 0;
    const googleRating = google?.averageRating ?? null;
    const googleVol    = google?.totalReviews ?? 0;
    const googleNPS    = (() => {
      const dist = google?.ratingDistribution;
      if (!dist) return null;
      const tot = dist.reduce((s, e) => s + e.count, 0);
      if (!tot) return null;
      const p = dist.filter(e => e.stars >= 4).reduce((s, e) => s + e.count, 0);
      const d = dist.filter(e => e.stars <= 2).reduce((s, e) => s + e.count, 0);
      return Math.round((p / tot - d / tot) * 100);
    })();
    const totalVol     = (surveyNPS !== null ? surveyVol : 0) + (googleNPS !== null ? googleVol : 0);
    const combined     = totalVol > 0
      ? Math.round(
          ((surveyNPS ?? 0) * (surveyNPS !== null ? surveyVol : 0) +
           (googleNPS ?? 0) * (googleNPS !== null ? googleVol : 0)) / totalVol
        )
      : null;
    const loading = smL || gL;
    const color   = combined === null ? 'gray' : combined >= 50 ? 'green' : combined >= 0 ? 'orange' : 'red';
    const label   = combined === null ? '—' : combined >= 50 ? 'Excelente' : combined >= 0 ? 'Bom' : 'Atenção';

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Satisfação &amp; Reputação</h2>

        <div className={clsx(
          'rounded-xl p-3 flex items-center justify-between',
          color === 'green'  && 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800',
          color === 'orange' && 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800',
          color === 'red'    && 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
          color === 'gray'   && 'bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700',
        )}>
          <div>
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Satisfação Geral</p>
              <InfoTooltip text="Média ponderada entre o NPS da pesquisa interna e a nota do Google (convertida para a mesma escala de -100 a +100). Quanto maior o número, melhor a percepção geral dos clientes." />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Survey + Google · {fmtN(totalVol)} votos</p>
          </div>
          {loading
            ? <div className="h-8 w-16 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            : <div className="text-right">
                <p className={clsx('text-2xl font-bold',
                  color === 'green'  && 'text-green-600 dark:text-green-400',
                  color === 'orange' && 'text-yellow-600 dark:text-yellow-400',
                  color === 'red'    && 'text-red-600 dark:text-red-400',
                  color === 'gray'   && 'text-gray-400',
                )}>{combined ?? '—'}</p>
                <p className={clsx('text-[10px] font-medium',
                  color === 'green'  && 'text-green-500',
                  color === 'orange' && 'text-yellow-500',
                  color === 'red'    && 'text-red-500',
                  color === 'gray'   && 'text-gray-400',
                )}>{label}</p>
              </div>
          }
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniKPI icon={<Target size={14} />} label="NPS Score" value={survey ? String(survey.npsScore) : '—'} sub="SurveyMonkey" color="green" loading={smL}
            info="Net Promoter Score da pesquisa interna. Vai de -100 a +100. Acima de 50 é considerado Excelente. Calculado como % Promotores (nota 4-5) menos % Detratores (nota 1-2)." />
          <MiniKPI icon={<Star size={14} />} label="Nota Google" value={google ? `${google.averageRating} ★` : '—'} sub={google ? `${fmtN(google.totalReviews)} avaliações` : undefined} color="orange" loading={gL}
            info="Média das avaliações públicas no Google Maps. Escala de 1 a 5 estrelas. Nota acima de 4.5 coloca o negócio no top 10% da categoria." />
          <MiniKPI icon={<Smile size={14} />} label="Arretados" value={survey ? `${survey.promoters}%` : '—'} sub="NPS Survey" color="purple" loading={smL}
            info="Percentual de clientes que deram nota 4 ou 5 na pesquisa. São os mais propensos a indicar o Hibiscus para amigos e família." />
          <MiniKPI icon={<MessageSquare size={14} />} label="Sem Resposta" value={google ? String(google.unansweredCount) : '—'} sub="Google" color="brand" loading={gL}
            info="Quantidade de avaliações do Google que ainda não receberam resposta da equipe. Responder avaliações (positivas e negativas) melhora o posicionamento no Google e demonstra cuidado com o cliente." />
        </div>
      </div>
    );
  })();

  // ── Bloco: Ocupação ───────────────────────────────────────────────────────
  const blocoOcupacao = (() => {
    const so = sheetOcc;
    const updatedAt = so?.timestamp
      ? new Date(so.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const loungesFull = occupancy.lounges.filter(v => v >= SPACE_CONFIGS.lounge.max).length;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-gray-500" />
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ocupação Atual</h3>
          </div>
          <a href="/ocupacao" className="text-[10px] text-brand-600 dark:text-white hover:underline">detalhes →</a>
        </div>

        {so ? (
          <>
            {/* Portaria + Na Casa + GAP */}
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-slate-400 dark:border-slate-500 rounded-lg p-2 text-center">
                <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">🚪 Portaria</p>
                <p className="text-xl font-black text-slate-800 dark:text-slate-100">{so.portaria}</p>
              </div>
              <div className="border border-brand-400 rounded-lg p-2 text-center">
                <p className="text-[9px] text-brand-500 dark:text-orange-300 uppercase tracking-wider">👥 Na Casa</p>
                <p className="text-xl font-black text-brand-700 dark:text-orange-400">{so.total}</p>
              </div>
              <div className={clsx('rounded-lg p-2 text-center border', so.gap >= 0 ? 'border-emerald-400' : 'border-red-400')}>
                <p className={clsx('text-[9px] uppercase tracking-wider', so.gap >= 0 ? 'text-emerald-500' : 'text-red-500')}>⚡ GAP</p>
                <p className={clsx('text-xl font-black', so.gap >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{so.gap}</p>
              </div>
            </div>

            {/* Beach / Lounge / Condomínio */}
            <div className="flex flex-col gap-1.5">
              <OccupancyRow label="🏖️ Beach"      current={so.beach}      max={SHEET_CAPS.beach} />
              <OccupancyRow label="🛋️ Lounge"     current={so.lounge}     max={SHEET_CAPS.lounge} />
              <OccupancyRow label="🏢 Condomínio"  current={so.condominio} max={SHEET_CAPS.condominio} />
            </div>

            {updatedAt && (
              <p className="text-[9px] text-gray-400 text-right">
                {!so.isToday && <span className="text-orange-400">({so.date}) </span>}
                Atualizado às {updatedAt}
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <OccupancyRow label="🏖️ Beach" current={occupancy.beach} max={SPACE_CONFIGS.beach.max} />
            <OccupancyRow label="🛋️ Lounges" current={occupancy.lounges.reduce((a,b)=>a+b,0)} max={SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count} />
            <OccupancyRow label="💎 Prime" current={occupancy.prime} max={SPACE_CONFIGS.prime.max} />
          </div>
        )}

        <LoungeMap lounges={occupancy.lounges} />
        {loungesFull > 0 && (
          <p className="text-xs text-red-600 font-semibold text-right">
            {loungesFull} lounge{loungesFull > 1 ? 's' : ''} cheio{loungesFull > 1 ? 's' : ''}
          </p>
        )}
      </div>
    );
  })();

  // ── Dados de satisfação (compartilhado entre mobile e desktop) ──────────────
  const surveyNPS    = survey?.npsScore ?? null;
  const surveyVol    = survey?.totalResponses ?? 0;
  const googleRating = google?.averageRating ?? null;
  const googleVol    = google?.totalReviews ?? 0;
  const googleNPS    = googleRating !== null ? Math.round((googleRating - 3) / 2 * 100) : null;
  const totalVol     = (surveyNPS !== null ? surveyVol : 0) + (googleNPS !== null ? googleVol : 0);
  const combined     = totalVol > 0
    ? Math.round(
        ((surveyNPS ?? 0) * (surveyNPS !== null ? surveyVol : 0) +
         (googleNPS ?? 0) * (googleNPS !== null ? googleVol : 0)) / totalVol
      )
    : null;
  const satColor = combined === null ? 'gray' : combined >= 50 ? 'green' : combined >= 0 ? 'orange' : 'red';
  const satLabel = combined === null ? '—' : combined >= 50 ? 'Excelente' : combined >= 0 ? 'Bom' : 'Atenção';

  // ── Resumo de ocupação ────────────────────────────────────────────────────
  const occTotal      = occupancy.beach + occupancy.lounges.reduce((a, b) => a + b, 0) + occupancy.prime;
  const occMax        = SPACE_CONFIGS.beach.max + SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count + SPACE_CONFIGS.prime.max;
  const loungesFull   = occupancy.lounges.filter(v => v >= SPACE_CONFIGS.lounge.max).length;

  return (
    <>
      {/* ── MOBILE: mesma estrutura do desktop em scroll vertical ────────── */}
      <div className="lg:hidden overflow-y-auto p-3 flex flex-col gap-3 pb-20">

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

        {/* REPUTAÇÃO */}
        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-1 mt-1">Reputação</p>

        {blocoSatisfacao}

        {blocoNPS}

        <ReviewsTicker googleData={google} surveyData={survey} />

      </div>

      {/* ── DESKTOP: grid ───────────────────────────────────────────────── */}
      <div className="hidden lg:flex p-4 h-full overflow-hidden">
        <div className="grid grid-cols-3 gap-3 w-full min-h-0">

          {/* Coluna 1 — Receita: Ao Vivo + Faturamento + A&BS + Total */}
          <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
            {blocoAoVivo}
            {blocoJaVendido}
            {blocoReceitaABS}
            {blocoTotalDia}
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
          </div>

        </div>
      </div>
    </>
  );
}
