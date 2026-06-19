import { Users, Star, Target, MessageSquare, Smile } from 'lucide-react';
import { useSurveyMonkey } from '../hooks/useSurveyMonkey';
import { useGoogleBusiness } from '../hooks/useGoogleBusiness';
import { usePaytour } from '../hooks/usePaytour';
import { Period, Goals, OccupancyState, SPACE_CONFIGS } from '../types';
import clsx from 'clsx';

interface OverviewProps {
  period: Period;
  goals:  Goals;
  occupancy: OccupancyState;
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

export function Overview({ period, goals: _goals, occupancy }: OverviewProps) {
  const { data: survey,  loading: smL } = useSurveyMonkey(period);
  const { data: google,  loading: gL  } = useGoogleBusiness(period);
  const { data: paytour, loading: ptL } = usePaytour(period);

  return (
    <div className="p-4 h-full overflow-hidden flex flex-col gap-3">

      {/* ── SEÇÃO HOJE (compacta) ──────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-brand-700 to-brand-900 rounded-xl p-3 text-white shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <h2 className="text-xs font-semibold uppercase tracking-wider opacity-90">Ao vivo — Hoje</h2>
          </div>
          {ptL && <span className="text-[10px] opacity-60 animate-pulse">Carregando...</span>}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <p className="text-[10px] opacity-70">Receita</p>
            {ptL
              ? <div className="h-6 w-16 bg-white/20 rounded animate-pulse mt-1" />
              : <p className="text-lg font-bold leading-tight">
                  {paytour ? `R$ ${fmtN(Math.round(paytour.todayRevenue))}` : '—'}
                </p>
            }
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <p className="text-[10px] opacity-70">Atividades</p>
            {ptL
              ? <div className="h-6 w-10 bg-white/20 rounded animate-pulse mt-1" />
              : <p className="text-lg font-bold leading-tight">{paytour ? fmtN(paytour.todayItems) : '—'}</p>
            }
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <p className="text-[10px] opacity-70">Reservas</p>
            {ptL
              ? <div className="h-6 w-10 bg-white/20 rounded animate-pulse mt-1" />
              : <p className="text-lg font-bold leading-tight">{paytour ? fmtN(paytour.todayOrders) : '—'}</p>
            }
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <p className="text-[10px] opacity-70">Ticket médio</p>
            {ptL
              ? <div className="h-6 w-16 bg-white/20 rounded animate-pulse mt-1" />
              : <p className="text-lg font-bold leading-tight">
                  {paytour && paytour.todayOrders > 0
                    ? `R$ ${fmtN(Math.round(paytour.todayRevenue / paytour.todayOrders))}`
                    : '—'}
                </p>
            }
          </div>
        </div>
      </div>

      {/* ── GRID PRINCIPAL: Metas | Próximo mês + Satisfação | Ocupação ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">

        {/* Meta do mês */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
          <div className="flex items-center gap-1.5 mb-3">
            <Target size={14} className="text-brand-600" />
            <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Resumo do Período</h2>
          </div>
          {ptL
            ? <div className="flex-1 flex items-center justify-center"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" /></div>
            : paytour
              ? (
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Receita</p>
                    <p className="text-base font-bold text-gray-900 dark:text-white">R$ {fmtN(Math.round(paytour.totalRevenue))}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Pedidos</p>
                    <p className="text-base font-bold text-gray-900 dark:text-white">{fmtN(paytour.totalSales)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Atividades</p>
                    <p className="text-base font-bold text-gray-900 dark:text-white">{fmtN(paytour.totalItems)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ticket Médio</p>
                    <p className="text-base font-bold text-gray-900 dark:text-white">R$ {fmtN(Math.round(paytour.averageTicket))}</p>
                  </div>
                </div>
              )
              : <div className="flex-1 flex items-center justify-center"><p className="text-xs text-gray-400">Sem dados</p></div>
          }
        </div>

        {/* Próximo mês + Satisfação/Google */}
        <div className="flex flex-col gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-3">
              <Target size={14} className="text-brand-600" />
              <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">
                Já vendido — {monthName(1)}
              </h2>
            </div>
            {ptL
              ? <div className="h-4 w-20 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
              : paytour
                ? (
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] text-gray-400">Receita</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">R$ {fmtN(Math.round(paytour.totalRevenue))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Pedidos</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{fmtN(paytour.totalSales)}</p>
                    </div>
                  </div>
                )
                : <p className="text-xs text-gray-400">Sem dados</p>
            }
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex-1">
            <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider mb-3">Satisfação &amp; Reputação</h2>

            {/* Satisfação Geral — NPS combinado ponderado */}
            {(() => {
              const surveyNPS    = survey?.npsScore ?? null;
              const surveyVol    = survey?.totalResponses ?? 0;
              const googleRating = google?.averageRating ?? null;
              const googleVol    = google?.totalReviews ?? 0;
              // Converte nota Google (1-5) para escala NPS (-100 a +100)
              const googleNPS    = googleRating !== null ? Math.round((googleRating - 3) / 2 * 100) : null;
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
                <div className={clsx(
                  'rounded-xl p-3 mb-3 flex items-center justify-between',
                  color === 'green'  && 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800',
                  color === 'orange' && 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800',
                  color === 'red'    && 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
                  color === 'gray'   && 'bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700',
                )}>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Satisfação Geral</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                      Survey + Google · {fmtN(totalVol)} votos
                    </p>
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
              );
            })()}

            <div className="grid grid-cols-2 gap-2">
              <MiniKPI icon={<Target size={14} />} label="NPS Score" value={survey ? String(survey.npsScore) : '—'} sub="Pesquisa interna" color="green" loading={smL} />
              <MiniKPI icon={<Star size={14} />} label="Nota Google" value={google ? `${google.averageRating} ★` : '—'} sub={google ? `${fmtN(google.totalReviews)} avaliações` : undefined} color="orange" loading={gL} />
              <MiniKPI icon={<Smile size={14} />} label="Promotores" value={survey ? `${survey.promoters}%` : '—'} sub="NPS Survey" color="purple" loading={smL} />
              <MiniKPI icon={<MessageSquare size={14} />} label="Sem Resposta" value={google ? String(google.unansweredCount) : '—'} sub="Google" color="brand" loading={gL} />
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
