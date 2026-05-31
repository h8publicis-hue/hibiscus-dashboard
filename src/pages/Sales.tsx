import { useMemo } from 'react';
import { DollarSign, ShoppingCart, TrendingDown, CalendarCheck, TrendingUp, Loader2, Target } from 'lucide-react';
import { KPICard } from '../components/KPICard';
import { usePaytour } from '../hooks/usePaytour';
import { useGoals } from '../hooks/useGoals';
import { Period } from '../types';
import clsx from 'clsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';

interface SalesProps { period: Period }

const CHANNEL_COLORS = ['#3b82f6', '#22c55e', '#f59e0b'];
const PRODUCT_COLORS = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24'];

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}
function fmtDec(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v);
}

function periodLabel(period: string): string {
  if (period === 'today')  return 'Hoje';
  if (period === '7d')     return 'Últimos 7 dias';
  if (period === '30d')    return 'Últimos 30 dias';
  if (period === '90d')    return 'Últimos 90 dias';
  if (period === 'month') {
    const now = new Date();
    return now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
  }
  if (period.startsWith('custom:')) {
    const [, from, to] = period.split(':');
    const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${fmt(from)} – ${fmt(to)}`;
  }
  return 'Período';
}

export function Sales({ period }: SalesProps) {
  const { data, loading, stale }             = usePaytour(period);
  const { data: monthData, loading: monthL } = usePaytour('month'); // sempre o mês atual
  const [goals]                              = useGoals();

  const monthRevenue  = monthData?.totalRevenue  ?? 0;
  const monthSales    = monthData?.totalSales    ?? 0;
  const goalRevenue   = goals.receitaTotal;
  const pct           = goalRevenue > 0 ? Math.min((monthRevenue / goalRevenue) * 100, 100) : 0;
  const monthName     = new Date().toLocaleDateString('pt-BR', { month: 'long' })
    .replace(/^\w/, c => c.toUpperCase());

  const compareData = useMemo(() =>
    data?.salesByDay.slice(-30).map((d, i) => ({
      day: i + 1,
      'Mês Atual': d.revenue,
      'Mês Anterior': Math.round(d.revenue * (0.85 + Math.sin(i * 0.5) * 0.1)),
    })), [data?.salesByDay]);

  // Product chart data — short label for x-axis
  const productChartData = useMemo(() =>
    data?.topProducts.map(p => ({
      name: p.name.replace('Passeio de Lancha', 'Lancha').replace('Massagem', 'Massa.'),
      vendas: p.sales,
      receita: p.revenue,
    })), [data?.topProducts]);

  return (
    <div className={clsx('p-6 space-y-6', stale && 'opacity-75 transition-opacity duration-200')}>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Vendas — Paytour</h2>
        {stale && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Loader2 size={12} className="animate-spin" /> atualizando…
          </span>
        )}
      </div>

      {/* ── Meta do mês — sempre visível ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-brand-600 shrink-0" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Faturamento — {monthName}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {monthL ? (
              <span className="text-gray-400 text-xs animate-pulse">carregando…</span>
            ) : (
              <>
                <span className="font-bold text-gray-900 dark:text-white">{fmtDec(monthRevenue)}</span>
                <span className="text-gray-400 text-xs">de {fmt(goalRevenue)}</span>
                <span className={clsx(
                  'text-xs font-semibold px-2 py-0.5 rounded-full',
                  pct >= 100 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : pct >= 70 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                )}>
                  {pct.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-400">{monthSales} vendas</span>
              </>
            )}
          </div>
        </div>
        {/* Barra de progresso */}
        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          {!monthL && (
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-700',
                pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-brand-600',
              )}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      </div>

      {/* ── Row 1: Faturamento highlight + KPIs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Faturamento card — big highlight */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-xl p-6 text-white shadow-md flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={20} className="opacity-80" />
            <div>
              <span className="text-sm font-medium opacity-90">Faturamento</span>
              <span className="block text-xs opacity-60">{periodLabel(period)}</span>
            </div>
          </div>
          {loading ? (
            <div className="h-10 bg-white/20 rounded animate-pulse mb-2" />
          ) : (
            <p className="text-4xl font-black tracking-tight">{data ? fmtDec(data.totalRevenue) : '—'}</p>
          )}
          <div className="mt-3 pt-3 border-t border-white/20">
            <span className="text-xs opacity-75">Vendas de hoje:&nbsp;</span>
            {loading ? (
              <span className="text-xs opacity-50">carregando...</span>
            ) : (
              <span className="text-sm font-bold">{data ? fmtDec(data.todayRevenue) : '—'}</span>
            )}
          </div>
        </div>

        {/* Reservas card */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-6 text-white shadow-md flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <CalendarCheck size={20} className="opacity-80" />
            <span className="text-sm font-medium opacity-90">Reservas</span>
          </div>
          {loading ? (
            <div className="h-10 bg-white/20 rounded animate-pulse mb-2" />
          ) : (
            <p className="text-4xl font-black tracking-tight">
              {data ? data.totalSales.toLocaleString('pt-BR') : '—'}
            </p>
          )}
          <div className="mt-3 pt-3 border-t border-white/20">
            <span className="text-xs opacity-75">Ticket médio:&nbsp;</span>
            {loading ? (
              <span className="text-xs opacity-50">carregando...</span>
            ) : (
              <span className="text-sm font-bold">{data ? fmtDec(data.averageTicket) : '—'}</span>
            )}
          </div>
        </div>

        {/* Right column: 2 smaller KPIs */}
        <div className="grid grid-cols-1 gap-4">
          <KPICard
            title="Vendas Hoje"
            value={loading ? '—' : (data ? `${data.todayOrders} pedidos` : '—')}
            subtitle={loading ? undefined : (data ? fmtDec(data.todayRevenue) : undefined)}
            icon={<TrendingUp size={18} />}
            color="green"
            loading={false}
          />
          <KPICard
            title="Cancelamentos"
            value={data ? data.cancellations : '—'}
            icon={<TrendingDown size={18} />}
            color="red"
            loading={loading}
          />
        </div>
      </div>

      {/* ── Row 2: Product bar chart + Channel pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Product sales bar chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Vendas por Produto</h3>
          {loading ? <div className="h-56 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={productChartData} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === 'receita' ? [fmt(v), 'Receita'] : [v, 'Vendas']
                  }
                />
                <Bar dataKey="vendas" name="Vendas" radius={[4, 4, 0, 0]}>
                  {productChartData?.map((_, i) => (
                    <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Channel pie */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Vendas por Canal</h3>
          {loading ? <div className="h-56 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={224}>
              <PieChart>
                <Pie
                  data={data?.salesByChannel}
                  dataKey="count"
                  nameKey="channel"
                  cx="50%" cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data?.salesByChannel.map((_, i) => (
                    <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => v.toLocaleString('pt-BR')} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Row 3: Product revenue table ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Receita por Produto</h3>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}</div>
        ) : (
          <div className="space-y-3">
            {data?.topProducts.map((p, i) => {
              const maxRevenue = Math.max(...(data.topProducts.map(x => x.revenue)));
              const pct = maxRevenue > 0 ? (p.revenue / maxRevenue) * 100 : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{p.name}</span>
                    <div className="flex gap-4 text-gray-500 dark:text-gray-400">
                      <span>{p.sales} vendas</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-100">{fmt(p.revenue)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Row 4: Daily revenue chart ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Receita por Dia</h3>
        {loading ? <div className="h-56 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
          <ResponsiveContainer width="100%" height={224}>
            <BarChart data={data?.salesByDay.slice(-14)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="revenue" name="Receita" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
