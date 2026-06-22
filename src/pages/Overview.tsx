import { Users, Star, Target, MessageSquare, Smile, Info } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useSurveyMonkey } from '../hooks/useSurveyMonkey';
import { useGoogleBusiness } from '../hooks/useGoogleBusiness';
import { usePaytour } from '../hooks/usePaytour';
import { useSheetOccupancy } from '../hooks/useSheetOccupancy';
import { fetchNextMonthVisitData, NextMonthVisit } from '../services/paytour';
import { Period, Goals, OccupancyState, SPACE_CONFIGS, SHEET_CAPS } from '../types';
import clsx from 'clsx';

interface OverviewProps {
  period: Period;
  goals:  Goals;
  occupancy: OccupancyState;
}

// ── Tooltip de informação ─────────────────────────────────────────────────────
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-gray-300 hover:text-brand-500 dark:text-gray-500 dark:hover:text-brand-400 transition-colors"
        aria-label="Saiba mais"
      >
        <Info size={11} />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-900 dark:bg-gray-700 text-white text-[11px] leading-relaxed rounded-lg px-3 py-2 shadow-xl">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </div>
      )}
    </div>
  );
}

function fmtN(v: number) {
  return v.toLocaleString('pt-BR');
}

function monthName(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ── Linha compacta Beach / Prime ──────────────────────────────────────────────
function OccupancyRow({ label, current, max }: { label: string; current: number; max: number }) {
  const pct  = current / max;
  const bar  = pct >= 0.9 ? 'bg-red-500' : pct >= 0.6 ? 'bg-yellow-400' : 'bg-green-500';
  const text = pct >= 0.9 ? 'text-red-600' : pct >= 0.6 ? 'text-yellow-600' : 'text-green-600';
  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-300', bar)} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <span className={clsx('text-xs font-bold w-12 text-right shrink-0', text)}>{current}/{max}</span>
    </div>
  );
}

// ── Mapa de lounges ───────────────────────────────────────────────────────────
function LoungeMap({ lounges }: { lounges: number[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">🛋️ Lounges</p>
      <div className="grid grid-cols-5 gap-1">
        {lounges.map((v, i) => {
          const pct = v / SPACE_CONFIGS.lounge.max;
          const bg  = v === 0
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400'
            : pct >= 0.9
              ? 'bg-red-100 text-red-700 border border-red-300'
              : pct >= 0.6
                ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                : 'bg-green-100 text-green-700 border border-green-300';
          return (
            <div key={i} className={clsx('rounded flex flex-col items-center justify-center py-1 text-center', bg)}>
              <span className="text-[8px] leading-none opacity-70">{SPACE_CONFIGS.lounge.start + i}</span>
              <span className="text-[10px] font-bold leading-tight">{v}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-0.5">
        <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-gray-200 inline-block"/>Livre</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-green-200 inline-block"/>Ocupado</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-red-200 inline-block"/>Cheio</span>
      </div>
    </div>
  );
}

// ── Mini KPI compacto ─────────────────────────────────────────────────────────
function MiniKPI({
  icon, label, value, sub, color = 'brand', loading, info,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  loading?: boolean;
  info?: string;
}) {
  const colors: Record<string, string> = {
    brand:  'bg-brand-600',
    green:  'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };
  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-2">
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0', colors[color] ?? colors.brand)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{label}</p>
          {info && <InfoTooltip text={info} />}
        </div>
        {loading
          ? <div className="h-4 w-12 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
          : <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{value}</p>
        }
        {sub && !loading && <p className="text-[9px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ── Mapa de lounges compacto para mobile ─────────────────────────────────────
function LoungeMapMini({ lounges }: { lounges: number[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">🛋️ Lounges</p>
      <div className="grid grid-cols-5 gap-1">
        {lounges.map((v, i) => {
          const pct = v / SPACE_CONFIGS.lounge.max;
          const bg  = v === 0
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400'
            : pct >= 0.9
              ? 'bg-red-100 text-red-700 border border-red-300'
              : pct >= 0.6
                ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                : 'bg-green-100 text-green-700 border border-green-300';
          return (
            <div key={i} className={clsx('rounded flex flex-col items-center justify-center py-0.5 text-center', bg)}>
              <span className="text-[7px] leading-none opacity-60">{SPACE_CONFIGS.lounge.start + i}</span>
              <span className="text-[9px] font-bold leading-tight">{v}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-0.5">
        <span className="flex items-center gap-1 text-[8px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-gray-200 inline-block"/>Livre</span>
        <span className="flex items-center gap-1 text-[8px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-green-200 inline-block"/>Ocupado</span>
        <span className="flex items-center gap-1 text-[8px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-red-200 inline-block"/>Cheio</span>
      </div>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
export function Overview({ period, goals: _goals, occupancy }: OverviewProps) {
  const { data: survey,  loading: smL } = useSurveyMonkey(period);
  const { data: google,  loading: gL  } = useGoogleBusiness(period);
  const { data: paytour, loading: ptL } = usePaytour(period);
  const { data: sheetOcc } = useSheetOccupancy();

  const [nextMonth, setNextMonth]   = useState<NextMonthVisit | null>(null);
  const [nextMonthL, setNextMonthL] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setNextMonthL(true);
    // Atrasa 4s para não competir com os fetches principais (Paytour/Survey/Google) na inicialização
    const delay = setTimeout(() => {
      fetchNextMonthVisitData()
        .then(d  => { if (!cancelled) { setNextMonth(d);  setNextMonthL(false); } })
        .catch(() => { if (!cancelled) { setNextMonthL(false); } });
    }, 4_000);
    return () => { cancelled = true; clearTimeout(delay); };
  }, []);

  // ── Bloco: Ao Vivo ────────────────────────────────────────────────────────
  const blocoAoVivo = (
    <div className="bg-gradient-to-r from-brand-700 to-brand-900 rounded-xl p-3 text-white shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          <h2 className="text-xs font-semibold uppercase tracking-wider opacity-90">Ao vivo — Hoje</h2>
        </div>
        {ptL && <span className="text-[10px] opacity-60 animate-pulse">Carregando...</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Receita',     val: paytour ? `R$ ${fmtN(Math.round(paytour.todayRevenue))}` : '—' },
          { label: 'Atividades',  val: paytour ? fmtN(paytour.todayItems) : '—' },
          { label: 'Reservas',    val: paytour ? fmtN(paytour.todayOrders) : '—' },
          { label: 'Ticket médio',val: paytour && paytour.todayOrders > 0 ? `R$ ${fmtN(Math.round(paytour.todayRevenue / paytour.todayOrders))}` : '—' },
        ].map(({ label, val }) => (
          <div key={label} className="bg-white/10 rounded-lg px-3 py-2">
            <p className="text-[10px] opacity-70">{label}</p>
            {ptL
              ? <div className="h-6 w-16 bg-white/20 rounded animate-pulse mt-1" />
              : <p className="text-lg font-bold leading-tight">{val}</p>
            }
          </div>
        ))}
      </div>
    </div>
  );

  // ── Bloco: Já Vendido ─────────────────────────────────────────────────────
  const blocoJaVendido = (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-1.5 mb-3">
        <Target size={14} className="text-brand-600" />
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">
          Já vendido — {monthName(1)}
        </h2>
        <InfoTooltip text="Pedidos com data de visita no próximo mês, independente de quando foram realizados. Corresponde ao relatório 'Usuários por Período' do Paytour." />
      </div>
      {nextMonthL
        ? <div className="h-4 w-20 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
        : nextMonth
          ? (
            <div className="flex gap-4">
              <div>
                <p className="text-[10px] text-gray-400">Receita</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">R$ {fmtN(Math.round(nextMonth.revenue))}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">Pedidos</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{fmtN(nextMonth.pedidos)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">Atividades</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{fmtN(nextMonth.atividades)}</p>
              </div>
            </div>
          )
          : <p className="text-xs text-gray-400">Sem dados</p>
      }
    </div>
  );

  // ── Bloco: Resumo do Período ──────────────────────────────────────────────
  const blocoResumo = (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
      <div className="flex items-center gap-1.5 mb-3">
        <Target size={14} className="text-brand-600" />
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Resumo do Período</h2>
      </div>
      {ptL
        ? <div className="flex-1 flex items-center justify-center"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" /></div>
        : paytour
          ? (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Receita',      val: `R$ ${fmtN(Math.round(paytour.totalRevenue))}` },
                { label: 'Pedidos',      val: fmtN(paytour.totalSales) },
                { label: 'Atividades',   val: fmtN(paytour.totalItems) },
                { label: 'Ticket Médio', val: `R$ ${fmtN(Math.round(paytour.averageTicket))}` },
              ].map(({ label, val }) => (
                <div key={label} className="text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">{val}</p>
                </div>
              ))}
            </div>
          )
          : <div className="flex-1 flex items-center justify-center"><p className="text-xs text-gray-400">Sem dados</p></div>
      }
    </div>
  );

  // ── Bloco: Top Produto + Status Reservas ──────────────────────────────────
  const blocoTopProduto = paytour ? (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">🏆 Top Produto</p>
      {paytour.topProducts[0] && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-800 dark:text-white truncate max-w-[60%]">{paytour.topProducts[0].name}</span>
          <span className="text-xs font-bold text-green-600">R$ {fmtN(Math.round(paytour.topProducts[0].revenue))}</span>
        </div>
      )}
      <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
        {[
          { label: 'Confirmadas', val: paytour.reservationStatus.confirmed, color: 'text-green-600' },
          { label: 'Pendentes',   val: paytour.reservationStatus.pending,   color: 'text-yellow-600' },
          { label: 'Canceladas',  val: paytour.reservationStatus.cancelled, color: 'text-red-500' },
        ].map(({ label, val, color }) => (
          <div key={label} className="flex-1 text-center">
            <p className="text-[9px] text-gray-400 uppercase">{label}</p>
            <p className={clsx('text-sm font-bold', color)}>{val}</p>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  // ── Bloco: Última avaliação Google ────────────────────────────────────────
  const blocoAvaliacao = google?.recentReviews?.[0] ? (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">⭐ Última Avaliação</p>
        <span className="text-[10px] text-yellow-500 font-bold">
          {'★'.repeat(google.recentReviews[0].rating)}{'☆'.repeat(5 - google.recentReviews[0].rating)}
        </span>
      </div>
      <p className="text-[11px] text-gray-700 dark:text-gray-300 line-clamp-2 italic">"{google.recentReviews[0].text}"</p>
      <p className="text-[10px] text-gray-400 mt-1">— {google.recentReviews[0].author}</p>
    </div>
  ) : null;

  // ── Bloco: Satisfação ─────────────────────────────────────────────────────
  const blocoSatisfacao = (() => {
    const surveyNPS    = survey?.npsScore ?? null;
    const surveyVol    = survey?.totalResponses ?? 0;
    const googleRating = google?.averageRating ?? null;
    const googleVol    = google?.totalReviews ?? 0;
    const googleNPS    = googleRating !== null ? Math.round((googleRating - 3) / 2 * 100) : null;
    const totalVol     = (surveyNPS !== null ? surveyVol : 0) + (googleNPS !== null ? googleVol : 0);
    const combined     = totalVol > 0
      ? Math.round(
          ((surveyNPS ?? 0) * (surveyNPS !== null ? surveyVol : 0) +
           (googleNPS ?? 0) * (googleNPS !== null ? googleVol : 0)) / totalVol
        )
      : null;
    const loading = smL || gL;
    const color   = combined === null ? 'gray' : combined >= 50 ? 'green' : combined >= 0 ? 'orange' : 'red';
    const label   = combined === null ? '—' : combined >= 50 ? 'Excelente' : combined >= 0 ? 'Bom' : 'Atenção';

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Satisfação &amp; Reputação</h2>

        <div className={clsx(
          'rounded-xl p-3 flex items-center justify-between',
          color === 'green'  && 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800',
          color === 'orange' && 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800',
          color === 'red'    && 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
          color === 'gray'   && 'bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700',
        )}>
          <div>
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Satisfação Geral</p>
              <InfoTooltip text="Média ponderada entre o NPS da pesquisa interna e a nota do Google (convertida para a mesma escala de -100 a +100). Quanto maior o número, melhor a percepção geral dos clientes." />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Survey + Google · {fmtN(totalVol)} votos</p>
          </div>
          {loading
            ? <div className="h-8 w-16 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            : <div className="text-right">
                <p className={clsx('text-2xl font-bold',
                  color === 'green'  && 'text-green-600 dark:text-green-400',
                  color === 'orange' && 'text-yellow-600 dark:text-yellow-400',
                  color === 'red'    && 'text-red-600 dark:text-red-400',
                  color === 'gray'   && 'text-gray-400',
                )}>{combined ?? '—'}</p>
                <p className={clsx('text-[10px] font-medium',
                  color === 'green'  && 'text-green-500',
                  color === 'orange' && 'text-yellow-500',
                  color === 'red'    && 'text-red-500',
                  color === 'gray'   && 'text-gray-400',
                )}>{label}</p>
              </div>
          }
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniKPI icon={<Target size={14} />} label="NPS Score" value={survey ? String(survey.npsScore) : '—'} sub="Pesquisa interna" color="green" loading={smL}
            info="Net Promoter Score da pesquisa interna. Vai de -100 a +100. Acima de 50 é considerado Excelente. Calculado como % Promotores (nota 4-5) menos % Detratores (nota 1-2)." />
          <MiniKPI icon={<Star size={14} />} label="Nota Google" value={google ? `${google.averageRating} ★` : '—'} sub={google ? `${fmtN(google.totalReviews)} avaliações` : undefined} color="orange" loading={gL}
            info="Média das avaliações públicas no Google Maps. Escala de 1 a 5 estrelas. Nota acima de 4.5 coloca o negócio no top 10% da categoria." />
          <MiniKPI icon={<Smile size={14} />} label="Promotores" value={survey ? `${survey.promoters}%` : '—'} sub="NPS Survey" color="purple" loading={smL}
            info="Percentual de clientes que deram nota 4 ou 5 na pesquisa. São os mais propensos a indicar o Hibiscus para amigos e família." />
          <MiniKPI icon={<MessageSquare size={14} />} label="Sem Resposta" value={google ? String(google.unansweredCount) : '—'} sub="Google" color="brand" loading={gL}
            info="Quantidade de avaliações do Google que ainda não receberam resposta da equipe. Responder avaliações (positivas e negativas) melhora o posicionamento no Google e demonstra cuidado com o cliente." />
        </div>
      </div>
    );
  })();

  // ── Bloco: Ocupação ───────────────────────────────────────────────────────
  const blocoOcupacao = (() => {
    const so = sheetOcc;
    const updatedAt = so?.timestamp
      ? new Date(so.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const loungesFull = occupancy.lounges.filter(v => v >= SPACE_CONFIGS.lounge.max).length;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-gray-500" />
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ocupação Atual</h3>
          </div>
          <a href="/ocupacao" className="text-[10px] text-brand-600 hover:underline">detalhes →</a>
        </div>

        {so ? (
          <>
            {/* Portaria + Na Casa + GAP */}
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-slate-400 dark:border-slate-500 rounded-lg p-2 text-center">
                <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">🚪 Portaria</p>
                <p className="text-xl font-black text-slate-800 dark:text-slate-100">{so.portaria}</p>
              </div>
              <div className="border border-brand-400 rounded-lg p-2 text-center">
                <p className="text-[9px] text-brand-500 dark:text-brand-300 uppercase tracking-wider">👥 Na Casa</p>
                <p className="text-xl font-black text-brand-700 dark:text-brand-200">{so.total}</p>
              </div>
              <div className={clsx('rounded-lg p-2 text-center border', so.gap >= 0 ? 'border-emerald-400' : 'border-red-400')}>
                <p className={clsx('text-[9px] uppercase tracking-wider', so.gap >= 0 ? 'text-emerald-500' : 'text-red-500')}>⚡ GAP</p>
                <p className={clsx('text-xl font-black', so.gap >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{so.gap}</p>
              </div>
            </div>

            {/* Beach / Lounge / Condomínio */}
            <div className="flex flex-col gap-1.5">
              <OccupancyRow label="🏖️ Beach"      current={so.beach}      max={SHEET_CAPS.beach} />
              <OccupancyRow label="🛋️ Lounge"     current={so.lounge}     max={SHEET_CAPS.lounge} />
              <OccupancyRow label="🏢 Condomínio"  current={so.condominio} max={SHEET_CAPS.condominio} />
            </div>

            {updatedAt && (
              <p className="text-[9px] text-gray-400 text-right">
                {!so.isToday && <span className="text-orange-400">({so.date}) </span>}
                Atualizado às {updatedAt}
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <OccupancyRow label="🏖️ Beach" current={occupancy.beach} max={SPACE_CONFIGS.beach.max} />
            <OccupancyRow label="🛋️ Lounges" current={occupancy.lounges.reduce((a,b)=>a+b,0)} max={SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count} />
            <OccupancyRow label="💎 Prime" current={occupancy.prime} max={SPACE_CONFIGS.prime.max} />
          </div>
        )}

        <LoungeMap lounges={occupancy.lounges} />
        {loungesFull > 0 && (
          <p className="text-xs text-red-600 font-semibold text-right">
            {loungesFull} lounge{loungesFull > 1 ? 's' : ''} cheio{loungesFull > 1 ? 's' : ''}
          </p>
        )}
      </div>
    );
  })();

  // ── Dados de satisfação (compartilhado entre mobile e desktop) ──────────────
  const surveyNPS    = survey?.npsScore ?? null;
  const surveyVol    = survey?.totalResponses ?? 0;
  const googleRating = google?.averageRating ?? null;
  const googleVol    = google?.totalReviews ?? 0;
  const googleNPS    = googleRating !== null ? Math.round((googleRating - 3) / 2 * 100) : null;
  const totalVol     = (surveyNPS !== null ? surveyVol : 0) + (googleNPS !== null ? googleVol : 0);
  const combined     = totalVol > 0
    ? Math.round(
        ((surveyNPS ?? 0) * (surveyNPS !== null ? surveyVol : 0) +
         (googleNPS ?? 0) * (googleNPS !== null ? googleVol : 0)) / totalVol
      )
    : null;
  const satColor = combined === null ? 'gray' : combined >= 50 ? 'green' : combined >= 0 ? 'orange' : 'red';
  const satLabel = combined === null ? '—' : combined >= 50 ? 'Excelente' : combined >= 0 ? 'Bom' : 'Atenção';

  // ── Resumo de ocupação ────────────────────────────────────────────────────
  const occTotal      = occupancy.beach + occupancy.lounges.reduce((a, b) => a + b, 0) + occupancy.prime;
  const occMax        = SPACE_CONFIGS.beach.max + SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count + SPACE_CONFIGS.prime.max;
  const loungesFull   = occupancy.lounges.filter(v => v >= SPACE_CONFIGS.lounge.max).length;

  return (
    <>
      {/* ── MOBILE: layout compacto estático ─────────────────────────────── */}
      <div className="lg:hidden overflow-y-auto p-3 flex flex-col gap-2.5 pb-4">

        {/* Ao Vivo */}
        <div className="bg-gradient-to-r from-brand-700 to-brand-900 rounded-xl p-3 text-white shadow">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Ao vivo — Hoje</span>
            {ptL && <span className="text-[9px] opacity-50 animate-pulse ml-auto">Carregando...</span>}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'Receita',    val: paytour ? `R$ ${fmtN(Math.round(paytour.todayRevenue))}` : '—' },
              { label: 'Atividades', val: paytour ? fmtN(paytour.todayItems) : '—' },
              { label: 'Reservas',   val: paytour ? fmtN(paytour.todayOrders) : '—' },
              { label: 'Ticket',     val: paytour && paytour.todayOrders > 0 ? `R$ ${fmtN(Math.round(paytour.todayRevenue / paytour.todayOrders))}` : '—' },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/10 rounded-lg px-2 py-1.5">
                <p className="text-[8px] opacity-60 leading-none mb-0.5">{label}</p>
                {ptL
                  ? <div className="h-4 w-full bg-white/20 rounded animate-pulse" />
                  : <p className="text-xs font-bold leading-tight truncate">{val}</p>
                }
              </div>
            ))}
          </div>
        </div>

        {/* Já Vendido + Ocupação lado a lado */}
        <div className="grid grid-cols-2 gap-2.5">

          {/* Já Vendido */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-1 mb-1.5">
              <Target size={11} className="text-brand-600 shrink-0" />
              <p className="text-[9px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide leading-tight">
                Já vendido<br />{monthName(1).split(' ')[0]}
              </p>
            </div>
            {nextMonthL
              ? <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
              : nextMonth
                ? (
                  <div className="flex flex-col gap-0.5">
                    <div>
                      <p className="text-[8px] text-gray-400">Receita</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">R${fmtN(Math.round(nextMonth.revenue))}</p>
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      <div>
                        <p className="text-[8px] text-gray-400">Pedidos</p>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{fmtN(nextMonth.pedidos)}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-gray-400">Ativ.</p>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{fmtN(nextMonth.atividades)}</p>
                      </div>
                    </div>
                  </div>
                )
                : <p className="text-[10px] text-gray-400">—</p>
            }
          </div>

          {/* Satisfação compacta */}
          <div className={clsx(
            'rounded-xl p-3 border flex flex-col justify-between',
            satColor === 'green'  && 'bg-green-50 dark:bg-green-900/20 border-green-200',
            satColor === 'orange' && 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200',
            satColor === 'red'    && 'bg-red-50 dark:bg-red-900/20 border-red-200',
            satColor === 'gray'   && 'bg-gray-50 dark:bg-gray-700/30 border-gray-200',
          )}>
            <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">Satisfação</p>
            <div>
              {(smL || gL)
                ? <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
                : <p className={clsx('text-2xl font-bold',
                    satColor === 'green'  && 'text-green-600',
                    satColor === 'orange' && 'text-yellow-600',
                    satColor === 'red'    && 'text-red-600',
                    satColor === 'gray'   && 'text-gray-400',
                  )}>{combined ?? '—'}</p>
              }
              <p className="text-[9px] text-gray-400 mt-0.5">
                {google ? `${google.averageRating}★ Google` : ''}{survey && google ? ' · ' : ''}{survey ? `NPS ${survey.npsScore}` : ''}
              </p>
            </div>
            <p className={clsx('text-[10px] font-semibold',
              satColor === 'green'  && 'text-green-600',
              satColor === 'orange' && 'text-yellow-600',
              satColor === 'red'    && 'text-red-600',
              satColor === 'gray'   && 'text-gray-400',
            )}>{satLabel}</p>
          </div>
        </div>

        {/* Ocupação compacta */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Users size={11} className="text-gray-400" />
              <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">Ocupação Atual</p>
            </div>
            <a href="/ocupacao" className="text-[9px] text-brand-600">detalhes →</a>
          </div>

          {sheetOcc ? (
            <>
              {/* Portaria / Na Casa / GAP — planilha ao vivo */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="border border-slate-400 dark:border-slate-500 rounded-lg p-1.5 text-center">
                  <p className="text-[8px] text-slate-500 dark:text-slate-400">🚪 Portaria</p>
                  <p className="text-lg font-black text-slate-800 dark:text-slate-100 leading-tight">{sheetOcc.portaria}</p>
                </div>
                <div className="border border-brand-400 rounded-lg p-1.5 text-center">
                  <p className="text-[8px] text-brand-500 dark:text-brand-300">👥 Na Casa</p>
                  <p className="text-lg font-black text-brand-700 dark:text-brand-200 leading-tight">{sheetOcc.total}</p>
                </div>
                <div className={clsx('rounded-lg p-1.5 text-center border', sheetOcc.gap >= 0 ? 'border-emerald-400' : 'border-red-400')}>
                  <p className={clsx('text-[8px]', sheetOcc.gap >= 0 ? 'text-emerald-500' : 'text-red-500')}>⚡ GAP</p>
                  <p className={clsx('text-lg font-black leading-tight', sheetOcc.gap >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{sheetOcc.gap}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <OccupancyRow label="🏖️ Beach"     current={sheetOcc.beach}      max={SHEET_CAPS.beach} />
                <OccupancyRow label="🛋️ Lounge"    current={sheetOcc.lounge}     max={SHEET_CAPS.lounge} />
                <OccupancyRow label="🏢 Condomínio" current={sheetOcc.condominio} max={SHEET_CAPS.condominio} />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <OccupancyRow label="🏖️ Beach" current={occupancy.beach} max={SPACE_CONFIGS.beach.max} />
              <OccupancyRow label="🛋️ Lounges" current={occupancy.lounges.reduce((a, b) => a + b, 0)} max={SPACE_CONFIGS.lounge.max * SPACE_CONFIGS.lounge.count} />
              <OccupancyRow label="💎 Prime" current={occupancy.prime} max={SPACE_CONFIGS.prime.max} />
            </div>
          )}

          <LoungeMapMini lounges={occupancy.lounges} />
          {loungesFull > 0 && <span className="text-[10px] text-red-600 font-semibold text-right">{loungesFull} lounge{loungesFull > 1 ? 's' : ''} cheio{loungesFull > 1 ? 's' : ''}</span>}
        </div>

        {/* Resumo do período compacto */}
        {paytour && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Resumo do Período</p>
            <div className="grid grid-cols-4 gap-1 text-center">
              {[
                { l: 'Receita',   v: `R$${fmtN(Math.round(paytour.totalRevenue))}` },
                { l: 'Pedidos',   v: fmtN(paytour.totalSales) },
                { l: 'Ativid.',   v: fmtN(paytour.totalItems) },
                { l: 'Ticket',    v: `R$${fmtN(Math.round(paytour.averageTicket))}` },
              ].map(({ l, v }) => (
                <div key={l}>
                  <p className="text-[8px] text-gray-400">{l}</p>
                  <p className="text-[11px] font-bold text-gray-900 dark:text-white truncate">{v}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── DESKTOP: grid ───────────────────────────────────────────────── */}
      <div className="hidden lg:flex p-4 h-full overflow-hidden flex-col gap-3">
        {blocoAoVivo}

        <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
          {/* Coluna 1: Resumo */}
          <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
            {blocoResumo}
          </div>

          {/* Coluna 2: Já Vendido + Top + Avaliação + Satisfação */}
          <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
            {blocoJaVendido}
            {blocoTopProduto}
            {blocoAvaliacao}
            {blocoSatisfacao}
          </div>

          {/* Coluna 3: Ocupação */}
          <div className="min-h-0 overflow-y-auto">
            {blocoOcupacao}
          </div>
        </div>
      </div>
    </>
  );
}
