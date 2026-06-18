import { TrendingUp, ShoppingBag, Users, XCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { usePaytour } from '../hooks/usePaytour';
import { Period } from '../types';
import clsx from 'clsx';

interface SalesProps { period: Period }

function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
function fmtN(v: number) { return v.toLocaleString('pt-BR'); }

function KpiCard({
  label, value, sub, icon, color, loading,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; color: string; loading?: boolean;
}) {
  const colors: Record<string, string> = {
    brand:  'bg-brand-600',
    green:  'bg-green-500',
    purple: 'bg-purple-500',
    red:    'bg-red-500',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0', colors[color] ?? colors.brand)}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        {loading
          ? <div className="h-6 w-24 bg-gray-200 dark:bg-gray-600 rounded animate-pulse mt-1" />
          : <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        }
        {sub && !loading && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

export function Sales({ period }: SalesProps) {
  const { data, loading, error } = usePaytour(period);

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  const chartData = (data?.salesByDay ?? []).map((d) => ({
    date:    d.date.slice(5), // MM-DD
    receita: Math.round(d.revenue),
    pedidos: d.count,
  }));

  return (
    <div className="p-4 flex flex-col gap-4">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Receita Total"
          value={data ? fmtCurrency(data.totalRevenue) : '—'}
          icon={<TrendingUp size={18} />}
          color="brand"
          loading={loading}
        />
        <KpiCard
          label="Nº de Pedidos"
          value={data ? fmtN(data.totalSales) : '—'}
          sub={data ? `${fmtN(data.totalItems)} atividades` : undefined}
          icon={<ShoppingBag size={18} />}
          color="green"
          loading={loading}
        />
        <KpiCard
          label="Ticket Médio"
          value={data ? fmtCurrency(data.averageTicket) : '—'}
          icon={<Users size={18} />}
          color="purple"
          loading={loading}
        />
        <KpiCard
          label="Cancelamentos"
          value={data ? fmtN(data.cancellations) : '—'}
          icon={<XCircle size={18} />}
          color="red"
          loading={loading}
        />
      </div>

      {/* Chart + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Bar chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Receita por Dia</h2>
          {loading
            ? <div className="h-48 flex items-center justify-center"><div className="text-xs text-gray-400 animate-pulse">Carregando...</div></div>
            : chartData.length === 0
              ? <div className="h-48 flex items-center justify-center text-xs text-gray-400">Sem dados para o período</div>
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => [fmtCurrency(value), 'Receita']}
                      labelStyle={{ fontSize: 11 }}
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="receita" fill="#0f766e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )
          }
        </div>

        {/* Top products */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Top Produtos</h2>
          {loading
            ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                ))}
              </div>
            )
            : !data?.topProducts?.length
              ? <p className="text-xs text-gray-400 text-center mt-8">Sem dados</p>
              : (
                <div className="space-y-2 overflow-y-auto max-h-56">
                  {data.topProducts.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 w-4 flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-400">{fmtN(p.sales)} vendas</p>
                      </div>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">{fmtCurrency(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              )
          }
        </div>
      </div>

      {/* Reservation status */}
      {data && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Status das Reservas</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-400">Confirmados</p>
              <p className="text-2xl font-bold text-green-600">{fmtN(data.reservationStatus.confirmed)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Pendentes</p>
              <p className="text-2xl font-bold text-yellow-500">{fmtN(data.reservationStatus.pending)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Cancelados</p>
              <p className="text-2xl font-bold text-red-500">{fmtN(data.reservationStatus.cancelled)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
