import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import { useSurveyMonkey } from '../hooks/useSurveyMonkey';
import { clearSheetsCache } from '../services/googleSheets';
import { Period, RecentResponse } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertCircle, RefreshCw, Tag, FileDown, CheckSquare, Square, Layers, Users, Plus, X, Pencil } from 'lucide-react';
import clsx from 'clsx';

interface SatisfactionProps { period: Period }

// ── Setores ───────────────────────────────────────────────────────────────────
const SECTORS = [
  'ESTRUTURA', 'ACESSIBILIDADE', 'MANUTENÇÃO', 'A&B', 'ATENDIMENTO',
  'PREÇO', 'RECEPÇÃO', 'RECREAÇÃO', 'BRINDES', 'SERVIÇOS GERAIS',
  'ATRAÇÕES', 'SOM', 'PISCINA', 'SINALIZAÇÃO', 'PRAIA', 'PASSEIO',
  'FILA', 'ANIMAIS',
] as const;

const LS_KEY      = 'hibiscus-sector-tags';
const LS_SEED_KEY = 'hibiscus-sector-tags-seeded-v1';

// Tags pré-classificadas — aplicadas automaticamente na primeira abertura
const SEED_TAGS: Record<string, string[]> = {
  "1342":["ESTRUTURA"],"1363":["ESTRUTURA"],"1369":["ESTRUTURA"],
  "1377":["ESTRUTURA","ATENDIMENTO"],"1385":["ESTRUTURA"],"1449":["ESTRUTURA"],
  "1473":["ESTRUTURA"],"1487":["ESTRUTURA"],"1485":["ESTRUTURA"],
  "1525":["ESTRUTURA"],"1555":["ESTRUTURA"],"1556":["ESTRUTURA"],
  "1577":["MANUTENÇÃO"],
  "1418":["A&B"],"1415":["A&B"],"1468":["A&B"],"1496":["A&B"],
  "1530":["A&B"],"1531":["A&B"],"1534":["A&B"],"1558":["A&B"],
  "1574":["A&B"],"1581":["A&B","ATENDIMENTO"],
  "1372":["ATENDIMENTO"],
  "1368":["PREÇO"],"1402":["PREÇO"],"1423":["PREÇO"],"1405":["PREÇO"],
  "1537":["PREÇO"],"1559":["PREÇO"],"1578":["PREÇO"],
  "1359":["ATRAÇÕES"],"1376":["ATRAÇÕES"],
  "1492":["SOM"],
  "1546":["PISCINA"],
  "1343":["PRAIA"],"1399":["PRAIA"],
};

function seedTagsOnce() {
  if (localStorage.getItem(LS_SEED_KEY)) return;
  const existing: Record<string, string[]> = (() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch { return {}; }
  })();
  const merged = { ...existing };
  for (const [k, v] of Object.entries(SEED_TAGS)) {
    merged[k] = [...new Set([...(merged[k] ?? []), ...v])];
  }
  localStorage.setItem(LS_KEY, JSON.stringify(merged));
  localStorage.setItem(LS_SEED_KEY, '1');
}

function useSectorTags() {
  const [tags, setTags] = useState<Record<string, string[]>>(() => {
    seedTagsOnce();
    try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); }
    catch { return {}; }
  });

  function toggleSector(id: string, sector: string) {
    setTags((prev) => {
      const cur  = prev[id] ?? [];
      const next = cur.includes(sector) ? cur.filter((s) => s !== sector) : [...cur, sector];
      const updated = { ...prev };
      if (next.length === 0) delete updated[id];
      else updated[id] = next;
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  return { tags, toggleSector };
}

// ── Colaboradores ─────────────────────────────────────────────────────────────
const LS_STAFF_KEY = 'hibiscus-staff';

const STAFF_SECTORS = [
  'ATENDIMENTO', 'RECEPÇÃO', 'A&B', 'RECREAÇÃO', 'MANUTENÇÃO',
  'SEGURANÇA', 'LIMPEZA', 'CAIXA', 'COORDENAÇÃO', 'OUTRO',
] as const;

interface StaffMember { id: string; name: string; sector: string; aliases?: string[] }

const LS_STAFF_SEED_KEY = 'hibiscus-staff-seeded-v1';

// Colaboradores identificados via varredura dos comentários do survey
const SEED_STAFF: Omit<StaffMember, 'id'>[] = [
  { name: 'Katherine', sector: 'ATENDIMENTO', aliases: ['catarine', 'catarina', 'katherine'] },
  { name: 'Dudu',      sector: 'ATENDIMENTO' },
  { name: 'Bruno',     sector: 'A&B' },
  { name: 'Carlos',    sector: 'A&B' },
  { name: 'Luciano',   sector: 'A&B' },
];

function useStaff() {
  const [staff, setStaff] = useState<StaffMember[]>(() => {
    // Seed automático na primeira abertura
    if (!localStorage.getItem(LS_STAFF_SEED_KEY)) {
      const seeded = SEED_STAFF.map((m, i) => ({ ...m, id: String(1000 + i) }));
      localStorage.setItem(LS_STAFF_KEY, JSON.stringify(seeded));
      localStorage.setItem(LS_STAFF_SEED_KEY, '1');
      return seeded;
    }
    try { return JSON.parse(localStorage.getItem(LS_STAFF_KEY) ?? '[]'); } catch { return []; }
  });
  function save(list: StaffMember[]) {
    localStorage.setItem(LS_STAFF_KEY, JSON.stringify(list));
    setStaff(list);
  }
  return {
    staff,
    add:    (name: string, sector: string) => save([...staff, { id: Date.now().toString(), name: name.trim(), sector }]),
    remove: (id: string)                   => save(staff.filter(m => m.id !== id)),
    update: (id: string, changes: Partial<StaffMember>) => save(staff.map(m => m.id === id ? { ...m, ...changes } : m)),
  };
}

function staffMentions(responses: RecentResponse[], staff: StaffMember[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const member of staff) {
    // Busca pelo nome principal + todos os aliases (ex: Katherine = catarine, catarina)
    const terms = [
      member.name.split(' ')[0],
      ...(member.aliases ?? []),
    ].filter(t => t.length >= 3);
    if (!terms.length) continue;
    const pattern = terms.map(t => `\\b${t}\\b`).join('|');
    const regex = new RegExp(pattern, 'i');
    const ids = responses.filter(r => regex.test(r.text)).map(r => r.id);
    if (ids.length) result.set(member.id, new Set(ids));
  }
  return result;
}

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

// ── Insights engine (elaborado) ───────────────────────────────────────────────
function generateInsight(text: string, score: number): string {
  const t = text.toLowerCase();

  // ── helpers ──────────────────────────────────────────────────────────────
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  // Detecta tom negativo/sugestão mesmo em promotores (4-5)
  const hasSuggestionTone = has(
    'deveria', 'deveria ter', 'podia', 'poderia', 'falta', 'faltou', 'faltando',
    'melhorar', 'melhora', 'aumentar', 'aumenta', 'diminuir',
    'pouco', 'pouca', 'poucos', 'poucas', 'pequeno', 'pequena',
    'ruim', 'péssimo', 'horrível', 'decepcionante', 'decepcionei',
    'mas ', 'porém', 'entretanto', 'embora', 'apesar', 'só que',
    'só faltou', 'só poderia', 'único problema', 'única coisa',
    'infelizmente', 'lamentavelmente', 'tristeza',
  );

  // ── DETRATORES (1-2) ─────────────────────────────────────────────────────
  if (score <= 2) {
    if (has('cancel', 'reembolso', 'devolução', 'estorno'))
      return `⚠️ Cliente solicita cancelamento ou reembolso. Acione o financeiro imediatamente — processos não resolvidos em 24h frequentemente evoluem para chargeback ou reclamação pública. Verifique o histórico do pedido, confirme o status com a operação e retorne com prazo concreto.`;

    if (has('cobrança', 'cobrado', 'cobranças', 'indevid', 'duplo', 'duplicad'))
      return `⚠️ Cobrança indevida ou duplicada detectada. Prioridade máxima: revise o extrato do cliente, identifique a origem do erro e inicie o estorno proativamente antes que o cliente acione o banco. Um contato proativo com "já estamos resolvendo" reduz drasticamente o risco de chargeback.`;

    if (has('demora', 'esperou', 'espera', 'fila', 'lento', 'demorou', 'atrasou', 'tempo'))
      return `⚠️ Reclamação de tempo de espera excessivo. Mapeie o ponto de gargalo: foi na entrada, no A&B ou no atendimento geral? Considere implementar painel de chamada, contratação reforçada em horários de pico (12h–14h e 16h–18h) e comunicação proativa ao cliente sobre o tempo estimado.`;

    if (has('sujo', 'limpeza', 'banheiro', 'higiene', 'imundo', 'lixo', 'cheiro'))
      return `⚠️ Problema de higiene ou limpeza relatado. Notifique a equipe de manutenção agora e revise o checklist de abertura diária. Limpeza é um item crítico de percepção — um único relato negativo pode ser amplificado em redes sociais. Considere inspeção surpresa durante o horário de pico.`;

    if (has('manutenção', 'quebrado', 'estragado', 'não funciona', 'danificado', 'estrutura'))
      return `⚠️ Falha de infraestrutura ou manutenção relatada. Acione o responsável de manutenção com prioridade e registre o problema no sistema para acompanhamento. Itens quebrados ou fora de funcionamento afetam a percepção de qualidade e podem representar risco à segurança.`;

    if (has('rude', 'grosseiro', 'mal atendido', 'sem educação', 'ignorado', 'descaso', 'desrespeito'))
      return `⚠️ Relato de atendimento inadequado ou desrespeitoso. Identifique o colaborador envolvido com base na pulseira e horário, aplique feedback imediato e comunique o cliente que a ocorrência foi tratada. Falhas de atendimento são as que mais geram comentários negativos públicos.`;

    if (has('preço', 'caro', 'valor', 'custo', 'salgado', 'abusivo', 'cobrado demais'))
      return `⚠️ Percepção de preço alto sem valor percebido equivalente. Avalie se o cliente teve a experiência completa ou se houve alguma falha que reduz a percepção de valor. Considere criar combos ou benefícios exclusivos para clientes com histórico de reclamação de preço — converter detratores por preço é mais fácil quando acompanhado de uma vantagem concreta.`;

    if (has('música', 'barulho', 'som', 'ruído', 'alto demais', 'insuportável'))
      return `⚠️ Volume ou tipo de música inadequado. Verifique se o nível de decibéis está dentro do padrão e se o estilo musical é compatível com o público no horário. Crie zonas de volume diferenciado se possível — áreas de lounge tendem a aceitar menos intensidade sonora.`;

    return `⚠️ Avaliação crítica (nota ${score}/5). Entre em contato com o cliente em até 2 horas via WhatsApp ou e-mail, reconheça o problema, apresente uma solução concreta e ofereça um benefício de retorno (cortesia, desconto). Detratores que recebem atenção rápida têm 70% de chance de se tornarem neutros ou promotores.`;
  }

  // ── NEUTROS (3) ──────────────────────────────────────────────────────────
  if (score === 3) {
    if (has('estacionamento', 'vagas', 'parcar', 'parking'))
      return `💡 Dificuldade de estacionamento mencionada. Clientes que chegam estressados com o estacionamento chegam com a experiência já comprometida. Avalie convênio com estacionamento próximo com shuttle, sinalize melhor as vagas disponíveis e informe antecipadamente por WhatsApp antes da visita.`;

    if (has('drink', 'bebida', 'cardápio', 'opções', 'comida', 'refeição', 'porção', 'prato', 'menu'))
      return `💡 Feedback sobre A&B (alimentos e bebidas). Analise se a reclamação é sobre variedade, tamanho de porção, tempo de preparo ou relação qualidade-preço. Clientes neutros em A&B são convertidos facilmente com uma nova opção no cardápio ou uma promoção de happy hour — considere pesquisa rápida sobre o que gostariam de ver.`;

    if (has('cheio', 'lotado', 'multidão', 'movimento', 'apertado', 'superlotado'))
      return `💡 Percepção de superlotação. Implemente comunicação prévia sobre dias/horários alternativos com menos movimento. Considere sistema de reserva por faixas de horário para distribuir o fluxo. Clientes que gostam mas se incomodam com lotação são exatamente os que voltariam mais fidelizados com mais conforto.`;

    if (has('criança', 'kids', 'família', 'infantil', 'filho', 'filhos', 'bebê'))
      return `💡 Cliente veio com família ou crianças. Famílias com crianças têm alta recorrência quando se sentem bem acolhidas. Avalie se a estrutura kids está adequada (brinquedos, sombreamento, cardápio kids) e se os colaboradores estão treinados para atender esse público com paciência e atenção.`;

    if (has('sinalização', 'placa', 'perdido', 'difícil achar', 'não sabia', 'acesso'))
      return `💡 Dificuldade de orientação ou acesso. Revise a sinalização visual na entrada e dentro do espaço. Considere enviar um mapa ou vídeo curto de "como chegar e o que esperar" via WhatsApp antes da visita — reduz frustração e melhora a primeira impressão significativamente.`;

    if (has('barulho', 'música', 'ruído', 'som alto', 'agitado'))
      return `💡 Nível de som ou agitação acima do esperado pelo cliente. Crie uma zona quiet/relax no espaço para clientes que preferem ambiente mais tranquilo. Comunicar previamente o perfil do dia (animado, família, show) ajuda o cliente a escolher o melhor momento para sua preferência.`;

    return `💡 Cliente neutro (nota 3/5) — a distância para promotor é pequena. Um contato personalizado nos próximos dias (ex: "Obrigado pela visita! Como podemos melhorar sua próxima experiência?") pode revelar a objeção específica e converter para nota 5 na próxima visita. Ofereça um benefício surpresa na próxima reserva.`;
  }

  // ── PROMOTORES (4-5) ─────────────────────────────────────────────────────

  // Promotor com sugestão/crítica embutida — tratar como oportunidade de melhoria
  if (hasSuggestionTone) {
    // Estrutura/manutenção física — verificar antes de tópicos genéricos como "comida"
    if (has('repintar', 'pintura', 'tinta', 'madeira', 'deck', 'corrimão', 'grade', 'ferrugem',
             'reforma', 'renovar', 'estrutura', 'instalação', 'instalações', 'construção',
             'piscina', 'azulejo', 'rachado', 'quebrado', 'danificado', 'descascad'))
      return `⭐ Promotor que adorou a experiência e faz uma sugestão de melhoria na infraestrutura. Este tipo de feedback é ouro — vem de quem quer voltar e quer que o espaço seja ainda melhor. Encaminhe ao responsável de manutenção com a descrição exata do cliente e avalie incluir no próximo planejamento de obras.`;

    if (has('porção', 'pouca quantidade', 'quantidade pequena', 'serve pouco', 'pequena demais'))
      return `⭐ Promotor com sugestão sobre tamanho de porção. O cliente gostou da comida mas sentiu que a quantidade não justifica o valor ou a expectativa. Leve ao chef — uma revisão no tamanho padrão ou uma opção "porção maior" pode eliminar esse ponto de atrito sem grandes custos.`;

    if (has('cardápio', 'opções', 'variedade', 'opção vegetarian', 'sem glúten', 'diet', 'light'))
      return `⭐ Promotor sugerindo ampliação do cardápio. O A&B agradou mas o cliente sentiu falta de mais variedade ou opções específicas. Pesquise internamente quais restrições alimentares são mais comuns entre os clientes e avalie incluir pelo menos uma opção nova no próximo ciclo do cardápio.`;

    if (has('fila', 'demora', 'espera', 'demorou', 'lento', 'atrasou', 'demorado'))
      return `⭐ Promotor impactado pelo tempo de espera, mesmo gostando da experiência. Um cliente assim está a um passo de não voltar se a fila se repetir. Mapeie o ponto de gargalo (entrada, pedido, entrega) e priorize uma solução para os horários de pico — mesmo uma comunicação prévia do tempo estimado já melhora a percepção.`;

    if (has('preço', 'caro', 'valor', 'custo', 'salgado', 'cobrado', 'taxa'))
      return `⭐ Promotor com ressalva sobre custo. Aproveitou a visita mas sentiu desconforto com o valor. A solução raramente é baixar preço — é aumentar o valor percebido. Avalie comunicar melhor o que está incluído no ticket e considere criar um combo ou benefício exclusivo para quem reserva com antecedência.`;

    if (has('estacionamento', 'vagas', 'parcar', 'parking', 'carro'))
      return `⭐ Promotor com atrito no estacionamento. A experiência interna foi positiva, mas a chegada/saída criou frustração. Avalie parceria com estacionamento próximo, melhore a sinalização de acesso e informe previamente as opções de estacionamento no WhatsApp de confirmação da reserva.`;

    if (has('barulho', 'música', 'som', 'ruído', 'alto demais', 'volume'))
      return `⭐ Promotor que gostou mas achou o som acima do confortável. Clientes nesse perfil geralmente preferem ambiente mais tranquilo — crie uma zona "relax" com volume reduzido. Comunicar previamente o estilo do dia (animado, show, família) também ajuda o cliente a escolher o momento certo.`;

    if (has('limpeza', 'banheiro', 'higiene', 'sujo', 'cheiro'))
      return `⭐ Promotor que notou ponto de limpeza abaixo do esperado. Mesmo com boa experiência geral, a higiene ficou marcada negativamente. Reforce o checklist de manutenção contínua — especialmente em dias de pico — e garanta que banheiros sejam inspecionados a cada hora.`;

    return `⭐ Promotor com sugestão de melhoria (nota ${score}/5). Quem dá nota alta E ainda sugere algo quer ver o lugar melhorar — é o cliente mais valioso. Leia o comentário integralmente, identifique o ponto exato da crítica e registre internamente para o próximo ciclo de melhorias.`;
  }

  if (has('google', 'trip', 'tripadvisor', 'instagram', '@hibiscus', 'rede social', 'indicar', 'recomendar', 'postei', 'publiquei'))
    return `⭐ Cliente menciona redes sociais ou indicação espontânea — enorme valor de marketing. Envie imediatamente um link direto para avaliação no Google Maps e peça que compartilhe a experiência. Este é o perfil de embaixador da marca — considere convidá-lo para ação exclusiva (evento, lista VIP, degustação).`;

  if (has('voltarei', 'voltar', 'retorn', 'próxima', 'de novo', 'próxima vez', 'nova visita', 'com certeza voltamos'))
    return `⭐ Cliente expressa intenção clara de retorno — altíssimo potencial de fidelização. Acione o programa de fidelidade ou ofereça antecipadamente um benefício para a próxima visita (reserva prioritária, upgrade, brinde). Clientes que declaram intenção de retorno têm 3x mais chance de voltar quando recebem um incentivo concreto.`;

  if (has('atendimento', 'funcionário', 'equipe', 'staff', 'pessoal', 'colaborador', 'simpáticos', 'atenciosos', 'prestativos', 'educados'))
    return `⭐ Elogio específico ao atendimento — reconheça publicamente a equipe mencionada. Identifique o(s) colaborador(es) com base na pulseira e horário e compartilhe o feedback positivo com eles e com a liderança. Colaboradores reconhecidos por nome têm performance até 23% melhor em atendimento.`;

  if (has('comida', 'bebida', 'drink', 'cardápio', 'refeição', 'prato', 'delicioso', 'gostoso', 'saboroso', 'fresco', 'gelado'))
    return `⭐ Elogio ao A&B — ótima oportunidade para destacar o diferencial. Use este depoimento (com permissão) nas redes sociais do A&B/restaurante. Envie o cardápio atualizado ou novidades ao cliente para incentivá-lo a retornar especificamente pelo food experience.`;

  if (has('praia', 'mar', 'areia', 'vista', 'paisagem', 'natureza', 'lindo', 'bonito', 'maravilhoso', 'paradisíaco'))
    return `⭐ Encantamento com o ambiente/paisagem — este é o gatilho emocional mais forte. Solicite autorização para usar a avaliação em materiais de marketing e peça uma foto da visita para repost nas redes. Clientes que conectam emocionalmente com o espaço têm o maior NPS de longo prazo.`;

  if (has('família', 'criança', 'kids', 'filho', 'filhos', 'bebê'))
    return `⭐ Família satisfeita — perfil de alta recorrência. Envie informações sobre próximos eventos kids ou fins de semana temáticos. Famílias satisfeitas indicam para outras famílias em grupos de WhatsApp e escola — o boca a boca nesse segmento é muito poderoso.`;

  return `⭐ Promotor ativo (nota ${score}/5). Aproveite o momento de satisfação: envie agora o link do Google Maps para avaliação e um agradecimento personalizado. Este cliente tem alta probabilidade de indicar espontaneamente — nutra essa relação com uma comunicação próxima e antecipada sobre novidades.`;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const sentimentStyle: Record<string, string> = {
  positive: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  negative: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  neutral:  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};
const sentimentLabel: Record<string, string> = {
  positive: 'Arretado', negative: 'Putz', neutral: 'Oxente',
};
const scoreColor = (s: number) =>
  s >= 4 ? 'bg-green-500' : s === 3 ? 'bg-yellow-400' : 'bg-red-500';

type FilterTab = 'all' | 'positive' | 'neutral' | 'negative';

const filterTabs: { value: FilterTab; label: string; color: string }[] = [
  { value: 'all',      label: 'Todos',             color: 'bg-brand-600' },
  { value: 'positive', label: 'Arretados',          color: 'bg-green-500' },
  { value: 'neutral',  label: 'Oxente',   color: 'bg-yellow-400' },
  { value: 'negative', label: 'Putz',               color: 'bg-red-500'   },
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
  tags: Record<string, string[]>,
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

  const hex = (h: string) => {
    const r = parseInt(h.slice(1,3),16);
    const g = parseInt(h.slice(3,5),16);
    const b = parseInt(h.slice(5,7),16);
    return [r,g,b] as [number,number,number];
  };
  const wrap = (text: string, maxW: number, size: number): string[] => {
    doc.setFontSize(size);
    return doc.splitTextToSize(text, maxW);
  };

  let y = 14;

  doc.setFillColor(...hex('#7c3aed'));
  doc.rect(0, 0, W, 2, 'F');
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hex('#7c3aed'));
  doc.text('Hibiscus Beach Club', ML, y + 10);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...hex('#6b7280'));
  doc.text('Relatório de Avaliações de Clientes', ML, y + 16);
  doc.setFontSize(8);
  doc.setTextColor(...hex('#9ca3af'));
  doc.text(`Gerado em ${now}`, W - MR, y + 10, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hex('#374151'));
  doc.text(`Período: ${periodLabel(period)}`, W - MR, y + 16, { align: 'right' });
  y += 24;

  doc.setDrawColor(...hex('#e5e7eb'));
  doc.setLineWidth(0.4);
  doc.line(ML, y, W - MR, y);
  y += 6;

  const statCards = [
    { label: 'NPS Score',          value: String(npsScore),    bg: '#f5f3ff', color: npsScore >= 50 ? '#16a34a' : npsScore >= 0 ? '#d97706' : '#dc2626' },
    { label: 'Arretados',          value: `${promoters}%`,     bg: '#f0fdf4', color: '#16a34a' },
    { label: 'Oxente',   value: `${neutrals}%`,      bg: '#fefce8', color: '#ca8a04' },
    { label: 'Putz',              value: `${detractors}%`,    bg: '#fef2f2', color: '#dc2626' },
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

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hex('#374151'));
  doc.text(`${selected.length} avaliação${selected.length !== 1 ? 'ões' : ''} selecionada${selected.length !== 1 ? 's' : ''}`, ML, y);
  y += 6;

  const sentColors: Record<string, string> = { positive: '#16a34a', negative: '#dc2626', neutral: '#4b5563' };
  const sentBg: Record<string, string>     = { positive: '#dcfce7', negative: '#fee2e2', neutral: '#f3f4f6' };
  const sentLabels: Record<string, string> = { positive: 'Promotor', negative: 'Detrator', neutral: 'Neutro' };
  const scoreBg = (s: number) => s >= 4 ? '#22c55e' : s === 3 ? '#eab308' : '#ef4444';

  for (const r of selected) {
    const responseTags = tags[String(r.rowIndex)] ?? [];
    const textLines    = wrap(r.text || 'Sem comentário', CW - 22, 9);
    const tagsLine     = responseTags.join(' · ');
    const cardH        = 10 + textLines.length * 4.5 + (tagsLine ? 10 : 0) + 8;

    if (y + cardH > 280) { doc.addPage(); y = 14; }

    doc.setFillColor(...hex('#f9fafb'));
    doc.setDrawColor(...hex('#e5e7eb'));
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, cardH, 2, 2, 'FD');

    doc.setFillColor(...hex(scoreBg(r.score)));
    doc.circle(ML + 6, y + 6, 4.5, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(String(r.score), ML + 6, y + 7.5, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hex('#374151'));
    doc.text(textLines, ML + 14, y + 5);

    const badgeY = y + textLines.length * 4.5 + 5;
    const badgeW = 18;
    doc.setFillColor(...hex(sentBg[r.sentiment]));
    doc.roundedRect(ML + 14, badgeY - 3.5, badgeW, 5, 1, 1, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hex(sentColors[r.sentiment]));
    doc.text(sentLabels[r.sentiment], ML + 14 + badgeW / 2, badgeY, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hex('#9ca3af'));
    doc.text(r.date, ML + 36, badgeY);

    if (r.pulseira) {
      doc.setTextColor(...hex('#7c3aed'));
      doc.setFont('helvetica', 'bold');
      doc.text(`#${r.pulseira}`, ML + 60, badgeY);
    }

    if (tagsLine) {
      const tagY = badgeY + 6;
      doc.setFillColor(...hex('#ede9fe'));
      doc.roundedRect(ML + 14, tagY - 3.5, Math.min(doc.getTextWidth(tagsLine) + 6, CW - 20), 5, 1, 1, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hex('#7c3aed'));
      doc.text(tagsLine, ML + 17, tagY, { maxWidth: CW - 24 });
    }

    y += cardH + 3;
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hex('#9ca3af'));
    doc.text(`Hibiscus Beach Club · Dashboard Integrado · ${now}  |  Pág. ${p}/${pageCount}`, W / 2, 293, { align: 'center' });
    doc.setDrawColor(...hex('#e5e7eb'));
    doc.setLineWidth(0.3);
    doc.line(ML, 290, W - MR, 290);
  }

  doc.save(`avaliacoes-hibiscus-${new Date().toISOString().slice(0,10)}.pdf`);
}

// ── Sector Dropdown (portal para escapar do overflow-hidden) ──────────────────
function SectorDropdown({
  responseId, selected, onToggle,
}: { responseId: string; selected: string[]; onToggle: (s: string) => void }) {
  const [open, setOpen]       = useState(false);
  const [coords, setCoords]   = useState({ top: 0, left: 0 });
  const btnRef                = useRef<HTMLButtonElement>(null);
  const dropRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // position dropdown to the left of the button, aligned to its top
      setCoords({ top: r.top + window.scrollY, left: r.left - 196 });
    }
    setOpen((o) => !o);
  }

  const dropdown = open ? createPortal(
    <div
      ref={dropRef}
      style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl w-48 py-1 max-h-72 overflow-y-auto"
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
        Direcionar para setor
      </p>
      {SECTORS.map((s) => {
        const active = selected.includes(s);
        return (
          <button
            key={s}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onToggle(s)}
            className={clsx(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left',
              active
                ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-semibold'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
            )}
          >
            <span className={clsx(
              'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
              active ? 'bg-violet-600 border-violet-600' : 'border-gray-300 dark:border-gray-500',
            )}>
              {active && <span className="text-white text-[8px] font-bold">✓</span>}
            </span>
            {s}
          </button>
        );
      })}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className={clsx(
          'flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-colors',
          selected.length > 0
            ? 'bg-violet-600 text-white'
            : open
              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:text-violet-700',
        )}
        title="Classificar por setor"
      >
        <Layers size={11} />
        {selected.length > 0 ? <span>{selected.length}</span> : <span>setor</span>}
      </button>
      {dropdown}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function Satisfaction({ period }: SatisfactionProps) {
  const { data, loading, error } = useSurveyMonkey(period);
  const { tags, toggleSector }               = useSectorTags();
  const { staff, add: addStaff, remove: removeStaff, update: updateStaff } = useStaff();
  const [activeFilter, setActiveFilter]      = useState<FilterTab>('all');
  const [sectorFilter, setSectorFilter]      = useState<string>('');
  const [staffFilter, setStaffFilter]        = useState<string>('');
  const [staffEditMode, setStaffEditMode]    = useState(false);
  const [newStaffName, setNewStaffName]      = useState('');
  const [newStaffSector, setNewStaffSector]  = useState<string>(STAFF_SECTORS[0]);
  const [editingStaffId, setEditingStaffId]  = useState<string | null>(null);
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set());
  const [retrying, setRetrying]                 = useState(false);
  const [sectorFilterOpen, setSectorFilterOpen] = useState(false);
  const sectorFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sectorFilterRef.current && !sectorFilterRef.current.contains(e.target as Node))
        setSectorFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const distribution = useMemo(() => data ? [
    { label: 'Arretados',        pct: data.promoters,  color: '#22c55e' },
    { label: 'Oxente', pct: data.neutrals,   color: '#f59e0b' },
    { label: 'Putz',             pct: data.detractors, color: '#ef4444' },
  ] : [], [data]);

  const allResponses     = useMemo(() => data?.recentResponses    ?? [], [data]);
  const allTimeResponses = useMemo(() => data?.allTimeResponses   ?? [], [data]);
  const periodTotal  = data?.surveys[0]?.responses ?? 0;

  const mentions = useMemo(() => staffMentions(allTimeResponses, staff), [allTimeResponses, staff]);

  const staffRanking = useMemo(() => staff
    .map(m => ({ ...m, count: mentions.get(m.id)?.size ?? 0 }))
    .sort((a, b) => b.count - a.count),
  [staff, mentions]);

  const filtered = useMemo(() => {
    // Quando há filtro de setor ou colaborador, busca em TODOS os dados (ignora período)
    const base = (sectorFilter || staffFilter) ? allTimeResponses : allResponses;
    let list = activeFilter === 'all'
      ? base
      : base.filter((r) => r.sentiment === activeFilter);
    if (sectorFilter) list = list.filter((r) => (tags[String(r.rowIndex)] ?? []).includes(sectorFilter));
    if (staffFilter) {
      const ids = mentions.get(staffFilter) ?? new Set();
      list = list.filter(r => ids.has(r.id));
    }
    return list;
  }, [allResponses, allTimeResponses, activeFilter, sectorFilter, staffFilter, tags, mentions]);

  const counts = useMemo(() => ({
    all:      allResponses.length,
    positive: allResponses.filter((r) => r.sentiment === 'positive').length,
    neutral:  allResponses.filter((r) => r.sentiment === 'neutral').length,
    negative: allResponses.filter((r) => r.sentiment === 'negative').length,
  }), [allResponses]);

  const sectorCounts = useMemo(() => {
    const cnt: Record<string, number> = {};
    Object.values(tags).forEach((sectors) => sectors.forEach((s) => { cnt[s] = (cnt[s] ?? 0) + 1; }));
    return cnt;
  }, [tags]);

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => { const n = new Set(prev); filtered.forEach((r) => n.delete(r.id)); return n; });
    } else {
      setSelectedIds((prev) => { const n = new Set(prev); filtered.forEach((r) => n.add(r.id)); return n; });
    }
  }

  function handleExportPDF() {
    const selected = allResponses.filter((r) => selectedIds.has(r.id));
    exportToPDF(selected, period, data?.npsScore ?? 0, data?.promoters ?? 0, data?.neutrals ?? 0, data?.detractors ?? 0, periodTotal, tags);
  }

  const selectedCount = selectedIds.size;
  const taggedTotal   = Object.keys(tags).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-3 shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Satisfação — Pesquisa Hibiscus</h2>
      </div>

      {error && !loading && (
        <div className="mx-6 mb-3 shrink-0">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
            <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Erro ao carregar satisfação</p>
              <p className="text-xs text-red-600 dark:text-red-500 mt-0.5 break-words">{error}</p>
            </div>
            <button onClick={handleRetry} disabled={retrying}
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-800/40 text-red-700 dark:text-red-300 hover:bg-red-200 transition-colors disabled:opacity-50">
              <AlertCircle size={12} className={clsx(retrying && 'animate-spin')} />
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-4 px-6 pb-6">

        {/* Coluna esquerda */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">NPS Score</h3>
            {loading ? <div className="h-32 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
              <>
                <NPSGauge score={data?.npsScore ?? 0} />
                <div className="grid grid-cols-3 gap-1 mt-2 text-center text-xs border-t border-gray-100 dark:border-gray-700 pt-3">
                  <div><div className="text-lg font-bold text-green-600">{data?.promoters}%</div><div className="text-gray-400">Arretados</div></div>
                  <div><div className="text-lg font-bold text-yellow-500">{data?.neutrals}%</div><div className="text-gray-400 text-[10px]">Oxente</div></div>
                  <div><div className="text-lg font-bold text-red-500">{data?.detractors}%</div><div className="text-gray-400">Putz</div></div>
                </div>
              </>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Distribuição</h3>
            {loading ? <div className="h-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
              <div className="space-y-3">
                {distribution.map((d) => (
                  <div key={d.label} className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400"><span>{d.label}</span><span>{d.pct}%</span></div>
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

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Pesquisas Ativas</h3>
            {loading ? <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /> : (
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
                    {counts.all < s.responses && (<>
                      <div className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-600 flex justify-between text-[10px] text-gray-400">
                        <span>Com comentário</span><span className="font-medium text-gray-600 dark:text-gray-300">{counts.all}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                        <span>Só nota</span><span className="font-medium text-gray-600 dark:text-gray-300">{s.responses - counts.all}</span>
                      </div>
                    </>)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Painel Por Setor */}
          {taggedTotal > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Por Setor
                <span className="ml-1.5 text-[10px] font-normal normal-case text-gray-400">({taggedTotal} classificadas)</span>
              </h3>
              <div className="space-y-1">
                {SECTORS.filter((s) => sectorCounts[s]).map((s) => (
                  <button key={s}
                    onClick={() => setSectorFilter((f) => f === s ? '' : s)}
                    className={clsx(
                      'w-full flex items-center justify-between px-2 py-1 rounded-lg text-xs transition-colors',
                      sectorFilter === s
                        ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-semibold'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400',
                    )}
                  >
                    <span>{s}</span>
                    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                      sectorFilter === s ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500')}>
                      {sectorCounts[s]}
                    </span>
                  </button>
                ))}
                {sectorFilter && (
                  <button onClick={() => setSectorFilter('')} className="w-full text-center text-[10px] text-gray-400 hover:text-gray-600 pt-1 transition-colors">
                    Limpar filtro
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Painel Colaboradores */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users size={12} /> Colaboradores
                {staff.length > 0 && <span className="font-normal normal-case text-gray-400">({staff.length})</span>}
              </h3>
              <button onClick={() => setStaffEditMode(m => !m)}
                className={clsx('text-[10px] px-2 py-0.5 rounded-lg font-medium transition-colors',
                  staffEditMode ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-violet-100 hover:text-violet-700')}>
                {staffEditMode ? 'Concluir' : 'Editar lista'}
              </button>
            </div>

            {staffEditMode && (
              <div className="mb-3 space-y-2">
                <div className="flex gap-1">
                  <input
                    value={newStaffName}
                    onChange={e => setNewStaffName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newStaffName.trim()) { addStaff(newStaffName, newStaffSector); setNewStaffName(''); } }}
                    placeholder="Nome do colaborador"
                    className="flex-1 text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-violet-400"
                  />
                  <button
                    onClick={() => { if (newStaffName.trim()) { addStaff(newStaffName, newStaffSector); setNewStaffName(''); } }}
                    className="shrink-0 px-2 py-1 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 transition-colors">
                    <Plus size={12} />
                  </button>
                </div>
                <select
                  value={newStaffSector}
                  onChange={e => setNewStaffSector(e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-violet-400">
                  {STAFF_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {staff.length === 0 && !staffEditMode && (
              <p className="text-[11px] text-gray-400 text-center py-3">Clique em "Editar lista" para adicionar colaboradores e detectar menções nos comentários.</p>
            )}

            <div className="space-y-1">
              {staffRanking.map((m, i) => (
                <div key={m.id}>
                  {staffEditMode && editingStaffId === m.id ? (
                    <div className="flex gap-1 items-center">
                      <input
                        defaultValue={m.name}
                        onBlur={e => {
                          // Não fecha se o foco foi para o select ou botão da mesma linha
                          const rel = e.relatedTarget as HTMLElement | null;
                          if (rel && (rel.tagName === 'SELECT' || rel.tagName === 'BUTTON')) return;
                          updateStaff(m.id, { name: e.target.value.trim() });
                          setEditingStaffId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { updateStaff(m.id, { name: (e.target as HTMLInputElement).value.trim() }); setEditingStaffId(null); }
                          if (e.key === 'Escape') setEditingStaffId(null);
                        }}
                        autoFocus
                        className="flex-1 text-xs px-2 py-0.5 rounded border border-violet-400 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none"
                      />
                      <select
                        value={m.sector}
                        onChange={e => updateStaff(m.id, { sector: e.target.value })}
                        className="text-[10px] px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 focus:outline-none">
                        {STAFF_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button
                        tabIndex={-1}
                        onClick={() => removeStaff(m.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"><X size={12} /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => !staffEditMode && setStaffFilter(f => f === m.id ? '' : m.id)}
                      onDoubleClick={() => staffEditMode && setEditingStaffId(m.id)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors',
                        staffFilter === m.id
                          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-semibold'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400',
                      )}>
                      <span className="text-[10px] font-bold text-gray-300 w-4 text-right shrink-0">{i + 1}</span>
                      <span className="flex-1 text-left truncate font-medium">{m.name}</span>
                      <span className={clsx('text-[9px] px-1 py-0.5 rounded font-semibold shrink-0',
                        m.sector === 'ATENDIMENTO' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                        m.sector === 'A&B'         ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                        m.sector === 'RECEPÇÃO'    ? 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' :
                        'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400')}>
                        {m.sector}
                      </span>
                      {m.count > 0 && (
                        <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0',
                          staffFilter === m.id ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500')}>
                          {m.count}
                        </span>
                      )}
                      {staffEditMode && (
                        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setEditingStaffId(m.id); }}
                          className="shrink-0 text-gray-300 hover:text-violet-500 transition-colors"><Pencil size={10} /></button>
                      )}
                    </button>
                  )}
                </div>
              ))}
              {staffFilter && !staffEditMode && (
                <button onClick={() => setStaffFilter('')} className="w-full text-center text-[10px] text-gray-400 hover:text-gray-600 pt-1 transition-colors">
                  Limpar filtro
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Coluna direita */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
            <div className="flex items-center gap-3">
              {!loading && filtered.length > 0 && (
                <button onClick={toggleSelectAll} className="text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  title={allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos'}>
                  {allFilteredSelected ? <CheckSquare size={17} className="text-brand-600 dark:text-brand-400" /> : <Square size={17} />}
                </button>
              )}
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Respostas dos Clientes
                {!loading && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {counts[activeFilter]} com comentário
                    {activeFilter === 'all' && periodTotal > counts.all ? ` · ${periodTotal - counts.all} só nota` : ''}
                  </span>
                )}
              </h3>
            </div>
            {!loading && (
              <div className="flex items-center gap-2 flex-wrap">
                {filterTabs.map((tab) => (
                  <button key={tab.value} onClick={() => setActiveFilter(tab.value)}
                    className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
                      activeFilter === tab.value
                        ? `${tab.color} text-white shadow-sm`
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600')}>
                    {tab.label}
                    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                      activeFilter === tab.value ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600')}>
                      {counts[tab.value]}
                    </span>
                  </button>
                ))}

                {/* Filtro setor */}
                <div ref={sectorFilterRef} className="relative">
                  <button onClick={() => setSectorFilterOpen((o) => !o)}
                    className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
                      sectorFilter
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600')}>
                    <Layers size={11} />
                    {sectorFilter || 'Setor'}
                    {sectorFilter && (
                      <span onClick={(e) => { e.stopPropagation(); setSectorFilter(''); }} className="ml-0.5 opacity-70 hover:opacity-100 font-bold">×</span>
                    )}
                  </button>
                  {sectorFilterOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl w-48 py-1 max-h-72 overflow-y-auto">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-1.5 border-b border-gray-100 dark:border-gray-700">Filtrar por setor</p>
                      {SECTORS.map((s) => (
                        <button key={s} onClick={() => { setSectorFilter((f) => f === s ? '' : s); setSectorFilterOpen(false); }}
                          className={clsx('w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors',
                            sectorFilter === s
                              ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-semibold'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700')}>
                          {s}
                          {sectorCounts[s] ? <span className="text-[10px] text-gray-400">{sectorCounts[s]}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {staffFilter && (() => {
                  const m = staff.find(s => s.id === staffFilter);
                  return m ? (
                    <button onClick={() => setStaffFilter('')}
                      className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-violet-600 text-white shadow-sm">
                      <Users size={11} /> {m.name} <span className="opacity-70 font-bold">×</span>
                    </button>
                  ) : null;
                })()}

                {selectedCount > 0 && (
                  <button onClick={handleExportPDF}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-500 hover:bg-green-600 text-white shadow-sm transition-colors">
                    <FileDown size={13} />
                    Exportar PDF ({selectedCount})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-16">
                {sectorFilter ? `Nenhuma avaliação classificada como "${sectorFilter}" neste filtro.` : 'Nenhuma resposta nesta categoria para o período selecionado.'}
              </p>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => {
                  const insight         = generateInsight(r.text, r.score);
                  const insightExpanded = expandedInsights.has(r.id);
                  const isSelected      = selectedIds.has(r.id);
                  const responseTags    = tags[String(r.rowIndex)] ?? [];
                  return (
                    <div key={r.id}
                      className={clsx('rounded-xl border transition-all',
                        isSelected
                          ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-300 dark:ring-brand-600'
                          : 'border-gray-100 dark:border-gray-700')}>

                      {/* Linha principal */}
                      <div className={clsx('flex gap-3 p-3 rounded-t-xl', isSelected ? 'bg-brand-50 dark:bg-brand-900/20' : 'bg-gray-50 dark:bg-gray-700/50',
                        !insightExpanded && 'rounded-b-xl')}>
                        <button onClick={() => toggleSelect(r.id)}
                          className="shrink-0 self-start mt-0.5 text-gray-300 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
                          title={isSelected ? 'Desmarcar' : 'Selecionar para exportar'}>
                          {isSelected ? <CheckSquare size={16} className="text-brand-600 dark:text-brand-400" /> : <Square size={16} />}
                        </button>

                        <div className={clsx('shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white', scoreColor(r.score))}>
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
                            {responseTags.map((s) => (
                              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => toggleInsight(r.id)}
                            className={clsx('text-xs px-2 py-1 rounded-lg font-medium transition-colors',
                              insightExpanded
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-brand-100 dark:hover:bg-brand-900/30')}
                            title="Ver sugestão de ação">
                            💡
                          </button>
                          <SectorDropdown
                            responseId={String(r.rowIndex)}
                            selected={responseTags}
                            onToggle={(sector) => toggleSector(String(r.rowIndex), sector)}
                          />
                        </div>
                      </div>

                      {/* Painel insight */}
                      {insightExpanded && (
                        <div className="px-4 py-3 bg-brand-50 dark:bg-brand-900/20 border-t border-brand-100 dark:border-brand-800 rounded-b-xl">
                          <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 mb-1.5">Sugestão de ação</p>
                          <p className="text-sm text-brand-800 dark:text-brand-200 leading-relaxed">{insight}</p>
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
