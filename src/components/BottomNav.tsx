import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Smile, Star, Users, Activity, Bell, UtensilsCrossed, Settings, FileText, MoreHorizontal, X } from 'lucide-react';
import clsx from 'clsx';

interface BottomNavProps {
  occupancyAlerts: number;
  overviewAlerts:  number;
  surveyAlerts:    number;
  reviewsAlerts:   number;
}

const ALL_ITEMS = [
  { to: '/',              icon: LayoutDashboard,  label: 'Visão',      primary: true  },
  { to: '/vendas',        icon: TrendingUp,       label: 'Vendas',     primary: true  },
  { to: '/ocupacao',      icon: Users,            label: 'Ocupação',   primary: true  },
  { to: '/satisfacao',    icon: Smile,            label: 'Survey',     primary: true  },
  { to: '/avaliacoes',    icon: Star,             label: 'Avaliações', primary: false },
  { to: '/chamadas',      icon: Bell,             label: 'Chamadas',   primary: false },
  { to: '/relatorio',     icon: FileText,         label: 'Fechamento', primary: false },
  { to: '/fluxo',         icon: Activity,         label: 'Fluxo',      primary: false },
  { to: '/cozinha',       icon: UtensilsCrossed,  label: 'Cozinha',    primary: false },
  { to: '/refeicao/admin',icon: UtensilsCrossed,  label: 'Refeitório', primary: false },
  { to: '/configuracoes', icon: Settings,         label: 'Config.',    primary: false },
];

export function BottomNav({ occupancyAlerts, overviewAlerts, surveyAlerts, reviewsAlerts }: BottomNavProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const alerts: Record<string, number> = {
    '/':           overviewAlerts,
    '/ocupacao':   occupancyAlerts,
    '/satisfacao': surveyAlerts,
    '/avaliacoes': reviewsAlerts,
  };

  const primaryItems = ALL_ITEMS.filter(i => i.primary);
  const moreItems    = ALL_ITEMS.filter(i => !i.primary);
  const moreActive   = moreItems.some(i => location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to)));

  return (
    <>
      {/* Gaveta "Mais" */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          {/* Painel */}
          <div className="relative bg-white dark:bg-gray-800 rounded-t-2xl shadow-xl px-4 pt-4 pb-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Mais opções</span>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {moreItems.map(({ to, icon: Icon, label }) => {
                const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-[11px] font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                        : 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50',
                    )}
                  >
                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                    {label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Barra inferior */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex">
        {primaryItems.map(({ to, icon: Icon, label }) => {
          const badge = alerts[to] ?? 0;
          return (
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
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none font-bold">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </div>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          );
        })}

        {/* Botão Mais */}
        <button
          onClick={() => setOpen(v => !v)}
          className={clsx(
            'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
            moreActive ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500',
          )}
        >
          <MoreHorizontal size={20} strokeWidth={1.8} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
}
