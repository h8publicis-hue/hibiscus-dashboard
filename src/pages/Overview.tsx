import { useMemo } from 'react';
import { DollarSign, Target, Star, ShoppingCart, Smile, MessageSquare } from 'lucide-react';
import { KPICard } from '../components/KPICard';
import { usePaytour } from '../hooks/usePaytour';
import { useSurveyMonkey } from '../hooks/useSurveyMonkey';
import { useGoogleBusiness } from '../hooks/useGoogleBusiness';
import { Period, Alert, Goals, OccupancyState, SPACE_CONFIGS } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

interface OverviewProps {
  period: Period;
  goals: Goals;
  occupancy: OccupancyState;
}

const ALERTS: Alert[] = [
  { id: '1', type: 'warning', message: '2 novas avaliações negativas no Google (últimas 24h)',           section: 'reviews',      timestamp: '3h atrás' },
  { id: '2', type: 'info',    message: '5 avaliações no Google aguardando resposta',                     section: 'reviews',      timestamp: '5h atrás' },
  { id: '3', type: 'success', message: 'Passeio de Lancha com alta de 24% nas vendas este mês',          section: 'sales',        timestamp: '1d atrás' },
  { id: '4', type: 'warning', message: 'Taxa de satisfação abaixo da meta (67% vs 75%)',                 section: 'satisfaction', timestamp: '2d atrás' },
];

const alertStyle: Record<string, string> = {
  warning: 'border-l-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
  error:   'border-l-red-400 bg-red-50 dark:bg-red-900/20',
  success: 'border-l-green-400 bg-green-50 dark:bg-green-900/20',
  info:    'border-l-brand-600 bg-brand-50 dark:bg-brand-900/20',
};

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

function OccupancyMini({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = current / max;
  const bar  = pct >= SPACE_CONFIGS.beach.alert     ? 'bg-red-500'    : pct >= SPACE_CONFIGS.beach.attention ? 'bg-yellow-400' : 'bg-green-500';
  const text = pct >= SPACE_CONFIGS.beach.alert     ? 'text-red-600'  : pct >= SPACE_CONFIGS.beach.attention ? 'text-yellow-600' : 'text-green-600';
  const border = pct >= SPACE_CONFIGS.beach.alert   ? 'border-red-300' : pct >= SPACE_CONFIGS.beach.attention ? 'border-yellow-300' : 'border-green-300';
  return (
    <div className={clsx('bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-col gap-2', border)}>
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="font-medium">{label}</span>
        <span className={clsx('font-bold', text)}>{Math.round(pct * 100)}%</span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-300', bar)} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <p className="text-sm font-bold text-gray-800 dark:text-white">{current} <span className="text-xs font-normal text-gray-400">/ {max}</span></p>
    </div>
  );
}

export function Overview({ period, goals, occupancy }: OverviewProps) {
  const { data: paytour, loading: ptL, progress: ptProgress } = usePaytour(period);
  const { data: survey,  loading: smL } = useSurveyMonkey(period);
  const { data: google,  loading: gL  } = useGoogleBusiness(period);

  const timelineData = useMemo(() =>
    (paytour?.salesByDay ?? []).slice(-30).map((d, i) => ({
      date:    d.date.slice(5),
      Receita: Math.round((d.revenue / 14000) * 100),
      NPS:     Math.min(100, Math.max(0, (survey?.npsScore ?? 52) + Math.sin(i * 0.7) * 8)),
      Google:  Math.round(((google?.averageRating ?? 4.4) / 5) * 100),
    })), [paytour?.salesByDay, survey?.npsScore, google?.averageRating]);

  const revTrend = paytour && paytour.previousPeriodRevenue > 0
    ? Math.round(((paytour.totalRevenue - paytour.previousPeriodRevenue) / paytour.previousPeriodRevenue) * 100)
    : undefined;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Visão Geral</h2>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          title="Receita Total"
          value={paytour ? fmt(paytour.totalRevenue) : '—'}
          icon={<DollarSign size={18} />}
          color="brand"
          trend={revTrend}
          loading={ptL}
          goalValue={paytour?.totalRevenue}
          goal={goals.receitaTotal}
          progress={ptProgress}
        />
        <KPICard
          title="NPS Score"
          value={survey ? survey.npsScore : '—'}
          subtitle="Última medição"
          icon={<Target size={18} />}
          color="green"
          loading={smL}
          goalValue={survey?.npsScore}
          goal={goals.npsScore}
        />
        <KPICard
          title="Nota Google"
          value={google ? `${google.averageRating} ★` : '—'}
          subtitle={google ? `${google.totalReviews} avaliações` : undefined}
          icon={<Star size={18} />}
          color="yellow"
          loading={gL}
          goalValue={google?.averageRating}
          goal={goals.notaGoogle}
        />
        <KPICard
          title="Nº de Vendas"
          value={paytour ? paytour.totalSales.toLocaleString('pt-BR') : '—'}
          icon={<ShoppingCart size={18} />}
          color="purple"
          loading={ptL}
          goalValue={paytour?.totalSales}
          goal={goals.numeroVendas}
          progress={ptProgress}
        />
        <KPICard
          title="Taxa de Satisfação"
          value={survey ? `${survey.promoters}%` : '—'}
          subtitle="Promotores NPS"
          icon={<Smile size={18} />}
          color="orange"
          loading={smL}
          goalValue={survey?.promoters}
          goal={goals.taxaSatisfacao}
        />
        <KPICard
          title="Sem Resposta"
          value={google ? google.unansweredCount : '—'}
          subtitle="Avaliações Google"
          icon={<MessageSquare size={18} />}
          color="red"
          loading={gL}
        />
      </div>

      {/* Ocupação resumo */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ocupação Atual</h3>
          <a href="/ocupacao" className="text-xs text-brand-600 hover:underline">Ver detalhes →</a>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <OccupancyMini label="🏖️ Beach" current={occupancy.beach} max={SPACE_CONFIGS.beach.max} />
          <OccupancyMini
            label="🛋️ Lounge"
            current={occupancy.lounges.reduce((a, b) => a + b, 0)}
            max={SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count}
          />
          <OccupancyMini label="💎 Prime" current={occupancy.prime} max={SPACE_CONFIGS.prime.max} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Linha do Tempo Unificada</h3>
        <p className="text-xs text-gray-400 mb-4">Métricas normalizadas 0–100 · últimos 30 dias</p>
        {ptL ? (
          <div className="h-64 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={256}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Receita" stroke="#2b3180" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="NPS"     stroke="#22c55e" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Google"  stroke="#f59e0b" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Alertas Inteligentes</h3>
        <div className="space-y-2">
          {ALERTS.map((a) => (
            <div key={a.id} className={clsx('border-l-4 pl-3 py-2 pr-2 rounded-r-lg', alertStyle[a.type])}>
              <p className="text-sm text-gray-800 dark:text-gray-200">{a.message}</p>
              <p className="text-xs text-gray-400 mt-0.5">{a.timestamp}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
