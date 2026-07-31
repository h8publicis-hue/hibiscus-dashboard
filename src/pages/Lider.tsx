import { useState, useMemo, useEffect, useRef } from 'react';
import { CheckCircle, AlertTriangle, Users, Waves, LayoutDashboard, Bell, CalendarDays, Check, Upload, LogOut, Printer, Megaphone, X } from 'lucide-react';
import { useAviso } from '../hooks/useAviso';
import { useEscalaHoje } from '../hooks/useEscalaHoje';
import { useOccupancy } from '../hooks/useOccupancy';
import { useChamadas, parseTempoSec } from '../hooks/useChamadas';
import type { ValidacaoGarcom, BeachSetor, EscalaGarcom, EscalaStatus, CorGarcom } from '../types';
import { BEACH_SETORES, BEACH_SETOR_GRUPOS, SPACE_CONFIGS, COR_GARCOM } from '../types';

const STATUS_OPTS: { value: EscalaStatus; label: string; cls: string; bg: string }[] = [
  { value: 'T', label: 'T', cls: 'bg-teal-700 text-white',    bg: 'bg-teal-700'    },
  { value: 'X', label: 'X', cls: 'bg-gray-600 text-white',    bg: 'bg-gray-600'    },
  { value: 'C', label: 'C', cls: 'bg-yellow-500 text-white',  bg: 'bg-yellow-500'  },
  { value: 'F', label: 'F', cls: 'bg-blue-500 text-white',    bg: 'bg-blue-500'    },
  { value: 'A', label: 'A', cls: 'bg-red-500 text-white',     bg: 'bg-red-500'     },
];

// Parse xlsx no cliente — retorna linhas [{nome, funcao, dias:{DD:status}}]
async function parseEscalaXlsx(file: File): Promise<EscalaGarcom[]> {
  const XLSX = await import('xlsx');
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Identifica linha de cabeçalho (contém '01' ou '1' nas colunas de dias)
  // Formato: col0=nº, col1=nome, col2=função, col3..=dias
  const STATUS_SET = new Set(['T', 'X', 'C', 'F', 'A', 'C ']);
  const garcons: EscalaGarcom[] = [];

  // Encontra índice da coluna de dias (busca pela primeira col com valor '01' ou 1)
  let headerRow = -1;
  let firstDayCol = 3;
  for (let r = 0; r < Math.min(10, raw.length); r++) {
    const row = raw[r];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c]).trim();
      if (v === '01' || v === '1') { headerRow = r; firstDayCol = c; break; }
    }
    if (headerRow >= 0) break;
  }

  const dataStart = headerRow >= 0 ? headerRow + 1 : 2;

  for (let r = dataStart; r < raw.length; r++) {
    const row = raw[r];
    const nome = String(row[1] ?? '').trim();
    const func = String(row[2] ?? '').trim().toUpperCase();
    if (!nome || nome.length < 3) continue;

    const area: 'beach' | 'lounge' = func.includes('LOUNGE') ? 'lounge' : 'beach';
    const dias: Record<string, EscalaStatus> = {};

    for (let c = firstDayCol; c < row.length; c++) {
      const dia  = String(c - firstDayCol + 1).padStart(2, '0');
      const val  = String(row[c] ?? '').trim().toUpperCase();
      if (STATUS_SET.has(val)) dias[dia] = (val.trim() as EscalaStatus);
      else if (val === '' || val === '-') dias[dia] = 'T'; // fim de semana/vazio → T por padrão
    }

    garcons.push({
      id:   `xlsx-${r}`,
      nome: nome.split(' ').slice(0, 3).join(' '),
      area,
      dias,
    });
  }
  return garcons;
}

const MES_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAY_ABBR  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function BoxEscalaMensal() {
  const [mes, setMes] = useState(() => {
    const stored = localStorage.getItem('hibiscus-escala-mes');
    const today  = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' }).slice(0, 7);
    return stored ?? today;
  });
  const { escala, loading, salvarEscala } = useEscalaHoje(`${mes}-01`);
  const [rows, setRows]         = useState<EscalaGarcom[]>([]);
  const [saving, setSaving]     = useState(false);
  const [saved,  setSaved]      = useState(false);
  const [savedMes, setSavedMes] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function changeMes(value: string) {
    setMes(value);
    localStorage.setItem('hibiscus-escala-mes', value);
  }

  useEffect(() => {
    if (!loading) {
      if (escala.length > 0) {
        setRows(escala);
      } else {
        const raw = localStorage.getItem('hibiscus-staff');
        if (raw) {
          const staff: { id: string; name: string; sector: string }[] = JSON.parse(raw);
          setRows(staff.filter(s => s.sector === 'ATENDIMENTO').map(s => ({
            id: s.id,
            nome: s.name.split(' ').slice(0, 2).join(' '),
            area: 'beach' as const,
            dias: {},
          })));
        }
      }
    }
  }, [loading, escala]);

  const daysInMes = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const days = Array.from({ length: daysInMes }, (_, i) => String(i + 1).padStart(2, '0'));

  function cycleStatus(ri: number, dia: string) {
    const order: EscalaStatus[] = ['T', 'X', 'C', 'F', 'A'];
    const cur  = rows[ri]?.dias[dia] ?? 'T';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setRows(prev => prev.map((r, i) => i === ri ? { ...r, dias: { ...r.dias, [dia]: next } } : r));
  }
  function setArea(ri: number, area: 'beach' | 'lounge') {
    setRows(prev => prev.map((r, i) => i === ri ? { ...r, area, setor_padrao: area === 'lounge' ? undefined : (r.setor_padrao ?? 'salao') } : r));
  }
  function setSetorPadrao(ri: number, setor: BeachSetor) {
    setRows(prev => prev.map((r, i) => i === ri ? { ...r, setor_padrao: setor } : r));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const parsed = await parseEscalaXlsx(file);
      if (parsed.length > 0) setRows(parsed);
      else alert('Não foi possível ler a escala. Verifique o formato do arquivo.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSave() {
    setSaving(true);
    const rowsNormalized = rows.map(r => ({
      ...r,
      setor_padrao: r.area === 'beach' ? (r.setor_padrao ?? 'salao' as BeachSetor) : undefined,
    }));
    await salvarEscala(rowsNormalized);
    setRows(rowsNormalized);
    setSaving(false);
    setSaved(true);
    setSavedMes(mes);
    setTimeout(() => setSaved(false), 3000);
  }

  const mesLabel = (() => {
    const [y, m] = mes.split('-');
    return `${MES_NAMES[Number(m) - 1]} ${y}`;
  })();
  const isCurrentMonth = mes === new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' }).slice(0, 7);

  if (loading) return <p className="text-sm text-gray-400 py-6 text-center">Carregando {mesLabel}...</p>;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input type="month" value={mes} onChange={e => changeMes(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white" />
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isCurrentMonth ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
          {mesLabel}
        </span>
        <span className="text-xs text-gray-400">{rows.length} garçons</span>

        {/* Botão importar */}
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 text-xs font-semibold hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 transition-colors">
          <Upload size={13} />{importing ? 'Importando...' : 'Importar Excel'}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
      </div>

      {/* Legenda */}
      <div className="flex gap-1.5 flex-wrap items-center text-[10px]">
        {STATUS_OPTS.map(s => (
          <span key={s.value} className={`px-2 py-0.5 rounded font-bold ${s.cls}`}>{s.value}</span>
        ))}
        <span className="text-gray-400 ml-1">T=Trabalha · X=Folga · C=Compensa · F=Férias · A=Atestado</span>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 -mx-1">
        <table className="text-[10px] border-collapse min-w-max w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50">
              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-700 px-2 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-300 min-w-[110px]">Nome</th>
              <th className="px-1 py-1.5 font-semibold text-gray-600 dark:text-gray-300 min-w-[60px]">Área</th>
              <th className="px-1 py-1.5 font-semibold text-gray-600 dark:text-gray-300 min-w-[72px]">Setor</th>
              {days.map(d => {
                const dow    = DAY_ABBR[new Date(`${mes}-${d}T12:00:00Z`).getUTCDay()];
                const isWknd = new Date(`${mes}-${d}T12:00:00Z`).getUTCDay() === 0 || new Date(`${mes}-${d}T12:00:00Z`).getUTCDay() === 6;
                return (
                  <th key={d} className={`px-0.5 py-1 font-semibold w-6 text-center ${isWknd ? 'text-red-400' : 'text-gray-400'}`}>
                    <div className="text-[8px] font-normal leading-tight">{dow}</div>
                    <div className="text-[10px]">{d}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((g, ri) => (
              <tr key={g.id} className={`border-t border-gray-100 dark:border-gray-700 ${g.area === 'lounge' ? 'bg-purple-50/30 dark:bg-purple-900/10' : ''}`}>
                <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-2 py-1 font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
                  {g.nome}
                  <span className={`ml-1 text-[8px] font-bold px-1 py-0.5 rounded ${g.area === 'lounge' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                    {g.area === 'lounge' ? 'L' : 'B'}
                  </span>
                </td>
                <td className="px-1 py-1">
                  <select value={g.area} onChange={e => setArea(ri, e.target.value as 'beach' | 'lounge')}
                    className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                    <option value="beach">Beach</option>
                    <option value="lounge">Lounge</option>
                  </select>
                </td>
                <td className="px-1 py-1">
                  {g.area === 'beach' ? (
                    <select value={g.setor_padrao ?? 'salao'} onChange={e => setSetorPadrao(ri, e.target.value as BeachSetor)}
                      className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {BEACH_SETORES.map(s => <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-[10px] text-purple-500">🛋️ Lounge</span>
                  )}
                </td>
                {days.map(d => {
                  const st   = g.dias[d] ?? 'T';
                  const opt  = STATUS_OPTS.find(o => o.value === st)!;
                  const date = new Date(`${mes}-${d}T12:00:00Z`);
                  const isWknd = date.getUTCDay() === 0 || date.getUTCDay() === 6;
                  return (
                    <td key={d} className={`px-0 py-1 text-center ${isWknd ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}>
                      <button onClick={() => cycleStatus(ri, d)}
                        className={`w-5 h-5 lg:w-6 lg:h-6 rounded text-[8px] font-bold ${opt.cls} hover:opacity-80 active:scale-95`}>
                        {st}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
        {saved
          ? <><Check size={14} /> Salvo — {MES_NAMES[Number(savedMes.split('-')[1]) - 1]} {savedMes.split('-')[0]}!</>
          : saving ? 'Salvando...'
          : `Salvar escala de ${mesLabel}`}
      </button>
      <p className="text-[10px] text-gray-400 text-center">Toque nas células para alternar · Setor = padrão usado na validação diária</p>
    </div>
  );
}

function todayBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
}

// ── Box Validação ─────────────────────────────────────────────────────────────
function BoxEscala() {
  const hoje     = todayBRT();
  const amanhaDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Recife' }));
  amanhaDate.setDate(amanhaDate.getDate() + 1);
  const amanha   = amanhaDate.toLocaleDateString('en-CA');

  const [dataAlvo, setDataAlvo] = useState(hoje);
  const { ativosHoje, validacao, loading, validarDia, totalEscala } = useEscalaHoje(dataAlvo);
  const [editando, setEditando] = useState(false);
  const [draft, setDraft]       = useState<ValidacaoGarcom[]>([]);
  const [saving, setSaving]     = useState(false);
  const [printing, setPrinting] = useState(false);

  const agora = new Date();
  const h = agora.getHours();
  const depois09 = h >= 9;

  function abrirValidacao() {
    const base: ValidacaoGarcom[] = validacao.validado
      ? validacao.garcons
      : ativosHoje.map(g => ({
          id: g.id, nome: g.nome, area: g.area,
          setor: g.area === 'beach' ? (g.setor_padrao ?? 'salao' as BeachSetor) : undefined,
          faltou: false,
        }));
    setDraft(base);
    setEditando(true);
  }

  async function confirmar() {
    setSaving(true);
    await validarDia(draft);
    setSaving(false);
    setEditando(false);
  }

  async function imprimirPDF() {
    setPrinting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const W = 210, ML = 14, MR = 14;
      const now = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      const dataFmt = new Date(dataAlvo + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
      });

      const hex = (h: string): [number, number, number] => [
        parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16),
      ];

      let y = 14;
      let resolvedLogoW = 0;

      // Logo (mesmo padrão do Satisfaction.tsx)
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
            canvas.getContext('2d')!.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            const ratio = img.naturalWidth / img.naturalHeight;
            const logoW = Math.min(Math.round(ratio * 14), 36);
            const logoH = Math.round(logoW / ratio);
            doc.addImage(dataUrl, 'PNG', ML, y + (14 - logoH) / 2 + 1, logoW, logoH, undefined, 'FAST');
            resolvedLogoW = logoW;
          } catch { /* sem logo */ }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = '/logo.png';
      });

      // Faixa roxa no topo
      doc.setFillColor(...hex('#7c3aed'));
      doc.rect(0, 0, W, 2, 'F');

      const tx = ML + resolvedLogoW + 4;
      doc.setFontSize(15); doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hex('#7c3aed'));
      doc.text('Hibiscus Beach Club', tx, y + 8);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.setTextColor(...hex('#6b7280'));
      doc.text('Escala Diária de Atendimento', tx, y + 15);
      doc.setFontSize(7); doc.setFont('helvetica', 'italic');
      doc.setTextColor(...hex('#9ca3af'));
      doc.text('Uso exclusivo da gestão operacional', tx, y + 21);

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.setTextColor(...hex('#9ca3af'));
      doc.text(`Gerado em ${now}`, W - MR, y + 8, { align: 'right' });
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hex('#374151'));
      doc.text(dataFmt, W - MR, y + 15, { align: 'right' });
      y += 30;

      doc.setDrawColor(...hex('#e5e7eb'));
      doc.setLineWidth(0.4);
      doc.line(ML, y, W - MR, y);
      y += 8;

      // Dados
      const allGarcons: ValidacaoGarcom[] = validacao.validado
        ? validacao.garcons
        : ativosHoje.map(g => ({ id: g.id, nome: g.nome, area: g.area, setor: g.setor_padrao }));

      const ativos   = allGarcons.filter(g => !g.faltou);
      const lounge   = ativos.filter(g => g.area === 'lounge');
      const beach    = ativos.filter(g => g.area === 'beach');
      const faltaram = allGarcons.filter(g => g.faltou);

      // Cards de resumo
      const cards = [
        { label: 'Total em serviço', value: String(ativos.length), bg: '#f5f3ff', color: '#7c3aed' },
        { label: 'Lounge',          value: String(lounge.length),  bg: '#faf5ff', color: '#7c3aed' },
        { label: 'Beach',           value: String(beach.length),   bg: '#eff6ff', color: '#1d4ed8' },
        { label: 'Faltaram',        value: String(faltaram.length),bg: '#fef2f2', color: '#dc2626' },
      ];
      const cardW = (W - ML - MR - 3 * 3) / 4;
      cards.forEach((c, i) => {
        const cx = ML + i * (cardW + 3);
        doc.setFillColor(...hex(c.bg));
        doc.roundedRect(cx, y, cardW, 18, 2, 2, 'F');
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hex(c.color));
        doc.text(c.value, cx + cardW / 2, y + 11, { align: 'center' });
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(...hex('#6b7280'));
        doc.text(c.label, cx + cardW / 2, y + 16, { align: 'center' });
      });
      y += 24;

      doc.setDrawColor(...hex('#e5e7eb'));
      doc.line(ML, y, W - MR, y);
      y += 6;

      const drawSectionHeader = (title: string, color: string) => {
        doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hex(color));
        doc.text(title, ML, y + 4);
        doc.setFillColor(...hex(color));
        doc.rect(ML, y + 6, W - ML - MR, 0.4, 'F');
        y += 12;
      };

      const drawTableHeader = () => {
        doc.setFillColor(...hex('#1f2937')); doc.rect(ML, y, W - ML - MR, 7, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text('Nome', ML + 2, y + 5);
        doc.text('Área / Setor', ML + 85, y + 5);
        doc.text('Almoço', ML + 145, y + 5);
        y += 7;
      };

      const COR_HEX: Record<string, string> = {
        amarelo: '#eab308', vermelho: '#ef4444', preto: '#111827', azul: '#3b82f6',
      };

      const drawRow = (g: ValidacaoGarcom, idx: number) => {
        if (y > 268) { doc.addPage(); y = 20; }
        if (idx % 2 === 1) { doc.setFillColor(...hex('#f9fafb')); doc.rect(ML, y, W - ML - MR, 7, 'F'); }
        // bolinha colorida
        if (g.cor && COR_HEX[g.cor]) {
          doc.setFillColor(...hex(COR_HEX[g.cor]));
          doc.circle(ML + 3.5, y + 3.5, 2, 'F');
        }
        doc.setTextColor(...hex('#111827')); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(g.nome.substring(0, 38), ML + 7, y + 5);
        const setorLabel = g.area === 'lounge'
          ? 'Lounge'
          : 'Beach — ' + (BEACH_SETORES.find(s => s.value === g.setor)?.label ?? '—');
        doc.text(setorLabel, ML + 85, y + 5);
        if (g.almoco) {
          doc.setFillColor(...hex('#ede9fe'));
          doc.roundedRect(ML + 143, y + 1, 22, 5, 1, 1, 'F');
          doc.setTextColor(...hex('#7c3aed')); doc.setFont('helvetica', 'bold');
          doc.text(g.almoco, ML + 154, y + 5, { align: 'center' });
          doc.setFont('helvetica', 'normal');
        } else {
          doc.setTextColor(...hex('#9ca3af'));
          doc.text('—', ML + 154, y + 5, { align: 'center' });
        }
        y += 7;
      };

      if (lounge.length > 0) {
        drawSectionHeader('Lounge', '#7c3aed');
        drawTableHeader();
        lounge.forEach((g, i) => drawRow(g, i));
        y += 5;
      }
      if (beach.length > 0) {
        drawSectionHeader('Beach', '#1d4ed8');
        drawTableHeader();
        beach.forEach((g, i) => drawRow(g, i));
        y += 5;
      }
      if (faltaram.length > 0) {
        drawSectionHeader('Faltaram', '#dc2626');
        drawTableHeader();
        faltaram.forEach((g, i) => drawRow(g, i));
      }

      // Rodapé em todas as páginas
      const pageCount = doc.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setDrawColor(...hex('#e5e7eb')); doc.setLineWidth(0.3);
        doc.line(ML, 287, W - MR, 287);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(...hex('#9ca3af'));
        doc.text('Hibiscus Beach Club · H8 Sistemas', ML, 291);
        doc.text(`${p} / ${pageCount}`, W - MR, 291, { align: 'right' });
      }

      doc.save(`escala-${dataAlvo}.pdf`);
    } finally {
      setPrinting(false);
    }
  }

  const garconsDia = validacao.validado ? validacao.garcons.filter(g => !g.faltou) : [];
  const totalLounge = garconsDia.filter(g => g.area === 'lounge').length;
  const beachPorSetor = BEACH_SETOR_GRUPOS.map(grupo => ({
    ...grupo,
    count: garconsDia.filter(g => g.area === 'beach' && grupo.setores.includes(g.setor ?? '')).length,
    subs:  grupo.setores.length > 1
      ? BEACH_SETORES.filter(s => grupo.setores.includes(s.value)).map(s => ({
          label: s.label,
          count: garconsDia.filter(g => g.area === 'beach' && g.setor === s.value).length,
        })).filter(s => s.count > 0)
      : [],
  }));
  const totalBeach = garconsDia.filter(g => g.area === 'beach').length;
  const total = garconsDia.length;
  const dataLabel = new Date(dataAlvo + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Recife',
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-brand-600 dark:text-brand-400" />
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Escala do dia</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 text-xs">
            <button onClick={() => setDataAlvo(hoje)}
              className={`px-3 py-1.5 font-semibold transition-colors ${dataAlvo === hoje ? 'bg-brand-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
              Hoje
            </button>
            <button onClick={() => setDataAlvo(amanha)}
              className={`px-3 py-1.5 font-semibold transition-colors border-l border-gray-200 dark:border-gray-600 ${dataAlvo === amanha ? 'bg-brand-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
              Amanhã
            </button>
          </div>
          {validacao.validado && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-semibold">
              <CheckCircle size={13} /> Validada
            </span>
          )}
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{dataLabel}</p>

        {!validacao.validado && depois09 && dataAlvo === hoje && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 text-amber-800 dark:text-amber-300 text-sm font-semibold animate-pulse">
            <AlertTriangle size={16} /> Escala do dia não validada
          </div>
        )}

        {validacao.validado && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-teal-700 dark:text-teal-400">
                  {total}
                  {totalEscala > 0 && <span className="text-sm font-medium text-teal-400">/{totalEscala}</span>}
                </p>
                <p className="text-xs text-teal-600 dark:text-teal-500 font-semibold">Total</p>
              </div>
              <div className="flex-1 bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-purple-700 dark:text-purple-400">{totalLounge}</p>
                <p className="text-xs text-purple-600 dark:text-purple-500 font-semibold">🛋️ Lounge</p>
              </div>
              <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-blue-700 dark:text-blue-400">{totalBeach}</p>
                <p className="text-xs text-blue-600 dark:text-blue-500 font-semibold">🏖️ Beach</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {beachPorSetor.map(s => (
                <div key={s.key} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{s.emoji} {s.label}</span>
                    <span className="text-sm font-black text-gray-800 dark:text-white">{s.count}</span>
                  </div>
                  {s.subs.length > 0 && (
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {s.subs.map(sub => (
                        <span key={sub.label} className="text-[9px] text-gray-400 dark:text-gray-500">
                          {sub.label}: {sub.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && ativosHoje.length === 0 && !validacao.validado && (
          <p className="text-xs text-gray-400 text-center py-2">Escala mensal não cadastrada. Acesse a aba Escala Mensal para inserir.</p>
        )}

        <div className="flex gap-2">
          {!validacao.validado && ativosHoje.length > 0 && (
            <button onClick={abrirValidacao}
              className="flex-1 py-3 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 transition-colors flex items-center justify-center gap-2">
              <CheckCircle size={16} /> Validar escala
            </button>
          )}
          {validacao.validado && (
            <>
              <button onClick={abrirValidacao}
                className="flex-1 py-2.5 rounded-xl border border-brand-300 dark:border-brand-600 text-brand-600 dark:text-brand-400 font-semibold text-sm hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                Editar
              </button>
              <button onClick={imprimirPDF} disabled={printing}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 dark:bg-gray-700 text-white font-semibold text-sm hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <Printer size={14} /> {printing ? 'Gerando...' : 'Imprimir PDF'}
              </button>
            </>
          )}
        </div>
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={() => setEditando(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">
                Validar escala — {new Date(dataAlvo + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </h3>
              <button onClick={() => setEditando(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
            </div>

            <div className="p-4 flex flex-col gap-2">
              {draft.map((g, i) => (
                <div key={g.id} className={`rounded-xl p-3 border transition-colors ${g.faltou ? 'border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10 opacity-70' : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {g.cor && (
                      <span className={`w-3 h-3 rounded-full shrink-0 ${COR_GARCOM.find(c => c.value === g.cor)?.bg ?? ''}`} />
                    )}
                    <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-white truncate">{g.nome}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${g.area === 'lounge' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {g.area === 'lounge' ? '🛋️' : '🏖️'} {g.area === 'lounge' ? 'Lounge' : 'Beach'}
                    </span>
                    <button
                      onClick={() => setDraft(prev => prev.map((x, xi) => xi === i ? { ...x, faltou: !x.faltou } : x))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 transition-colors ${g.faltou ? 'bg-red-500 text-white border-red-500' : 'bg-white dark:bg-gray-700 text-red-500 border-red-300 dark:border-red-700 hover:bg-red-50'}`}
                    >
                      Faltou
                    </button>
                  </div>
                  {!g.faltou && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        {g.area === 'beach' && (
                          <select
                            value={g.setor ?? 'salao'}
                            onChange={e => setDraft(prev => prev.map((x, xi) => xi === i ? { ...x, setor: e.target.value as BeachSetor } : x))}
                            className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex-1"
                          >
                            {BEACH_SETORES.map(s => <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>)}
                          </select>
                        )}
                        <select
                          value={g.almoco ?? ''}
                          onChange={e => setDraft(prev => prev.map((x, xi) => xi === i ? { ...x, almoco: (e.target.value || undefined) as any } : x))}
                          className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex-1"
                        >
                          <option value="">🍽️ Almoço</option>
                          <option value="11h">11h</option>
                          <option value="13h">13h</option>
                          <option value="14h">14h</option>
                        </select>
                      </div>
                      {/* Cor do colaborador */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 shrink-0">Cor:</span>
                        <div className="flex gap-1.5">
                          {/* sem cor */}
                          <button
                            onClick={() => setDraft(prev => prev.map((x, xi) => xi === i ? { ...x, cor: undefined } : x))}
                            className={`w-5 h-5 rounded-full border-2 bg-white dark:bg-gray-600 transition-all ${!g.cor ? 'border-brand-500 scale-110' : 'border-gray-300 dark:border-gray-500'}`}
                            title="Sem cor"
                          />
                          {COR_GARCOM.map(c => (
                            <button
                              key={c.value}
                              onClick={() => setDraft(prev => prev.map((x, xi) => xi === i ? { ...x, cor: c.value as CorGarcom } : x))}
                              className={`w-5 h-5 rounded-full ${c.bg} transition-all ${g.cor === c.value ? 'ring-2 ring-offset-1 ' + c.ring + ' scale-110' : ''}`}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <button onClick={confirmar} disabled={saving}
                className="mt-3 w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <CheckCircle size={16} /> {saving ? 'Salvando...' : 'Confirmar escala'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Box Ocupação ──────────────────────────────────────────────────────────────
function BoxOcupacao() {
  const [occupancy] = useOccupancy();
  const loungesOcupados = occupancy.lounges.filter(v => v > 0).length;
  const loungesTotal    = occupancy.lounges.reduce((a, b) => a + b, 0);
  const beachPct = Math.round((occupancy.beach / SPACE_CONFIGS.beach.max) * 100);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Waves size={18} className="text-brand-600 dark:text-brand-400" />
        <h2 className="font-bold text-gray-900 dark:text-white text-sm">Ocupação atual</h2>
      </div>
      <div className="p-5 grid grid-cols-2 gap-3">
        <div className="bg-sky-50 dark:bg-sky-900/20 rounded-xl p-3 flex flex-col gap-1">
          <p className="text-xs text-sky-600 dark:text-sky-400 font-semibold">🏖️ Beach</p>
          <p className="text-2xl font-black text-sky-700 dark:text-sky-300">{occupancy.beach}</p>
          <div className="w-full bg-sky-200 dark:bg-sky-800 rounded-full h-1.5">
            <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${Math.min(beachPct, 100)}%` }} />
          </div>
          <p className="text-[10px] text-sky-500">{beachPct}% da cap.</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 flex flex-col gap-1">
          <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold">🛋️ Lounges</p>
          <p className="text-2xl font-black text-purple-700 dark:text-purple-300">{loungesOcupados}<span className="text-sm font-medium text-purple-400">/19</span></p>
          <p className="text-[10px] text-purple-500">{loungesTotal} pax no total</p>
        </div>
        {occupancy.parceiros > 0 && (
          <div className="col-span-2 bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 flex items-center justify-between">
            <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold">🤝 Parceiros</p>
            <p className="text-lg font-black text-gray-700 dark:text-gray-200">{occupancy.parceiros}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Box Chamadas ──────────────────────────────────────────────────────────────
function BoxChamadas() {
  const { chamadas, loading } = useChamadas();

  const stats = useMemo(() => {
    const total       = chamadas.length;
    const pendentes   = chamadas.filter(c => c.status === 'pendente').length;
    const finalizadas = chamadas.filter(c => c.status === 'finalizado' || c.status === 'finalizada').length;
    const demoradas   = chamadas.filter(c => parseTempoSec(c.tempoEspera) >= 180).length;

    // Tempo médio de espera
    const comEspera = chamadas.filter(c => c.tempoEspera);
    const avgSec    = comEspera.length
      ? Math.round(comEspera.reduce((s, c) => s + parseTempoSec(c.tempoEspera), 0) / comEspera.length)
      : 0;
    const avgStr = avgSec > 0 ? `${Math.floor(avgSec / 60)}m ${avgSec % 60}s` : null;

    // Setores com pendência agora
    const setoresPendentes = [...new Set(
      chamadas.filter(c => c.status === 'pendente' && c.setor).map(c => c.setor)
    )];

    // Mesas pendentes (ticker)
    const mesasPendentes = chamadas
      .filter(c => c.status === 'pendente')
      .map(c => c.mesa != null ? String(c.mesa) : (c.garcom || c.setor || '—'));

    // Ranking de setores com barra
    const setorMap: Record<string, number> = {};
    chamadas.forEach(c => { if (c.setor) setorMap[c.setor] = (setorMap[c.setor] ?? 0) + 1; });
    const topSetores = Object.entries(setorMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxSetor = topSetores[0]?.[1] ?? 1;

    return { total, pendentes, finalizadas, demoradas, avgStr, setoresPendentes, mesasPendentes, topSetores, maxSetor };
  }, [chamadas]);

  const tempoColor = (sec: number) => sec <= 60 ? 'text-green-600' : sec <= 179 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Bell size={18} className="text-brand-600 dark:text-brand-400" />
        <h2 className="font-bold text-gray-900 dark:text-white text-sm">Chamadas de hoje</h2>
        {loading && <span className="text-[10px] text-gray-400 ml-auto animate-pulse">atualizando...</span>}
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* 4 stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Pendentes',   val: stats.pendentes,   color: 'text-amber-500' },
            { label: 'Demoradas',   val: stats.demoradas,   color: stats.demoradas > 0 ? 'text-red-600' : 'text-gray-700 dark:text-gray-200' },
            { label: 'Finalizadas', val: stats.finalizadas, color: 'text-green-600' },
            { label: 'Total',       val: stats.total,       color: 'text-gray-800 dark:text-white' },
          ].map(({ label, val, color }) => (
            <div key={label} className="text-center">
              <p className={`text-2xl font-black ${color}`}>{val}</p>
              <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        {/* Ticker mesas pendentes — rolando */}
        {stats.mesasPendentes.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-2 py-1.5 overflow-hidden">
            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 shrink-0 uppercase tracking-wide">⚠ Mesas</span>
            <div className="flex-1 overflow-hidden relative">
              <div
                className="flex gap-4 whitespace-nowrap"
                style={{ animation: `ticker ${Math.max(8, stats.mesasPendentes.length * 4)}s linear infinite` }}
              >
                {[...stats.mesasPendentes, null, ...stats.mesasPendentes, null].map((g, i) =>
                  g === null
                    ? <span key={i} className="text-[9px] text-amber-400 dark:text-amber-600 mx-1 select-none">❯❯❯</span>
                    : <span key={i} className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">{g}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Setores aguardando */}
        {stats.setoresPendentes.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg px-3 py-1.5">
            <p className="text-[10px] font-semibold text-yellow-800 dark:text-yellow-300">
              ⚠️ Aguardando: {stats.setoresPendentes.join(' · ')}
            </p>
          </div>
        )}

        {/* Tempo médio */}
        {stats.avgStr && (
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            Tempo médio de espera: <span className="font-bold text-gray-800 dark:text-white">{stats.avgStr}</span>
          </p>
        )}

        {/* Legenda */}
        <div className="flex gap-3 text-[10px] justify-center">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/> ≤1min Arretado</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"/> 1–3min Oxente</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/> ≥3min Putz</span>
        </div>

        {/* Ranking setores com barra */}
        {stats.topSetores.length > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            {stats.topSetores.map(([setor, count]) => {
              const pct = Math.round((count / stats.total) * 100);
              const barW = Math.round((count / stats.maxSetor) * 100);
              return (
                <div key={setor} className="flex items-center gap-2">
                  <span className="text-xs text-gray-700 dark:text-gray-300 w-24 shrink-0 truncate">{setor}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${barW}%` }} />
                  </div>
                  <span className="text-xs font-bold text-gray-800 dark:text-white w-5 text-right">{count}</span>
                  <span className="text-[10px] text-gray-400 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}

        {stats.total === 0 && !loading && (
          <p className="text-xs text-gray-400 text-center py-2">Nenhuma chamada hoje</p>
        )}
      </div>
    </div>
  );
}

// ── Box Notificações (chamadas pendentes ao vivo) ─────────────────────────────
function BoxNotificacoes() {
  const { chamadas, loading, refresh } = useChamadas();

  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const pendentes = chamadas.filter(c => c.status === 'pendente');

  const tempoColor = (t: string) => {
    const s = parseTempoSec(t);
    if (!t || s === 0) return 'bg-gray-100 dark:bg-gray-700 text-gray-500';
    if (s <= 60)  return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';
    if (s <= 179) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400';
    return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-brand-600 dark:text-brand-400" />
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Notificações pendentes</h2>
          {pendentes.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {pendentes.length}
            </span>
          )}
        </div>
        <button onClick={refresh} disabled={loading}
          className="text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-40 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={loading ? 'animate-spin' : ''}>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
        </button>
      </div>

      <div className="p-4 flex flex-col gap-2 max-h-72 overflow-y-auto">
        {pendentes.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">
            {loading ? 'Carregando...' : '✅ Nenhuma chamada pendente'}
          </p>
        )}
        {pendentes.map((c, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 px-3 py-2.5 border border-gray-100 dark:border-gray-700">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                {c.setor ? `${c.setor}` : '—'}
                {c.mesa != null && <span className="ml-1 text-gray-500 font-normal text-xs">· Mesa {c.mesa}</span>}
              </p>
              <p className="text-[10px] text-gray-400 truncate">
                {c.tipo || 'Chamada'}{c.garcom ? ` · ${c.garcom}` : ''}
              </p>
            </div>
            {c.tempoEspera && (
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${tempoColor(c.tempoEspera)}`}>
                {c.tempoEspera}
              </span>
            )}
          </div>
        ))}
        <p className="text-[9px] text-gray-300 dark:text-gray-600 text-center pt-1">Atualiza a cada 15s</p>
      </div>
    </div>
  );
}

const LIDER_AUTH_KEY          = 'hibiscus-lider-auth';
const LIDER_PASSWORD_DEFAULT  = '@Hibiscus';

async function fetchLiderPassword(): Promise<string> {
  try {
    const r = await fetch('/api/goals?type=config');
    const { config } = await r.json();
    return config?.liderPassword ?? LIDER_PASSWORD_DEFAULT;
  } catch { return LIDER_PASSWORD_DEFAULT; }
}

function LiderLogin({ onLogin }: { onLogin: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro,  setErro]  = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const correta = await fetchLiderPassword();
    setLoading(false);
    if (senha === correta) {
      localStorage.setItem(LIDER_AUTH_KEY, 'ok');
      onLogin();
    } else {
      setErro(true);
      setSenha('');
      setTimeout(() => setErro(false), 2000);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <img src="/logo.png" alt="Hibiscus" className="h-10 w-auto mx-auto mb-3 object-contain" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <h1 className="text-lg font-black text-gray-900">App do Líder</h1>
          <p className="text-xs text-gray-400">Hibiscus Beach Club · Atendimento</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Senha de acesso"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            autoFocus
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors ${
              erro
                ? 'border-red-400 ring-red-200 bg-red-50 placeholder-red-400'
                : 'border-gray-200 focus:ring-brand-200 focus:border-brand-400'
            }`}
          />
          {erro && <p className="text-xs text-red-500 text-center font-semibold">Senha incorreta</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 transition-colors">
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
type Aba = 'hoje' | 'escala';

function AvisoCardLider({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const first = text.split('\n').find(l => l.trim()) ?? text;
  return (
    <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-start gap-1.5 px-3 py-2 text-left">
        <span className="shrink-0 mt-0.5">⚠️</span>
        <p className="flex-1 text-xs font-semibold text-amber-900 dark:text-amber-200 truncate">{first}</p>
        <span className="shrink-0 text-amber-500 text-[10px] mt-0.5">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5">
          <p className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-wrap leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}

function AvisosBanner() {
  const { avisos } = useAviso();
  const [dismissed, setDismissed] = useState(false);
  const [tick, setTick] = useState(0);
  const activos = avisos.filter(a => a.active && a.text.trim() && (a.area === 'todos' || a.area === 'lider' || !a.area));
  const compact  = activos.filter(a => a.layout !== 'expandido');
  const expanded = activos.filter(a => a.layout === 'expandido');

  useEffect(() => {
    if (compact.length <= 1) return;
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, [compact.length]);

  if (!activos.length || dismissed) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-300 dark:border-amber-700">
      {compact.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Megaphone size={14} className="text-amber-500 shrink-0" />
          <p className="flex-1 text-sm text-amber-800 dark:text-amber-300 font-medium leading-snug">
            {compact[tick % compact.length]?.text}
          </p>
          {compact.length > 1 && (
            <span className="text-[10px] text-amber-400 shrink-0">{(tick % compact.length) + 1}/{compact.length}</span>
          )}
          <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600 shrink-0">
            <X size={13} />
          </button>
        </div>
      )}
      {expanded.length > 0 && (
        <div className="px-4 pb-2 flex flex-col gap-1.5">
          {expanded.map((a, i) => <AvisoCardLider key={i} text={a.text} />)}
        </div>
      )}
    </div>
  );
}

export function Lider() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(LIDER_AUTH_KEY) === 'ok');
  const [aba, setAba] = useState<Aba>('hoje');

  if (!authed) return <LiderLogin onLogin={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <LayoutDashboard size={20} className="text-brand-600 dark:text-brand-400" />
        <div>
          <h1 className="text-sm font-black text-gray-900 dark:text-white leading-tight">App do Líder</h1>
          <p className="text-[10px] text-gray-400">Hibiscus Beach Club · Atendimento</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Recife' })}
            </p>
            <p className="text-[10px] text-gray-400">
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' })}
            </p>
          </div>
          <button
            onClick={() => { localStorage.removeItem(LIDER_AUTH_KEY); setAuthed(false); }}
            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <AvisosBanner />

      {/* Abas */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex px-4">
        {([
          { id: 'hoje',   label: 'Hoje',          icon: <LayoutDashboard size={14} /> },
          { id: 'escala', label: 'Escala Mensal',  icon: <CalendarDays size={14} /> },
        ] as { id: Aba; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
              aba === t.id
                ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <main className="p-4 max-w-lg mx-auto flex flex-col gap-4 pb-8">
        {aba === 'hoje' && (
          <>
            <BoxEscala />
            <BoxOcupacao />
            <BoxChamadas />
          </>
        )}
        {aba === 'escala' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <CalendarDays size={18} className="text-brand-600 dark:text-brand-400" />
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">Escala Mensal</h2>
            </div>
            <div className="p-4">
              <BoxEscalaMensal />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
