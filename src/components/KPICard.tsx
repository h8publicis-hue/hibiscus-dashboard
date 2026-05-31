import { ReactNode } from 'react';
import clsx from 'clsx';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: number;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange' | 'brand';
  loading?: boolean;
  goal?: number;
  goalValue?: number;
  progress?: { current: number; total: number } | null;
}

const colorMap: Record<string, string> = {
  blue:   'bg-blue-500',
  green:  'bg-green-500',
  yellow: 'bg-yellow-500',
  red:    'bg-red-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  brand:  'bg-brand-600',
};

export function KPICard({ title, value, subtitle, icon, trend, color = 'brand', loading, goal, goalValue, progress }: KPICardProps) {
  if (loading) {
    const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden relative">
        <div className="flex items-center justify-between mb-3 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2 animate-pulse" />
        {progress ? (
          <div className="mt-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Carregando dados…</span>
              <span className="text-gray-500 font-medium">{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{progress.current} / {progress.total} páginas</p>
          </div>
        ) : (
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse" />
        )}
      </div>
    );
  }

  const showGoal = goal !== undefined && goalValue !== undefined && goal > 0;
  const pct = showGoal ? Math.min(100, Math.round((goalValue! / goal!) * 100)) : 0;
  const barColor = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-red-500';
  const pctColor = pct >= 90 ? 'text-green-600' : pct >= 70 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center text-white', colorMap[color])}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
      {trend !== undefined && (
        <div className={clsx('flex items-center gap-1 mt-2 text-xs font-medium', trend >= 0 ? 'text-green-600' : 'text-red-500')}>
          <span>{trend >= 0 ? '↑' : '↓'}</span>
          <span>{Math.abs(trend)}% vs período anterior</span>
        </div>
      )}
      {showGoal && (
        <div className="mt-2">
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-gray-400">Meta</span>
            <span className={clsx('font-medium', pctColor)}>{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-700', barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
