import { useMemo } from 'react';
import { Users, Star, Target, MessageSquare, Smile } from 'lucide-react';
import { usePaytour } from '../hooks/usePaytour';
import { useSurveyMonkey } from '../hooks/useSurveyMonkey';
import { useGoogleBusiness } from '../hooks/useGoogleBusiness';
import { Period, Goals, OccupancyState, SPACE_CONFIGS } from '../types';
import clsx from 'clsx';

interface OverviewProps {
  period: Period;
  goals:  Goals;
  occupancy: OccupancyState;
}

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

function fmtN(v: number) {
  return v.toLocaleString('pt-BR');
}

// ── Selo "sincronizando" — evita confundir warm-up com dado real zerado ──────
function SyncTag({ light }: { light?: boolean }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-[9px] font-medium',
      light ? 'text-yellow-600 dark:text-yellow-400' : 'text-yellow-300/90',
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full animate-pulse', light ? 'bg-yellow-500' : 'bg-yellow-300')} />
      sincronizando
    </span>
  );
}

function monthName(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ── Barra de progresso de meta ────────────────────────────────────────────────
function MetaBar({
  label, value, goal, format = 'number', loading,
}: {
  label: string;
  value: number;
  goal: number;
  format?: 'currency' | 'number';
  loading?: boolean;
}) {
  const pct      = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const barColor = pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-brand-600' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-500';
  const pctColor = pct >= 100 ? 'text-green-600' : pct >= 70 ? 'text-brand-600' : pct >= 40 ? 'text-yellow-500' : 'text-red-500';
  const valStr   = format === 'currency' ? fmt(value) : fmtN(value);
  const goalStr  = format === 'currency' ? fmt(goal)  : fmtN(goal);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="flex justify-between mb-1">
          <div className="h-3 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-200 rounded w-16" />
        </div>
        <div className="h-3 bg-gray-200 rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className={clsx('text-sm font-bold', pctColor)}>{pct}%</span>
      </div>
      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{valStr}</span>
        <span>meta {goalStr}</span>
      </div>
    </div>
  );
}

function OccupancyMini({ label, current, max }: { label: string; current: number; max: number }) {
  const pct    = current / max;
  const bar    = pct >= 0.9 ? 'bg-red-500' : pct >= 0.6 ? 'bg-yellow-400' : 'bg-green-500';
  const text   = pct >= 0.9 ? 'text-red-600' : pct >= 0.6 ? 'text-yellow-600' : 'text-green-600';
  const border = pct >= 0.9 ? 'border-red-300' : pct >= 0.6 ? 'border-yellow-300' : 'border-green-300';
  return (
    <div className={clsx('bg-white dark:bg-gray-800 rounded-xl border p-3 flex flex-col gap-1.5', border)}>
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="font-medium">{label}</span>
        <span className={clsx('font-bold', text)}>{Math.round(pct * 100)}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-300', bar)} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <p className="text-sm font-bold text-gray-800 dark:text-white">{current} <span className="text-xs font-normal text-gray-400">/ {max}</span></p>
    </div>
  );
}

export function Overview({ period, goals, occupancy }: OverviewProps) {
  const { data: paytour, loading: ptL, progress: ptProgress } = usePaytour(period);
  const { data: nextMonthData, loading: nmL, progress: nmProgress } = usePaytour('next_month');
  const { data: survey,  loading: smL } = useSurveyMonkey(period);
  const { data: google,  loading: gL  } = useGoogleBusiness(period);

  // Dados de HOJE — sempre busca período "today" independente do filtro selecionado
  const { data: today, loading: todayL, progress: todayProgress } = usePaytour('today');

  const tickerPct = ptProgress
    ? Math.round((ptProgress.current / ptProgress.total) * 100)
    : null;

  // Paytour ainda sincronizando (warm-up) — números podem aparecer zerados sem refletir a realidade
  const todaySyncing = !!todayProgress;
  const monthSyncing = !!ptProgress;
  const nextMonthSyncing = !!nmProgress;

  return (
    <div className="p-4 h-full overflow-hidden flex flex-col gap-3">

      {/* ── SEÇÃO HOJE (compacta) ──────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-brand-700 to-brand-900 rounded-xl p-3 text-white shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <h2 className="text-xs font-semibold uppercase tracking-wider opacity-90">Ao vivo — Hoje</h2>
          </div>
          <span className="text-[10px] opacity-60">Atualiza a cada 2 min</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] opacity-70">Receita</p>
              {todaySyncing && <SyncTag />}
            </div>
            {todayL
              ? <div className="h-5 bg-white/20 rounded animate-pulse mt-0.5" />
              : <p className="text-lg font-bold leading-tight">{fmt(today?.todayRevenue ?? 0)}</p>
            }
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] opacity-70">Atividades</p>
              {todaySyncing && <SyncTag />}
            </div>
            {todayL
              ? <div className="h-5 bg-white/20 rounded animate-pulse mt-0.5" />
              : <p className="text-lg font-bold leading-tight">{fmtN(today?.todayItems ?? 0)}</p>
            }
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] opacity-70">Reservas</p>
              {todaySyncing && <SyncTag />}
            </div>
            {todayL
              ? <div className="h-5 bg-white/20 rounded animate-pulse mt-0.5" />
              : <p className="text-lg font-bold leading-tight">{fmtN(today?.todayOrders ?? 0)}</p>
            }
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <p className="text-[10px] opacity-70">Ticket médio</p>
            {todayL
              ? <div className="h-5 bg-white/20 rounded animate-pulse mt-0.5" />
              : <p className="text-lg font-bold leading-tight">
                  {today?.todayOrders
                    ? fmt((today.todayRevenue ?? 0) / today.todayOrders)
                    : '—'}
                </p>
            }
          </div>
        </div>

        {tickerPct !== null && (
          <div className="mt-2 bg-white/10 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between text-[10px] opacity-80 mb-1">
              <span>⏳ Sincronizando dados da Paytour — isso pode levar alguns minutos na primeira carga</span>
              <span className="font-semibold">{tickerPct}% ({ptProgress?.current ?? 0}/{ptProgress?.total ?? 0} pedidos)</span>
            </div>
            <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full transition-all duration-500" style={{ width: `${tickerPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── GRID PRINCIPAL: Metas | Próximo mês + Satisfação | Ocupação ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">

        {/* Meta do mês */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Target size={14} className="text-brand-600" />
              <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Meta do Mês</h2>
            </div>
            {monthSyncing && <SyncTag light />}
          </div>
          <div className="space-y-3">
            <MetaBar
              label="💰 Receita"
              value={paytour?.totalRevenue ?? 0}
              goal={goals.receitaTotal}
              format="currency"
              loading={ptL && !paytour}
            />
            <MetaBar
              label="🎫 Atividades"
              value={paytour?.totalItems ?? 0}
              goal={goals.atividadesMes}
              format="number"
              loading={ptL && !paytour}
            />
            <MetaBar
              label="📋 Reservas"
              value={paytour?.totalSales ?? 0}
              goal={goals.numeroVendas}
              format="number"
              loading={ptL && !paytour}
            />
          </div>
        </div>

        {/* Próximo mês + Satisfação/Google */}
        <div className="flex flex-col gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Target size={14} className="text-brand-600" />
                <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">
                  Já vendido — {monthName(1)}
                </h2>
              </div>
              {nextMonthSyncing && <SyncTag light />}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Receita</p>
                {nmL && !nextMonthData
                  ? <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  : <p className="text-base font-bold text-gray-900 dark:text-white">{fmt(nextMonthData?.totalRevenue ?? 0)}</p>
                }
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Atividades</p>
                {nmL && !nextMonthData
                  ? <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  : <p className="text-base font-bold text-gray-900 dark:text-white">{fmtN(nextMonthData?.totalItems ?? 0)}</p>
                }
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Reservas</p>
                {nmL && !nextMonthData
                  ? <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  : <p className="text-base font-bold text-gray-900 dark:text-white">{fmtN(nextMonthData?.totalSales ?? 0)}</p>
                }
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex-1">
            <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider mb-3">Satisfação &amp; Reputação</h2>
            <div className="grid grid-cols-2 gap-2">
              <MiniKPI icon={<Target size={14} />} label="NPS Score" value={survey ? String(survey.npsScore) : '—'} color="green" loading={smL} />
              <MiniKPI icon={<Star size={14} />} label="Nota Google" value={google ? `${google.averageRating} ★` : '—'} sub={google ? `${fmtN(google.totalReviews)} avaliações` : undefined} color="orange" loading={gL} />
              <MiniKPI icon={<Smile size={14} />} label="Satisfação" value={survey ? `${survey.promoters}%` : '—'} sub="Promotores NPS" color="purple" loading={smL} />
              <MiniKPI icon={<MessageSquare size={14} />} label="Sem Resposta" value={google ? String(google.unansweredCount) : '—'} sub="Avaliações" color="brand" loading={gL} />
            </div>
          </div>
        </div>

        {/* Ocupação */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Users size={14} className="text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ocupação Atual</h3>
            </div>
            <a href="/ocupacao" className="text-[10px] text-brand-600 hover:underline">detalhes →</a>
          </div>
          <div className="grid grid-cols-1 gap-2 flex-1">
            <OccupancyMini label="🏖️ Beach"  current={occupancy.beach} max={SPACE_CONFIGS.beach.max} />
            <OccupancyMini label="🛋️ Lounge" current={occupancy.lounges.reduce((a,b)=>a+b,0)} max={SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count} />
            <OccupancyMini label="💎 Prime"  current={occupancy.prime} max={SPACE_CONFIGS.prime.max} />
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Mini KPI compacto (grade 2x2) ────────────────────────────────────────────
function MiniKPI({
  icon, label, value, sub, color = 'brand', loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  loading?: boolean;
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
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{label}</p>
        {loading
          ? <div className="h-4 w-12 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
          : <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{value}</p>
        }
        {sub && !loading && <p className="text-[9px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}
