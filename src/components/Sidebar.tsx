import { NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Smile, Star, Users, Activity, Bell, UtensilsCrossed, Settings, FileText } from 'lucide-react';
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
    { to: '/fluxo',     icon: Activity,        label: 'Fluxo',       alerts: 0 },
    { to: '/chamadas',  icon: Bell,            label: 'Chamadas',    alerts: 0 },
    { to: '/relatorio', icon: FileText,        label: 'Fechamento',  alerts: 0 },
    { to: '/cozinha',          icon: UtensilsCrossed, label: 'Cozinha',     alerts: 0 },
    { to: '/refeicao/admin',   icon: UtensilsCrossed, label: 'Refeitório',  alerts: 0 },
    { to: '/configuracoes',    icon: Settings,        label: 'Configurações', alerts: 0 },
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

  const mainItems   = allItems.filter(i => i.to !== '/configuracoes');
  const bottomItems = allItems.filter(i => i.to === '/configuracoes');

  return (
    <aside className="hidden lg:flex w-52 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col py-4 px-3 shrink-0 self-stretch">
      <nav className="flex flex-col gap-1 flex-1">
        {mainItems.map(renderLink)}
      </nav>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-2 mt-2 flex flex-col gap-1">
        {bottomItems.map(renderLink)}
      </div>
    </aside>
  );
}
