import { useState, useMemo } from 'react';
import { useSurveyMonkey } from '../hooks/useSurveyMonkey';
import { clearSheetsCache } from '../services/googleSheets';
import { Period } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertCircle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface SatisfactionProps { period: Period }

// ── NPS Gauge ─────────────────────────────────────────────────────────────────
function NPSGauge({ score }: { score: number }) {
  const color = score >= 50 ? '#22c55e' : score >= 0 ? '#f59e0b' : '#ef4444';
  const label = score >= 50 ? 'Excelente' : score >= 0 ? 'Bom' : 'Necessita Atenção';
  const pct   = ((score + 100) / 200) * 100;
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative w-48 h-6 bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 rounded-full overflow-hidden">
        <div
          className="absolute top-0 bottom-0 w-3 bg-white border-2 border-gray-700 rounded-full shadow transition-all duration-700"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <div className="text-5xl font-bold" style={{ color }}>{score}</div>
      <div className="text-sm font-medium" style={{ color }}>{label}</div>
      <div className="text-xs text-gray-400">Escala: -100 (pior) a +100 (melhor)</div>
    </div>
  );
}

// ── Insights engine ───────────────────────────────────────────────────────────
function generateInsight(text: string, score: number): string {
  const t = text.toLowerCase();

  if (score <= 3) {
    if (t.includes('cancel') || t.includes('reembolso') || t.includes('devolução'))
      return '💡 Verificar histórico do pedido e agilizar reembolso — resposta em até 24h evita escalada.';
    if (t.includes('cobrança') || t.includes('cobrado') || t.includes('cobranças') || t.includes('indevid'))
      return '💡 Revisar extrato do cliente e corrigir cobranças indevidas — contato proativo reduz chargeback.';
    if (t.includes('demora') || t.includes('esperou') || t.includes('fila') || t.includes('lento'))
      return '💡 Revisar fluxo de atendimento para reduzir tempo de espera nos horários de pico.';
    if (t.includes('comunicaç') || t.includes('aviso') || t.includes('informado') || t.includes('informação'))
      return '💡 Melhorar comunicação proativa via WhatsApp/SMS — cliente não foi informado a tempo.';
    if (t.includes('estrutura') || t.includes('manutenção') || t.includes('banheiro') || t.includes('limpeza'))
      return '💡 Acionar equipe de manutenção e revisar checklist de abertura diária.';
    if (t.includes('preço') || t.includes('caro') || t.includes('valor') || t.includes('custo'))
      return '💡 Avaliar percepção de valor — considerar pacotes ou combos que justifiquem o preço.';
    return '💡 Entrar em contato com o cliente para entender e resolver — respostas rápidas aumentam a chance de reversão para promotor.';
  }

  if (score === 4) {
    if (t.includes('estacionamento') || t.includes('vagas') || t.includes('parcar'))
      return '💡 Avaliar convênio com estacionamento próximo, especialmente para fins de semana.';
    if (t.includes('drink') || t.includes('bebida') || t.includes('cardápio') || t.includes('opções'))
      return '💡 Ampliar opções do cardápio — pode aumentar ticket médio e satisfação.';
    if (t.includes('cheio') || t.includes('lotado') || t.includes('multid') || t.includes('movimento'))
      return '💡 Considerar sistema de reserva por horário para diluir pico de ocupação.';
    if (t.includes('barulho') || t.includes('música') || t.includes('ruído') || t.includes('barulhento'))
      return '💡 Criar área tranquila para clientes que preferem menos agitação.';
    if (t.includes('criança') || t.includes('kids') || t.includes('família'))
      return '💡 Atividades kids podem converter famílias neutras em promotoras.';
    return '💡 Cliente próximo de promotor — um contato personalizado ou mimo pode converter para nota 5.';
  }

  // Promotors (score 5)
  if (t.includes('google') || t.includes('trip') || t.includes('instagram') || t.includes('indicar'))
    return '⭐ Cliente menciona redes sociais — enviar link direto do Google Maps para avaliação.';
  if (t.includes('voltarei') || t.includes('voltar') || t.includes('retorn') || t.includes('próxima'))
    return '⭐ Cliente quer voltar — ótimo momento para oferecer desconto fidelidade ou clube de assinatura.';
  return '⭐ Promotor ativo — solicitar avaliação no Google Maps via QR code ou mensagem personalizada.';
}

// ── Styles ────────────────────────────────────────────────────────────────────
const sentimentStyle: Record<string, string> = {
  positive: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  negative: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  neutral:  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};
const sentimentLabel: Record<string, string> = {
  positive: 'Promotor', negative: 'Detrator', neutral: 'Neutro',
};
const scoreColor = (s: number) =>
  s === 5 ? 'bg-green-500' : s === 4 ? 'bg-yellow-400' : 'bg-red-500';

type FilterTab = 'all' | 'positive' | 'neutral' | 'negative';

const filterTabs: { value: FilterTab; label: string; color: string }[] = [
  { value: 'all',      label: 'Todos',      color: 'bg-brand-600' },
  { value: 'positive', label: 'Promotores', color: 'bg-green-500' },
  { value: 'neutral',  label: 'Neutros',    color: 'bg-yellow-400' },
  { value: 'negative', label: 'Detratores', color: 'bg-red-500'   },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export function Satisfaction({ period }: SatisfactionProps) {
  const { data, loading, error } = useSurveyMonkey(period);
  const [activeFilter, setActiveFilter]     = useState<FilterTab>('all');
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [retrying, setRetrying]             = useState(false);

  const distribution = useMemo(() => data
    ? [
        { label: 'Promotores', pct: data.promoters,  color: '#22c55e' },
        { label: 'Neutros',    pct: data.neutrals,   color: '#f59e0b' },
        { label: 'Detratores', pct: data.detractors, color: '#ef4444' },
      ]
    : [], [data]);

  const allResponses = useMemo(() => data?.recentResponses ?? [], [data]);
  const periodTotal  = data?.surveys[0]?.responses ?? 0;

  const filtered = useMemo(() =>
    activeFilter === 'all'
      ? allResponses
      : allResponses.filter((r) => r.sentiment === activeFilter),
    [allResponses, activeFilter]);

  const counts = useMemo(() => ({
    all:      allResponses.length,
    positive: allResponses.filter((r) => r.sentiment === 'positive').length,
    neutral:  allResponses.filter((r) => r.sentiment === 'neutral').length,
    negative: allResponses.filter((r) => r.sentiment === 'negative').length,
  }), [allResponses]);

  function handleRetry() {
    setRetrying(true);
    clearSheetsCache();
    // Force re-render; the hook will re-fetch after cache is cleared
    setTimeout(() => setRetrying(false), 300);
  }

  function toggleInsight(id: string) {
    setExpandedInsights((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Satisfação — Pesquisa Hibiscus</h2>

      {/* ── Error banner ── */}
      {error && !loading && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Erro ao carregar satisfação</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5 break-words">{error}</p>
          </div>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-800/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/60 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={clsx(retrying && 'animate-spin')} />
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Row 1: NPS + Distribuição ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">NPS Score</h3>
          {loading ? <div className="h-40 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
            <>
              <NPSGauge score={data?.npsScore ?? 0} />
              <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs border-t border-gray-100 dark:border-gray-700 pt-3">
                <div>
                  <div className="text-xl font-bold text-green-600">{data?.promoters}%</div>
                  <div className="text-gray-500">Promotores</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-yellow-500">{data?.neutrals}%</div>
                  <div className="text-gray-500">Neutros</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-red-500">{data?.detractors}%</div>
                  <div className="text-gray-500">Detratores</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Distribuição de Respostas</h3>
          {loading ? <div className="h-40 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
            <div className="space-y-4 mt-2">
              {distribution.map((d) => (
                <div key={d.label} className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                    <span>{d.label}</span><span>{d.pct}%</span>
                  </div>
                  <div className="h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${d.pct}%`, background: d.color }} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-400 pt-1">
                {periodTotal.toLocaleString('pt-BR')} respostas no período · {data?.totalResponses.toLocaleString('pt-BR')} total na planilha
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Histórico NPS ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Evolução do NPS</h3>
        <p className="text-xs text-gray-400 mb-4">Score diário no período selecionado</p>
        {loading ? <div className="h-48 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
          <ResponsiveContainer width="100%" height={192}>
            <LineChart data={data?.npsHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis domain={[-100, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="score" name="NPS" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: '#22c55e', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Row 3: Respostas com filtro e insights ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Respostas dos Clientes</h3>

          {/* Filter tabs */}
          {!loading && (
            <div className="flex gap-1.5 flex-wrap">
              {filterTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveFilter(tab.value)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
                    activeFilter === tab.value
                      ? `${tab.color} text-white shadow-sm`
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                  )}
                >
                  {tab.label}
                  <span className={clsx(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                    activeFilter === tab.value ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600',
                  )}>
                    {counts[tab.value]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}</div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma resposta nesta categoria para o período selecionado.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const insight        = generateInsight(r.text, r.score);
              const insightExpanded = expandedInsights.has(r.id);
              return (
                <div key={r.id} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                  {/* Response row */}
                  <div className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-700/50">
                    {/* Score badge */}
                    <div className={clsx(
                      'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white',
                      scoreColor(r.score),
                    )}>
                      {r.score}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 dark:text-gray-300">{r.text}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', sentimentStyle[r.sentiment])}>
                          {sentimentLabel[r.sentiment]}
                        </span>
                        <span className="text-xs text-gray-400">{r.date}</span>
                      </div>
                    </div>
                    {/* Toggle insight */}
                    <button
                      onClick={() => toggleInsight(r.id)}
                      className={clsx(
                        'shrink-0 self-start mt-0.5 text-xs px-2 py-1 rounded-lg font-medium transition-colors',
                        insightExpanded
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-brand-100 dark:hover:bg-brand-900/30',
                      )}
                      title="Ver insight de resolução"
                    >
                      💡
                    </button>
                  </div>

                  {/* Insight panel */}
                  {insightExpanded && (
                    <div className="px-4 py-3 bg-brand-50 dark:bg-brand-900/20 border-t border-brand-100 dark:border-brand-800">
                      <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 mb-1">Sugestão de ação</p>
                      <p className="text-sm text-brand-800 dark:text-brand-200">{insight}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Row 4: Pesquisas ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Pesquisas Ativas</h3>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 1 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}</div>
        ) : (
          <div className="space-y-2">
            {data?.surveys.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.name}</span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{s.responses} respostas</span>
                  <span className="text-xs text-gray-400 block">Taxa: {s.rate}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
