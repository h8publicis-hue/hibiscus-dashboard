import { useState, useMemo, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import { useSurveyMonkey } from '../hooks/useSurveyMonkey';
import { clearSheetsCache } from '../services/googleSheets';
import { Period, RecentResponse } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp, Tag, User, Mail, FileDown, CheckSquare, Square } from 'lucide-react';
import clsx from 'clsx';

interface SatisfactionProps { period: Period }

// ── NPS Gauge ─────────────────────────────────────────────────────────────────
function NPSGauge({ score }: { score: number }) {
  const color = score >= 50 ? '#22c55e' : score >= 0 ? '#f59e0b' : '#ef4444';
  const label = score >= 50 ? 'Excelente' : score >= 0 ? 'Bom' : 'Necessita Atenção';
  const pct   = ((score + 100) / 200) * 100;
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <div className="relative w-40 h-5 bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 rounded-full overflow-hidden">
        <div
          className="absolute top-0 bottom-0 w-3 bg-white border-2 border-gray-700 rounded-full shadow transition-all duration-700"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <div className="text-4xl font-bold" style={{ color }}>{score}</div>
      <div className="text-xs font-medium" style={{ color }}>{label}</div>
    </div>
  );
}

// ── Insights engine ───────────────────────────────────────────────────────────
function generateInsight(text: string, score: number): string {
  const t = text.toLowerCase();

  if (score <= 2) {
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

  if (score === 3) {
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
  s >= 4 ? 'bg-green-500' : s === 3 ? 'bg-yellow-400' : 'bg-red-500';

type FilterTab = 'all' | 'positive' | 'neutral' | 'negative';

const filterTabs: { value: FilterTab; label: string; color: string }[] = [
  { value: 'all',      label: 'Todos',      color: 'bg-brand-600' },
  { value: 'positive', label: 'Promotores', color: 'bg-green-500' },
  { value: 'neutral',  label: 'Neutros',    color: 'bg-yellow-400' },
  { value: 'negative', label: 'Detratores', color: 'bg-red-500'   },
];

// ── PDF export ────────────────────────────────────────────────────────────────
function periodLabel(period: string): string {
  if (period === 'today') return 'Hoje';
  if (period === '7d')    return 'Últimos 7 dias';
  if (period === '30d')   return 'Últimos 30 dias';
  if (period === '90d')   return 'Últimos 90 dias';
  if (period === 'month') {
    const n = new Date();
    return n.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
  if (period.startsWith('custom:')) {
    const [, from, to] = period.split(':');
    const fmt = (d: string) =>
      new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${fmt(from)} – ${fmt(to)}`;
  }
  return period;
}


function exportToPDF(
  selected: RecentResponse[],
  period: string,
  npsScore: number,
  promoters: number,
  neutrals: number,
  detractors: number,
  totalPeriod: number,
) {
  const doc  = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W    = 210;
  const ML   = 14;
  const MR   = 14;
  const CW   = W - ML - MR;
  const now  = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // ── helpers ───────────────────────────────────────────────────────────────
  const hex = (h: string) => {
    const r = parseInt(h.slice(1,3),16);
    const g = parseInt(h.slice(3,5),16);
    const b = parseInt(h.slice(5,7),16);
    return [r,g,b] as [number,number,number];
  };

  // Wrap text and return lines
  const wrap = (text: string, maxW: number, size: number): string[] => {
    doc.setFontSize(size);
    return doc.splitTextToSize(text, maxW);
  };

  let y = 14;

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  // Barra roxa no topo
  doc.setFillColor(...hex('#7c3aed'));
  doc.rect(0, 0, W, 2, 'F');

  // Título
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hex('#7c3aed'));
  doc.text('Hibiscus Beach Club', ML, y + 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...hex('#6b7280'));
  doc.text('Relatório de Avaliações de Clientes', ML, y + 16);

  // Data e período (direita)
  doc.setFontSize(8);
  doc.setTextColor(...hex('#9ca3af'));
  doc.text(`Gerado em ${now}`, W - MR, y + 10, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hex('#374151'));
  doc.text(`Período: ${periodLabel(period)}`, W - MR, y + 16, { align: 'right' });

  y += 24;

  // Linha separadora
  doc.setDrawColor(...hex('#e5e7eb'));
  doc.setLineWidth(0.4);
  doc.line(ML, y, W - MR, y);
  y += 6;

  // ── Cards de resumo NPS ───────────────────────────────────────────────────
  const statCards = [
    { label: 'NPS Score',          value: String(npsScore),    bg: '#f5f3ff', color: npsScore >= 50 ? '#16a34a' : npsScore >= 0 ? '#d97706' : '#dc2626' },
    { label: 'Promotores',         value: `${promoters}%`,     bg: '#f0fdf4', color: '#16a34a' },
    { label: 'Neutros',            value: `${neutrals}%`,      bg: '#fefce8', color: '#ca8a04' },
    { label: 'Detratores',         value: `${detractors}%`,    bg: '#fef2f2', color: '#dc2626' },
    { label: 'Respostas período',  value: String(totalPeriod), bg: '#f9fafb', color: '#374151' },
  ];

  const cardW = (CW - 4 * 3) / 5;
  statCards.forEach((c, i) => {
    const cx = ML + i * (cardW + 3);
    doc.setFillColor(...hex(c.bg));
    doc.roundedRect(cx, y, cardW, 18, 2, 2, 'F');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hex(c.color));
    doc.text(c.value, cx + cardW / 2, y + 9, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hex('#6b7280'));
    doc.text(c.label, cx + cardW / 2, y + 15, { align: 'center' });
  });

  y += 24;

  // Subtítulo da lista
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hex('#374151'));
  doc.text(
    `${selected.length} avaliação${selected.length !== 1 ? 'ões' : ''} selecionada${selected.length !== 1 ? 's' : ''}`,
    ML, y,
  );
  y += 6;

  // ── Cards de avaliação ────────────────────────────────────────────────────
  const sentColors: Record<string, string> = {
    positive: '#16a34a', negative: '#dc2626', neutral: '#4b5563',
  };
  const sentBg: Record<string, string> = {
    positive: '#dcfce7', negative: '#fee2e2', neutral: '#f3f4f6',
  };
  const sentLabels: Record<string, string> = {
    positive: 'Promotor', negative: 'Detrator', neutral: 'Neutro',
  };
  const scoreBg = (s: number) => s >= 4 ? '#22c55e' : s === 3 ? '#eab308' : '#ef4444';

  for (const r of selected) {
    const textLines = wrap(r.text || 'Sem comentário', CW - 22, 9);
    const cardH = 10 + textLines.length * 4.5 + 8;

    // Nova página se necessário
    if (y + cardH > 280) {
      doc.addPage();
      y = 14;
    }

    // Fundo do card
    doc.setFillColor(...hex('#f9fafb'));
    doc.setDrawColor(...hex('#e5e7eb'));
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, cardH, 2, 2, 'FD');

    // Círculo da nota
    doc.setFillColor(...hex(scoreBg(r.score)));
    doc.circle(ML + 6, y + 6, 4.5, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(String(r.score), ML + 6, y + 7.5, { align: 'center' });

    // Texto da avaliação
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hex('#374151'));
    doc.text(textLines, ML + 14, y + 5);

    // Badge sentimento
    const badgeY = y + textLines.length * 4.5 + 5;
    const badgeW = 18;
    doc.setFillColor(...hex(sentBg[r.sentiment]));
    doc.roundedRect(ML + 14, badgeY - 3.5, badgeW, 5, 1, 1, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hex(sentColors[r.sentiment]));
    doc.text(sentLabels[r.sentiment], ML + 14 + badgeW / 2, badgeY, { align: 'center' });

    // Data
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hex('#9ca3af'));
    doc.text(r.date, ML + 36, badgeY);

    // Pulseira
    if (r.pulseira) {
      doc.setTextColor(...hex('#7c3aed'));
      doc.setFont('helvetica', 'bold');
      doc.text(`#${r.pulseira}`, ML + 60, badgeY);
    }

    // Nome / email
    let extraX = r.pulseira ? ML + 75 : ML + 60;
    if (r.nome) {
      doc.setTextColor(...hex('#6b7280'));
      doc.setFont('helvetica', 'normal');
      doc.text(r.nome, extraX, badgeY);
      extraX += doc.getTextWidth(r.nome) + 4;
    }
    if (r.email) {
      doc.setTextColor(...hex('#6b7280'));
      doc.setFont('helvetica', 'normal');
      doc.text(r.email, extraX, badgeY);
    }

    y += cardH + 3;
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hex('#9ca3af'));
    doc.text(
      `Hibiscus Beach Club · Dashboard Integrado · ${now}  |  Pág. ${p}/${pageCount}`,
      W / 2, 293, { align: 'center' },
    );
    doc.setDrawColor(...hex('#e5e7eb'));
    doc.setLineWidth(0.3);
    doc.line(ML, 290, W - MR, 290);
  }

  const filename = `avaliacoes-hibiscus-${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(filename);
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function Satisfaction({ period }: SatisfactionProps) {
  const { data, loading, error } = useSurveyMonkey(period);
  const [activeFilter, setActiveFilter]         = useState<FilterTab>('all');
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails]   = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set());
  const [retrying, setRetrying]                 = useState(false);

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

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  function handleRetry() {
    setRetrying(true);
    clearSheetsCache();
    setTimeout(() => setRetrying(false), 300);
  }

  function toggleInsight(id: string) {
    setExpandedInsights((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleDetails(id: string) {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }

  function handleExportPDF() {
    const selected = allResponses.filter((r) => selectedIds.has(r.id));
    exportToPDF(
      selected,
      period,
      data?.npsScore ?? 0,
      data?.promoters ?? 0,
      data?.neutrals ?? 0,
      data?.detractors ?? 0,
      periodTotal,
    );
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="flex flex-col h-full">
      {/* ── Título ── */}
      <div className="px-6 pt-6 pb-3 shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Satisfação — Pesquisa Hibiscus</h2>
      </div>

      {/* ── Error banner ── */}
      {error && !loading && (
        <div className="mx-6 mb-3 shrink-0">
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
        </div>
      )}

      {/* ── Layout 2 colunas ── */}
      <div className="flex flex-1 min-h-0 gap-4 px-6 pb-6">

        {/* ── Coluna esquerda: métricas + gráfico + pesquisas ── */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* NPS Score */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">NPS Score</h3>
            {loading ? <div className="h-32 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
              <>
                <NPSGauge score={data?.npsScore ?? 0} />
                <div className="grid grid-cols-3 gap-1 mt-2 text-center text-xs border-t border-gray-100 dark:border-gray-700 pt-3">
                  <div>
                    <div className="text-lg font-bold text-green-600">{data?.promoters}%</div>
                    <div className="text-gray-400">Promotores</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-yellow-500">{data?.neutrals}%</div>
                    <div className="text-gray-400">Neutros</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-red-500">{data?.detractors}%</div>
                    <div className="text-gray-400">Detratores</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Distribuição */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Distribuição</h3>
            {loading ? <div className="h-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
              <div className="space-y-3">
                {distribution.map((d) => (
                  <div key={d.label} className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                      <span>{d.label}</span><span>{d.pct}%</span>
                    </div>
                    <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${d.pct}%`, background: d.color }} />
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-gray-400 pt-1">
                  {periodTotal.toLocaleString('pt-BR')} respostas no período · {data?.totalResponses.toLocaleString('pt-BR')} total
                </p>
              </div>
            )}
          </div>

          {/* Evolução NPS */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Evolução do NPS</h3>
            <p className="text-[10px] text-gray-400 mb-3">Score diário no período</p>
            {loading ? <div className="h-36 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
              <ResponsiveContainer width="100%" height={144}>
                <LineChart data={data?.npsHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                  <YAxis domain={[-100, 100]} tick={{ fontSize: 9 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" name="NPS" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pesquisas ativas */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Pesquisas Ativas</h3>
            {loading ? (
              <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
            ) : (
              <div className="space-y-2">
                {data?.surveys.map((s, i) => (
                  <div key={i} className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate pr-2">{s.name}</span>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">{s.responses}</span>
                        <span className="text-[10px] text-gray-400 block">Taxa: {s.rate}%</span>
                      </div>
                    </div>
                    {counts.all < s.responses && (
                      <div className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-600 flex justify-between text-[10px] text-gray-400">
                        <span>Com comentário</span>
                        <span className="font-medium text-gray-600 dark:text-gray-300">{counts.all}</span>
                      </div>
                    )}
                    {counts.all < s.responses && (
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                        <span>Só nota</span>
                        <span className="font-medium text-gray-600 dark:text-gray-300">{s.responses - counts.all}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Coluna direita: respostas com scroll próprio ── */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">

          {/* Header fixo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
            <div className="flex items-center gap-3">
              {/* Selecionar tudo */}
              {!loading && filtered.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  title={allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                >
                  {allFilteredSelected
                    ? <CheckSquare size={17} className="text-brand-600 dark:text-brand-400" />
                    : <Square size={17} />}
                </button>
              )}
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Respostas dos Clientes
                {!loading && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {counts[activeFilter]} com comentário
                    {activeFilter === 'all' && periodTotal > counts.all
                      ? ` · ${periodTotal - counts.all} só nota`
                      : ''}
                  </span>
                )}
              </h3>
            </div>
            {!loading && (
              <div className="flex items-center gap-2 flex-wrap">
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

                {/* Botão exportar — aparece ao lado dos filtros quando há seleção */}
                {selectedCount > 0 && (
                  <button
                    onClick={handleExportPDF}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-500 hover:bg-green-600 text-white shadow-sm transition-colors"
                  >
                    <FileDown size={13} />
                    Exportar PDF ({selectedCount})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Lista com scroll */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-16">
                Nenhuma resposta nesta categoria para o período selecionado.
              </p>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => {
                  const insight         = generateInsight(r.text, r.score);
                  const insightExpanded = expandedInsights.has(r.id);
                  const detailsOpen     = expandedDetails.has(r.id);
                  const isSelected      = selectedIds.has(r.id);
                  const hasClientData   = !!(r.pulseira || r.nome || r.email);
                  return (
                    <div
                      key={r.id}
                      className={clsx(
                        'rounded-xl border overflow-hidden transition-all',
                        isSelected
                          ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-300 dark:ring-brand-600'
                          : 'border-gray-100 dark:border-gray-700',
                      )}
                    >
                      {/* Linha principal */}
                      <div className={clsx('flex gap-3 p-3', isSelected ? 'bg-brand-50 dark:bg-brand-900/20' : 'bg-gray-50 dark:bg-gray-700/50')}>
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleSelect(r.id)}
                          className="shrink-0 self-start mt-0.5 text-gray-300 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
                          title={isSelected ? 'Desmarcar' : 'Selecionar para exportar'}
                        >
                          {isSelected
                            ? <CheckSquare size={16} className="text-brand-600 dark:text-brand-400" />
                            : <Square size={16} />}
                        </button>

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
                            {r.pulseira && (
                              <span className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 font-medium">
                                <Tag size={10} /> #{r.pulseira}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={() => toggleInsight(r.id)}
                            className={clsx(
                              'text-xs px-2 py-1 rounded-lg font-medium transition-colors',
                              insightExpanded
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-brand-100 dark:hover:bg-brand-900/30',
                            )}
                            title="Ver insight de resolução"
                          >
                            💡
                          </button>
                          <button
                            onClick={() => toggleDetails(r.id)}
                            className={clsx(
                              'flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-colors',
                              detailsOpen
                                ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-800'
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500',
                            )}
                            title="Ver dados do cliente"
                          >
                            {detailsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            <span>mais</span>
                          </button>
                        </div>
                      </div>

                      {/* Painel: dados do cliente */}
                      {detailsOpen && (
                        <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Dados do cliente</p>
                          <div className="flex flex-wrap gap-5">
                            {r.pulseira ? (
                              <div className="flex items-center gap-1.5">
                                <Tag size={13} className="text-brand-500 shrink-0" />
                                <div>
                                  <p className="text-[10px] text-gray-400">Pulseira</p>
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">#{r.pulseira}</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 opacity-40">
                                <Tag size={13} />
                                <p className="text-xs text-gray-400">Pulseira não informada</p>
                              </div>
                            )}
                            {r.nome && (
                              <div className="flex items-center gap-1.5">
                                <User size={13} className="text-gray-400 shrink-0" />
                                <div>
                                  <p className="text-[10px] text-gray-400">Nome</p>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{r.nome}</p>
                                </div>
                              </div>
                            )}
                            {r.email ? (
                              <div className="flex items-center gap-1.5">
                                <Mail size={13} className="text-gray-400 shrink-0" />
                                <div>
                                  <p className="text-[10px] text-gray-400">Email</p>
                                  <a href={`mailto:${r.email}`} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">{r.email}</a>
                                </div>
                              </div>
                            ) : null}
                            {!hasClientData && (
                              <p className="text-xs text-gray-400">Nenhum dado de contato disponível para esta resposta.</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Painel: insight */}
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
        </div>
      </div>

    </div>
  );
}
