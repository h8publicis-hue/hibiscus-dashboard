import { NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Smile, Star, Users } from 'lucide-react';
import clsx from 'clsx';

interface BottomNavProps {
  occupancyAlerts: number;
  overviewAlerts:  number;
  surveyAlerts:    number;
  reviewsAlerts:   number;
}

export function BottomNav({ occupancyAlerts, overviewAlerts, surveyAlerts, reviewsAlerts }: BottomNavProps) {
  const items = [
    { to: '/',           icon: LayoutDashboard, label: 'Visão',    alerts: overviewAlerts },
    { to: '/vendas',     icon: TrendingUp,      label: 'Vendas',   alerts: 0 },
    { to: '/ocupacao',   icon: Users,           label: 'Ocupação', alerts: occupancyAlerts },
    { to: '/satisfacao', icon: Smile,           label: 'Survey',   alerts: surveyAlerts },
    { to: '/avaliacoes', icon: Star,            label: 'Avaliações', alerts: reviewsAlerts },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex">
      {items.map(({ to, icon: Icon, label, alerts }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            clsx(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors relative',
              isActive
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-gray-400 dark:text-gray-500',
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                {alerts > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none font-bold">
                    {alerts > 9 ? '9+' : alerts}
                  </span>
                )}
              </div>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
