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

  const renderLink = ({ to, icon: Icon, label, alerts }: typeof allItems[0]) => (
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
  );

  return (
    <aside className="hidden lg:flex w-52 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col py-4 px-3 shrink-0 self-stretch">
      <nav className="flex flex-col gap-1">
        {allItems.map(renderLink)}
      </nav>

      <div className="mt-auto px-3 pt-3 pb-[76px] border-t border-gray-100 dark:border-gray-700">
        <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-tight">Desenvolvido por</p>
        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-500 leading-tight">H8 Sistemas</p>
      </div>
    </aside>
  );
}
