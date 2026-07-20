import { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { FileDown, TrendingUp, Users, Bell, Smile, LayoutList } from 'lucide-react';
import clsx from 'clsx';
import { usePaytour }       from '../hooks/usePaytour';
import { useMonthRevenue }  from '../hooks/useMonthRevenue';
import { useReceitaABS }    from '../hooks/useReceitaABS';
import { useOccupancy }     from '../hooks/useOccupancy';
import { useCheckin }       from '../hooks/useCheckin';
import { useChamadas, parseTempoSec } from '../hooks/useChamadas';
import { useSurveyMonkey }  from '../hooks/useSurveyMonkey';
import { useGoogleBusiness } from '../hooks/useGoogleBusiness';
import { useGoals }         from '../hooks/useGoals';
import { SPACE_CONFIGS, OccupancyState, LOUNGE_INFO_EMPTY } from '../types';

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function hourBRT() {
  return parseInt(new Date().toLocaleTimeString('en-CA', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }), 10);
}

const EMPTY_OCC: OccupancyState = {
  beach: 0,
  lounges: Array(SPACE_CONFIGS.lounge.count).fill(0),
  prime: 0,
  parceiros: 0,
  colaboradores: 0,
  loungeObs: Array(SPACE_CONFIGS.lounge.count).fill(''),
  loungeData: Array(SPACE_CONFIGS.lounge.count).fill(null).map(() => ({ ...LOUNGE_INFO_EMPTY })),
};

function useHistoricoOcupacao(date: string, enabled: boolean): OccupancyState | null {
  const [hist, setHist] = useState<OccupancyState | null>(null);
  useEffect(() => {
    if (!enabled) { setHist(null); return; }
    fetch(`/api/ocupacao?action=historico&data=${date}`)
      .then(r => r.json())
      .then((j: any) => { if (j?.historico) setHist(j.historico as OccupancyState); })
      .catch(() => {});
  }, [date, enabled]);
  return hist;
}

function fmt(n: number | null | undefined, prefix = '') {
  if (n == null) return '—';
  return prefix + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtR(n: number | null | undefined) {
  if (n == null) return '—';
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const LOUNGE_START = SPACE_CONFIGS.lounge.start;
const LOUNGE_COUNT = SPACE_CONFIGS.lounge.count;

// ── Seção UI ─────────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
        <Icon size={16} className="text-brand-500" />
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white uppercase tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function KpiGrid({ items }: { items: { label: string; value: string; sub?: string; color?: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(({ label, value, sub, color }) => (
        <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</p>
          <p className={clsx('text-lg font-bold', color ?? 'text-gray-800 dark:text-white')}>{value}</p>
          {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Exportação PDF ────────────────────────────────────────────────────────────
async function gerarPDF(data: {
  dateLabel: string;
  receita: { hoje: number | null; mes: number | null; abs: number | null; meta: number; items: number | null; orders: number | null; ticket: number | null };
  ocupacao: { portaria: number; beach: number; loungesTotal: number; parceiros: number; checkins: number; reservados: number; pendentes: number };
  lounges: { num: number; pax: number; nome: string; canal: string; veiculo: string; parceiro: string }[];
  chamadas: { total: number; finalizadas: number; demoradas: number; mediaEspera: string; topSetores: [string, number][]; topGarcons: [string, number][] };
  satisfacao: { nps: number | null; arretados: number; oxente: number; putz: number; notaSurvey: number | null; totalSurvey: number; notaGoogle: number | null; semResposta: number };
}) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = 210, ML = 14, MR = 14, CW = W - ML - MR;
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const hex = (h: string): [number, number, number] => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const wrap = (text: string, maxW: number, size: number) => { doc.setFontSize(size); return doc.splitTextToSize(text, maxW); };

  let y = 14;

  // Logo
  let resolvedLogoW = 0;
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        const ratio = img.naturalWidth / img.naturalHeight;
        const maxW = 36;
        const logoW = Math.min(Math.round(ratio * 14), maxW);
        const logoH = Math.round(logoW / ratio);
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', ML, y + (14 - logoH) / 2 + 1, logoW, logoH, undefined, 'FAST');
        resolvedLogoW = logoW;
      } catch { /* sem logo */ }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = '/logo.png';
  });

  // Cabeçalho
  const tx = ML + resolvedLogoW + 4;
  doc.setFillColor(...hex('#7c3aed')); doc.rect(0, 0, W, 2, 'F');
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(...hex('#7c3aed'));
  doc.text('Hibiscus Beach Club', tx, y + 8);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...hex('#374151'));
  doc.text(`Fechamento do Dia — ${data.dateLabel}`, tx, y + 15);
  doc.setFontSize(8); doc.setTextColor(...hex('#9ca3af'));
  doc.text(`Gerado às ${now}`, W - MR, y + 8, { align: 'right' });
  y += 28;

  const sectionHeader = (title: string) => {
    doc.setFillColor(...hex('#f3f4f6')); doc.roundedRect(ML, y, CW, 7, 1, 1, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...hex('#374151'));
    doc.text(title, ML + 3, y + 5);
    y += 11;
  };

  const kpiRow = (items: { label: string; value: string }[]) => {
    const colW = CW / items.length;
    items.forEach(({ label, value }, i) => {
      const x = ML + i * colW;
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...hex('#6b7280'));
      doc.text(label.toUpperCase(), x, y);
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...hex('#111827'));
      doc.text(value, x, y + 6);
    });
    y += 14;
  };

  const addPageIfNeeded = (needed = 20) => {
    if (y + needed > 275) { doc.addPage(); y = 14; }
  };

  // 1. RECEITA
  sectionHeader('1. Receita do Dia');
  const pct = data.receita.meta > 0 && data.receita.mes != null ? Math.round((data.receita.mes / data.receita.meta) * 100) : null;
  kpiRow([
    { label: 'Receita hoje (Paytour)', value: fmtR(data.receita.hoje) },
    { label: 'Atividades vendidas',    value: fmt(data.receita.items) },
    { label: 'Reservas',               value: fmt(data.receita.orders) },
    { label: 'Ticket médio',           value: fmtR(data.receita.ticket) },
  ]);
  kpiRow([
    { label: 'Receita acum. mês',      value: fmtR(data.receita.mes) },
    { label: 'Meta mensal',            value: fmtR(data.receita.meta) },
    { label: '% Meta atingida',        value: pct != null ? `${pct}%` : '—' },
    { label: 'Receita A&BS',           value: fmtR(data.receita.abs) },
  ]);

  addPageIfNeeded();
  sectionHeader('2. Ocupação');
  const taxaCI = data.ocupacao.reservados > 0 ? Math.round((data.ocupacao.checkins / data.ocupacao.reservados) * 100) : 0;
  kpiRow([
    { label: 'Entradas Portaria', value: fmt(data.ocupacao.portaria) },
    { label: 'Pax Beach',         value: fmt(data.ocupacao.beach) },
    { label: 'Pax Lounges',       value: fmt(data.ocupacao.loungesTotal) },
    { label: 'Parceiros',         value: fmt(data.ocupacao.parceiros) },
  ]);
  kpiRow([
    { label: 'Check-ins realizados', value: fmt(data.ocupacao.checkins) },
    { label: 'Reservados',           value: fmt(data.ocupacao.reservados) },
    { label: 'Pendentes',            value: fmt(data.ocupacao.pendentes) },
    { label: 'Taxa check-in',        value: taxaCI ? `${taxaCI}%` : '—' },
  ]);

  addPageIfNeeded();
  sectionHeader('3. Atendimento (Chamadas)');
  kpiRow([
    { label: 'Total chamadas',    value: fmt(data.chamadas.total) },
    { label: 'Finalizadas',       value: fmt(data.chamadas.finalizadas) },
    { label: 'Demoradas (≥60s)', value: fmt(data.chamadas.demoradas) },
    { label: 'Tempo médio',       value: data.chamadas.mediaEspera },
  ]);
  const halfW = (CW - 6) / 2;
  if (data.chamadas.topSetores.length > 0 || data.chamadas.topGarcons.length > 0) {
    const colL = ML;
    const colR = ML + halfW + 6;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...hex('#374151'));
    if (data.chamadas.topSetores.length > 0) doc.text('Top setores:', colL, y);
    if (data.chamadas.topGarcons.length > 0) doc.text('Ranking garçons:', colR, y);
    y += 5;
    const maxRows = Math.max(data.chamadas.topSetores.length, data.chamadas.topGarcons.length);
    for (let i = 0; i < maxRows; i++) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...hex('#6b7280'));
      if (data.chamadas.topSetores[i]) {
        const [setor, qtd] = data.chamadas.topSetores[i];
        doc.text(`#${i + 1}  ${setor}: ${qtd}`, colL + 3, y);
      }
      if (data.chamadas.topGarcons[i]) {
        const [garcom, qtd] = data.chamadas.topGarcons[i];
        doc.text(`#${i + 1}  ${garcom}: ${qtd}`, colR + 3, y);
      }
      y += 4.5;
    }
    y += 3;
  }

  addPageIfNeeded();
  sectionHeader('4. Satisfação');
  kpiRow([
    { label: 'NPS Score',      value: data.satisfacao.nps != null ? String(data.satisfacao.nps) : '—' },
    { label: 'Arretados',      value: `${Math.round(data.satisfacao.arretados)}%` },
    { label: 'Oxente',         value: `${Math.round(data.satisfacao.oxente)}%` },
    { label: 'Putz',           value: `${Math.round(data.satisfacao.putz)}%` },
  ]);
  kpiRow([
    { label: 'Nota Survey',     value: data.satisfacao.notaSurvey != null ? data.satisfacao.notaSurvey.toFixed(1) : '—' },
    { label: 'Respostas',       value: fmt(data.satisfacao.totalSurvey) },
    { label: 'Nota Google',     value: data.satisfacao.notaGoogle != null ? data.satisfacao.notaGoogle.toFixed(1) : '—' },
    { label: 'Sem resposta',    value: fmt(data.satisfacao.semResposta) },
  ]);

  if (data.lounges.length > 0) {
    addPageIfNeeded(10 + data.lounges.length * 6);
    sectionHeader('5. Lounges — Status Final');
    const cols = ['Lounge', 'Pax', 'Nome', 'Canal', 'Veículo', 'Parceiro'];
    const colX = [ML, ML+18, ML+30, ML+82, ML+116, ML+144];
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...hex('#374151'));
    cols.forEach((c, i) => doc.text(c, colX[i], y)); y += 5;
    doc.setDrawColor(...hex('#e5e7eb')); doc.line(ML, y, ML + CW, y); y += 3;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...hex('#374151'));
    data.lounges.forEach(({ num, pax, nome, canal, veiculo, parceiro }) => {
      doc.setFontSize(7.5);
      const row = [`${num}`, `${pax}`, nome, canal, veiculo, parceiro];
      row.forEach((v, i) => {
        const maxW = i === 2 ? 50 : i === 3 ? 32 : 27;
        const lines = wrap(v, maxW, 7.5);
        doc.text(lines[0] ?? '', colX[i], y);
      });
      y += 5.5;
      addPageIfNeeded();
    });
  }

  // Rodapé
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFillColor(...hex('#7c3aed')); doc.rect(0, 292, W, 3, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(...hex('#9ca3af'));
    doc.text('Desenvolvido por H8 Sistemas', ML, 297);
    doc.text(`Página ${p} de ${pages}`, W - MR, 297, { align: 'right' });
  }

  doc.save(`fechamento-${data.dateLabel.replace(/\//g,'-')}.pdf`);
}

// ── Página ────────────────────────────────────────────────────────────────────
export function Relatorio() {
  const [date, setDate]   = useState(todayISO());
  const [exporting, setEx] = useState(false);

  const isToday   = date === todayISO();
  const period    = isToday ? 'today' : 'custom';
  // Usa histórico para dias passados OU quando já passou das 18h BRT (depois da zeragem)
  const useHist   = !isToday || hourBRT() >= 18;

  const paytour   = usePaytour('today');
  const { revenue: mesRev } = useMonthRevenue();
  const { data: absData }   = useReceitaABS();
  const [liveOcc] = useOccupancy();
  const histOcc   = useHistoricoOcupacao(date, useHist);
  // Prioridade: histórico (se disponível) > live
  const occ       = (useHist && histOcc) ? histOcc : liveOcc;
  const { data: checkin }   = useCheckin();
  const { chamadas }        = useChamadas(date, date);
  const survey    = useSurveyMonkey(period);
  const google    = useGoogleBusiness(period);
  const [goals]   = useGoals();

  // ── Receita ────────────────────────────────────────────────────────
  const pt = paytour.data;
  const todayRev   = pt?.todayRevenue   ?? null;
  const todayItems = pt?.todayItems     ?? null;
  const todayOrders= pt?.todayOrders    ?? null;
  const ticket     = todayOrders && todayOrders > 0 && todayRev != null ? todayRev / todayOrders : null;
  const pctMeta    = mesRev != null && goals.receitaTotal > 0 ? Math.round((mesRev / goals.receitaTotal) * 100) : null;

  // ── Ocupação ───────────────────────────────────────────────────────
  const loungesTotal = occ.lounges.reduce((s, n) => s + n, 0);
  const taxaCI = checkin && checkin.reservados > 0 && checkin.checkins != null ? Math.round((checkin.checkins / checkin.reservados) * 100) : 0;

  // ── Chamadas ───────────────────────────────────────────────────────
  const chamadasStats = useMemo(() => {
    const total       = chamadas.length;
    const finalizadas = chamadas.filter(c => c.status === 'finalizado').length;
    const demoradas   = chamadas.filter(c => parseTempoSec(c.tempoEspera) >= 60).length;
    const comEspera   = chamadas.filter(c => c.tempoEspera);
    const mediaSegs   = comEspera.length > 0
      ? comEspera.reduce((s, c) => s + parseTempoSec(c.tempoEspera), 0) / comEspera.length
      : 0;
    const mm = Math.floor(mediaSegs / 60);
    const ss = Math.round(mediaSegs % 60);
    const mediaEspera = comEspera.length > 0 ? `${mm}m ${ss}s` : '—';
    const setorCount = chamadas.reduce<Record<string, number>>((acc, c) => {
      if (c.setor) acc[c.setor] = (acc[c.setor] ?? 0) + 1;
      return acc;
    }, {});
    const topSetores = Object.entries(setorCount).sort((a, b) => b[1] - a[1]).slice(0, 3) as [string, number][];

    // Ranking garçons
    const garcomCount = chamadas.reduce<Record<string, number>>((acc, c) => {
      if (c.garcom) acc[c.garcom] = (acc[c.garcom] ?? 0) + 1;
      return acc;
    }, {});
    const topGarcons = Object.entries(garcomCount).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][];

    return { total, finalizadas, demoradas, mediaEspera, topSetores, topGarcons };
  }, [chamadas]);

  // ── Lounges ocupados ───────────────────────────────────────────────
  const loungesOcupados = useMemo(() =>
    occ.lounges
      .map((pax, i) => ({
        num:      LOUNGE_START + i,
        pax,
        nome:     occ.loungeData?.[i]?.nome     ?? '',
        canal:    occ.loungeData?.[i]?.canal    ?? '',
        veiculo:  occ.loungeData?.[i]?.veiculo  ?? '',
        parceiro: occ.loungeData?.[i]?.parceiro ?? '',
        obs:      occ.loungeData?.[i]?.obs      ?? '',
      }))
      .filter(l => l.pax > 0),
  [occ]);

  // ── Satisfação ─────────────────────────────────────────────────────
  const sd = survey.data;
  const gd = google.data;

  // ── Data label ─────────────────────────────────────────────────────
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const handleExport = async () => {
    setEx(true);
    try {
      await gerarPDF({
        dateLabel,
        receita: { hoje: todayRev, mes: mesRev, abs: absData?.receita_abs ?? null, meta: goals.receitaTotal, items: todayItems, orders: todayOrders, ticket },
        ocupacao: { portaria: 0, beach: occ.beach, loungesTotal, parceiros: occ.parceiros, checkins: checkin?.checkins ?? 0, reservados: checkin?.reservados ?? 0, pendentes: checkin?.pendentes ?? 0 },
        lounges: loungesOcupados,
        chamadas: { total: chamadasStats.total, finalizadas: chamadasStats.finalizadas, demoradas: chamadasStats.demoradas, mediaEspera: chamadasStats.mediaEspera, topSetores: chamadasStats.topSetores, topGarcons: chamadasStats.topGarcons },
        satisfacao: { nps: sd?.npsScore ?? null, arretados: sd?.promoters ?? 0, oxente: sd?.neutrals ?? 0, putz: sd?.detractors ?? 0, notaSurvey: sd?.avgScore ?? null, totalSurvey: sd?.totalResponses ?? 0, notaGoogle: gd?.averageRating ?? null, semResposta: gd?.unansweredCount ?? 0 },
      });
    } finally {
      setEx(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Fechamento do Dia</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Resumo operacional para encerramento</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => setDate(e.target.value)}
            className="text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg px-3 py-1.5"
          />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <FileDown size={15} />
            {exporting ? 'Gerando…' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* 1. Receita */}
      <Section icon={TrendingUp} title="Receita do Dia">
        <KpiGrid items={[
          { label: 'Receita hoje',       value: fmtR(todayRev),    color: 'text-brand-600 dark:text-brand-400' },
          { label: 'Atividades vendidas',value: fmt(todayItems) },
          { label: 'Reservas',           value: fmt(todayOrders) },
          { label: 'Ticket médio',       value: fmtR(ticket) },
        ]} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Acumulado do Mês</p>
            <p className="text-lg font-bold text-gray-800 dark:text-white">{fmtR(mesRev)}</p>
            {pctMeta != null && <p className="text-[10px] text-gray-400">{pctMeta}% da meta</p>}
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Meta Mensal</p>
            <p className="text-lg font-bold text-gray-800 dark:text-white">{fmtR(goals.receitaTotal)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Receita A&BS</p>
            <p className="text-lg font-bold text-gray-800 dark:text-white">{fmtR(absData?.receita_abs ?? null)}</p>
            {absData?.atualizado_em && <p className="text-[10px] text-gray-400">atualizado {new Date(absData.atualizado_em).toLocaleDateString('pt-BR')}</p>}
          </div>
        </div>
      </Section>

      {/* 2. Ocupação */}
      <Section icon={Users} title="Ocupação">
        <KpiGrid items={[
          { label: 'Pax Beach',    value: fmt(occ.beach),       sub: `máx ${SPACE_CONFIGS.beach.max}` },
          { label: 'Pax Lounges', value: fmt(loungesTotal),     sub: `${loungesOcupados.length} de ${LOUNGE_COUNT} lounges` },
          { label: 'Parceiros',   value: fmt(occ.parceiros) },
          { label: 'Total Na Casa',value: fmt(occ.beach + loungesTotal + occ.parceiros) },
        ]} />
        {checkin && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {[
              { label: 'Reservados',       value: fmt(checkin.reservados) },
              { label: 'Check-ins feitos', value: fmt(checkin.checkins),  color: 'text-green-600 dark:text-green-400' },
              { label: 'Pendentes',        value: fmt(checkin.pendentes), color: (checkin.pendentes ?? 0) > 0 ? 'text-amber-600' : undefined },
              { label: 'Taxa check-in',    value: taxaCI ? `${taxaCI}%` : '—' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                <p className={clsx('text-lg font-bold', color ?? 'text-gray-800 dark:text-white')}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 3. Chamadas */}
      <Section icon={Bell} title="Atendimento — Chamadas">
        <KpiGrid items={[
          { label: 'Total',       value: fmt(chamadasStats.total) },
          { label: 'Finalizadas', value: fmt(chamadasStats.finalizadas), color: 'text-green-600 dark:text-green-400' },
          { label: 'Demoradas ≥60s', value: fmt(chamadasStats.demoradas), color: chamadasStats.demoradas > 0 ? 'text-red-600 dark:text-red-400' : undefined },
          { label: 'Tempo médio', value: chamadasStats.mediaEspera },
        ]} />
        {(chamadasStats.topSetores.length > 0 || chamadasStats.topGarcons.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {chamadasStats.topSetores.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Top Setores</p>
                <div className="space-y-1.5">
                  {chamadasStats.topSetores.map(([setor, qtd], i) => (
                    <div key={setor} className="flex items-center justify-between">
                      <span className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-brand-500">#{i+1}</span> {setor}
                      </span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{qtd}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {chamadasStats.topGarcons.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Ranking Garçons</p>
                <div className="space-y-1.5">
                  {chamadasStats.topGarcons.map(([garcom, qtd], i) => (
                    <div key={garcom} className="flex items-center justify-between">
                      <span className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-brand-500">#{i+1}</span> {garcom}
                      </span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{qtd}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {chamadas.length === 0 && !isToday && (
          <p className="text-xs text-gray-400 mt-3">Nenhuma chamada registrada nesta data.</p>
        )}
      </Section>

      {/* 4. Satisfação */}
      <Section icon={Smile} title="Satisfação">
        {sd || gd ? (
          <>
            <KpiGrid items={[
              { label: 'NPS Score',    value: sd?.npsScore != null ? String(sd.npsScore) : '—', color: sd?.npsScore != null ? (sd.npsScore >= 50 ? 'text-green-600 dark:text-green-400' : sd.npsScore >= 0 ? 'text-amber-600' : 'text-red-600') : undefined },
              { label: 'Arretados',   value: sd ? `${Math.round(sd.promoters)}%` : '—', color: 'text-green-600 dark:text-green-400' },
              { label: 'Oxente',      value: sd ? `${Math.round(sd.neutrals)}%` : '—',  color: 'text-amber-600' },
              { label: 'Putz',        value: sd ? `${Math.round(sd.detractors)}%` : '—',color: 'text-red-600 dark:text-red-400' },
            ]} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {[
                { label: 'Nota Survey',    value: sd?.avgScore != null ? sd.avgScore.toFixed(1) : '—', sub: `${sd?.totalResponses ?? 0} respostas` },
                { label: 'Nota Google',    value: gd?.averageRating != null ? gd.averageRating.toFixed(1) : '—', sub: `${gd?.totalReviews ?? 0} avaliações` },
                { label: 'Sem resposta',   value: fmt(gd?.unansweredCount), color: (gd?.unansweredCount ?? 0) > 0 ? 'text-amber-600' : undefined },
                { label: 'Respostas hoje', value: fmt(sd?.totalResponses) },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                  <p className={clsx('text-lg font-bold', color ?? 'text-gray-800 dark:text-white')}>{value}</p>
                  {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400">Carregando dados de satisfação…</p>
        )}
      </Section>

      {/* 5. Lounges */}
      <Section icon={LayoutList} title="Lounges — Status Final">
        {loungesOcupados.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {['Lounge','Pax','Nome','Canal','Veículo','Parceiro','Obs'].map(h => (
                    <th key={h} className="text-left pb-2 pr-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {loungesOcupados.map(({ num, pax, nome, canal, veiculo, parceiro, obs }) => (
                  <tr key={num} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-2 pr-3 font-semibold text-brand-600 dark:text-brand-400">{num}</td>
                    <td className="py-2 pr-3 font-semibold">{pax}</td>
                    <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 max-w-[140px] truncate">{nome || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{canal || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{veiculo || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{parceiro || '—'}</td>
                    <td className="py-2 text-gray-400 max-w-[120px] truncate">{obs || ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 dark:border-gray-600">
                  <td className="pt-2 text-[10px] text-gray-500 font-semibold">Total</td>
                  <td className="pt-2 font-bold text-gray-800 dark:text-white">{loungesTotal}</td>
                  <td colSpan={5} className="pt-2 text-[10px] text-gray-400">{loungesOcupados.length} de {LOUNGE_COUNT} lounges ocupados</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Nenhum lounge com ocupação registrada.</p>
        )}
      </Section>
    </div>
  );
}
