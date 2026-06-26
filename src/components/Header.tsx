import { useRef, useEffect, useState } from 'react';
import { RefreshCw, Moon, Sun, Target, Tv, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { ApiStatus, Period } from '../types';
import clsx from 'clsx';

interface HeaderProps {
  period: Period;
  onPeriodChange: (p: Period) => void;
  onRefresh: () => void;
  lastSync: Date | null;
  apiStatus: ApiStatus;
  darkMode: boolean;
  onToggleDark: () => void;
  kdsMode: boolean;
  onToggleKds: () => void;
  onEditGoals: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function periodLabel(p: Period): string {
  if (p === 'today') return 'Hoje';
  if (p === '7d')    return '7 dias';
  if (p === '30d')   return '30 dias';
  if (p === '90d')   return '90 dias';
  if (p === 'month') {
    const n = new Date();
    return n.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
  if (p.startsWith('custom:')) {
    const [, from, to] = p.split(':');
    const fmt = (d: string) =>
      new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${fmt(from)} – ${fmt(to)}`;
  }
  return p;
}

function prevMonth(p: Period): Period {
  const ref = p === 'month'
    ? new Date()
    : p.startsWith('custom:')
      ? new Date(p.split(':')[1] + 'T00:00:00')
      : new Date();
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const from = d.toISOString().slice(0, 10);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  return `custom:${from}:${last}`;
}

function nextMonth(p: Period): Period {
  const ref = p === 'month'
    ? new Date()
    : p.startsWith('custom:')
      ? new Date(p.split(':')[1] + 'T00:00:00')
      : new Date();
  const d = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  const from = d.toISOString().slice(0, 10);
  const last = new Date(d.getFullYear(), d.getMonth() + 2, 0).toISOString().slice(0, 10);
  // Don't go past today
  const today = todayStr();
  if (from > today) return p;
  return `custom:${from}:${last < today ? last : today}`;
}

// ── Date Range Picker ─────────────────────────────────────────────────────────
function DateRangePicker({
  period, onChange,
}: { period: Period; onChange: (p: Period) => void }) {
  const [open, setOpen]           = useState(false);
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const containerRef              = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Pre-fill inputs when opening
  function handleOpen() {
    if (period.startsWith('custom:')) {
      const [, f, t] = period.split(':');
      setFrom(f ?? '');
      setTo(t ?? '');
    } else if (period === 'month') {
      const n   = new Date();
      const f   = new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
      setFrom(f);
      setTo(todayStr());
    } else {
      setFrom('');
      setTo(todayStr());
    }
    setOpen((o) => !o);
  }

  function applyCustom() {
    if (from && to && from <= to) {
      onChange(`custom:${from}:${to}`);
      setOpen(false);
    }
  }

  const isCustomActive = period.startsWith('custom:');

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">

      {/* ── Quick preset buttons ── */}
      {(['today', 'month'] as const).map((preset) => (
        <button
          key={preset}
          onClick={() => { onChange(preset); setOpen(false); }}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
            period === preset
              ? 'bg-brand-600 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
          )}
        >
          {preset === 'today' ? 'Hoje' : 'Mês'}
        </button>
      ))}

      {/* ── Month navigation (only when 'month' or custom that looks monthly) ── */}
      {(period === 'month' || isCustomActive) && (
        <div className="flex items-center gap-0.5 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <button
            onClick={() => onChange(prevMonth(period))}
            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Mês anterior"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="px-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
            {periodLabel(period)}
          </span>
          <button
            onClick={() => onChange(nextMonth(period))}
            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Próximo mês"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* ── Calendar icon / custom trigger ── */}
      <button
        onClick={handleOpen}
        className={clsx(
          'flex items-center gap-1 p-1.5 rounded-lg text-xs font-medium transition-colors',
          isCustomActive
            ? 'text-brand-600 dark:text-brand-400'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
        )}
        title="Selecionar período personalizado"
      >
        <CalendarDays size={15} />
      </button>

      {/* ── Popover ── */}
      {open && (
        <div className="absolute top-full mt-2 right-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 w-64">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
            Período personalizado
          </p>

          <div className="space-y-2 mb-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">De</label>
              <input
                type="date"
                value={from}
                max={to || todayStr()}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Até</label>
              <input
                type="date"
                value={to}
                min={from}
                max={todayStr()}
                onChange={(e) => setTo(e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          <button
            onClick={applyCustom}
            disabled={!from || !to || from > to}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>

          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 grid grid-cols-2 gap-1.5">
            {[
              { label: 'Ontem', value: (() => { const d = new Date(); d.setDate(d.getDate() - 1); const s = d.toISOString().slice(0,10); return `custom:${s}:${s}`; })() },
              { label: 'Mês atual', value: 'month' },
              { label: '7 dias',   value: '7d' },
              { label: '90 dias',  value: '90d' },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => { onChange(p.value); setOpen(false); }}
                className={clsx(
                  'text-xs py-1.5 rounded-lg font-medium transition-colors',
                  period === p.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: 'connected' | 'error' | 'loading' }) {
  return (
    <span className={clsx('w-2 h-2 rounded-full inline-block', {
      'bg-green-400':                status === 'connected',
      'bg-red-400':                  status === 'error',
      'bg-yellow-400 animate-pulse': status === 'loading',
    })} />
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
export function Header({
  period, onPeriodChange, onRefresh, lastSync,
  apiStatus, darkMode, onToggleDark,
  kdsMode, onToggleKds, onEditGoals,
}: HeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between gap-3 sticky top-0 z-30">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <img
          src="/logo.png"
          alt="Hibiscus Beach Club"
          className="h-9 w-auto object-contain"
          onError={(e) => {
            const el = e.currentTarget;
            el.style.display = 'none';
            const fallback = el.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <div className="hidden w-9 h-9 bg-brand-600 rounded-lg items-center justify-center text-white font-bold text-sm">H</div>
        <div className="hidden sm:block">
          <h1 className="text-sm font-bold text-brand-600 leading-tight">Hibiscus Beach Club</h1>
          <p className="text-xs text-gray-400">Dashboard Integrado</p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-1 flex-1 justify-center">
        <DateRangePicker period={period} onChange={onPeriodChange} />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden md:flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1 cursor-default" title="SurveyMonkey — pesquisa de satisfação"><StatusDot status={apiStatus.surveymonkey} /> SM</span>
          <span className="flex items-center gap-1 cursor-default" title="Google Meu Negócio — avaliações do Google"><StatusDot status={apiStatus.google} /> GM</span>
          <span className="flex items-center gap-1 cursor-default" title="Paytour — vendas e reservas"><StatusDot status={apiStatus.paytour} /> PT</span>
        </div>

        {lastSync && (
          <span className="hidden lg:block text-xs text-gray-400">
            {lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <button onClick={onRefresh} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Atualizar">
          <RefreshCw size={15} />
        </button>
        <button onClick={onEditGoals} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Editar Metas">
          <Target size={15} />
        </button>
        <button
          onClick={onToggleKds}
          className={clsx('hidden sm:block p-1.5 rounded-lg transition-colors',
            kdsMode ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700')}
          title={kdsMode ? 'Desativar Modo TV' : 'Modo TV'}
        >
          <Tv size={15} />
        </button>
        <button onClick={onToggleDark} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Alternar tema">
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
