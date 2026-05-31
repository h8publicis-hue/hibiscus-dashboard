import { NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Smile, Star, Users } from 'lucide-react';
import clsx from 'clsx';

interface SidebarProps {
  occupancyAlerts: number;
  overviewAlerts:  number;
  surveyAlerts:    number;
  reviewsAlerts:   number;
}

export function Sidebar({ occupancyAlerts, overviewAlerts, surveyAlerts, reviewsAlerts }: SidebarProps) {
  const allItems = [
    { to: '/',           icon: LayoutDashboard, label: 'Visão Geral', alerts: overviewAlerts },
    { to: '/vendas',     icon: TrendingUp,      label: 'Vendas',      alerts: 0 },
    { to: '/satisfacao', icon: Smile,           label: 'Survey',      alerts: surveyAlerts },
    { to: '/avaliacoes', icon: Star,            label: 'Avaliações',  alerts: reviewsAlerts },
    { to: '/ocupacao',   icon: Users,           label: 'Ocupação',    alerts: occupancyAlerts },
  ];

  return (
    <aside className="w-52 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col py-4 px-3 shrink-0">
      <nav className="flex flex-col gap-1">
        {allItems.map(({ to, icon: Icon, label, alerts }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
              )
            }
          >
            <span className="flex items-center gap-2.5">
              <Icon size={16} />
              {label}
            </span>
            {alerts > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {alerts}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
