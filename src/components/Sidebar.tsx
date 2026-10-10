import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Smile, Activity, Bell, UtensilsCrossed, Settings, FileText, BookOpen, Map, ChevronRight, Monitor } from 'lucide-react';
import clsx from 'clsx';
import { useState, useEffect } from 'react';

interface SidebarProps {
  overviewAlerts: number;
  surveyAlerts:   number;
}

export function Sidebar({ overviewAlerts, surveyAlerts }: SidebarProps) {
  const [pinned, setPinned] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar-expanded') === 'true'; } catch { return false; }
  });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('sidebar-expanded', String(pinned)); } catch { /* ignore */ }
  }, [pinned]);

  const open = pinned || hovered;

  const allItems = [
    { to: '/',               icon: LayoutDashboard, label: 'Visão Geral',    alerts: overviewAlerts },
    { to: '/satisfacao',     icon: Smile,           label: 'Survey',         alerts: surveyAlerts },
    { to: '/fluxo',          icon: Activity,        label: 'Fluxo',          alerts: 0 },
    { to: '/mapa-ocupacao',  icon: Map,             label: 'Mapa Beach',     alerts: 0 },
    { to: '/chamadas',       icon: Bell,            label: 'Chamadas',       alerts: 0 },
    { to: '/relatorio',      icon: FileText,        label: 'Fechamento',     alerts: 0 },
    { to: '/cozinha',        icon: Monitor,         label: 'Painel Cozinha', alerts: 0 },
    { to: '/refeicao/admin', icon: UtensilsCrossed, label: 'Refeitório',     alerts: 0 },
    { to: '/ajuda',          icon: BookOpen,        label: 'Treinamento',    alerts: 0 },
    { to: '/configuracoes',  icon: Settings,        label: 'Configurações',  alerts: 0 },
  ];

  const renderLink = ({ to, icon: Icon, label, alerts }: typeof allItems[0]) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      title={!open ? label : undefined}
      className={({ isActive }) =>
        clsx(
          'flex items-center rounded-lg text-sm font-medium transition-all duration-200',
          open ? 'justify-between px-3 py-2' : 'justify-center px-0 py-2.5',
          isActive
            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        )
      }
    >
      <span className={clsx('flex items-center', open ? 'gap-2.5' : 'justify-center w-full')}>
        <Icon size={18} />
        {open && <span className="truncate">{label}</span>}
      </span>
      {alerts > 0 && (
        <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none shrink-0">
          {alerts}
        </span>
      )}
    </NavLink>
  );

  const mainItems   = allItems.filter(i => i.to !== '/configuracoes');
  const bottomItems = allItems.filter(i => i.to === '/configuracoes');

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={clsx(
        'hidden lg:flex flex-col py-4 shrink-0 self-stretch bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-200',
        open ? 'w-52 px-3' : 'w-14 px-1.5',
      )}
    >
      {/* Toggle — fixa/desfxa o menu aberto */}
      <div className="border-b border-gray-100 dark:border-gray-700 pb-2 mb-2">
        <button
          onClick={() => setPinned(p => !p)}
          title={pinned ? 'Desafixar menu' : 'Fixar menu aberto'}
          className={clsx(
            'flex items-center rounded-lg text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-full',
            open ? 'gap-2 px-3 py-2 justify-start' : 'justify-center px-0 py-2.5',
          )}
        >
          <ChevronRight
            size={15}
            className={clsx('transition-transform duration-200', pinned && 'rotate-180')}
          />
          {open && <span>{pinned ? 'Recolher' : 'Fixar'}</span>}
        </button>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {mainItems.map(renderLink)}
      </nav>

      <div className="border-t border-gray-100 dark:border-gray-700 pt-2 mt-2 flex flex-col gap-1">
        {bottomItems.map(renderLink)}
      </div>
    </aside>
  );
}
