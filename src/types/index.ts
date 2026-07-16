// Presets: 'today' | '7d' | '30d' | '90d' | 'month'
// Custom range: 'custom:YYYY-MM-DD:YYYY-MM-DD'
export type Period = string;

// Paytour
export interface SalesByDay {
  date: string;
  revenue: number;
  count: number;
}

export interface SalesByChannel {
  channel: string;
  count: number;
  revenue: number;
}

export interface TopProduct {
  name: string;
  sales: number;
  revenue: number;
  change: number;
}

export interface PaytourData {
  totalRevenue: number;
  totalSales: number;       // pedidos (reservas)
  totalItems: number;       // atividades vendidas (itens)
  averageTicket: number;
  conversionRate: number;
  cancellations: number;
  todayRevenue: number;
  todayOrders: number;
  todayItems: number;       // atividades vendidas hoje
  salesByDay: SalesByDay[];
  salesByChannel: SalesByChannel[];
  topProducts: TopProduct[];
  previousPeriodRevenue: number;
  reservationStatus: {
    confirmed: number;
    pending: number;
    cancelled: number;
  };
}

// SurveyMonkey
export interface NpsHistoryEntry {
  month: string;
  score: number;
}

export interface RecentResponse {
  id: string;
  rowIndex: number;
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  date: string;
  score: number;
  pulseira?: string;
  nome?: string;
  email?: string;
}

export interface Survey {
  name: string;
  responses: number;
  rate: number;
}

export interface SurveyMonkeyData {
  npsScore: number;
  avgScore: number;        // média das notas no período, escala 0–5
  promoters: number;
  neutrals: number;
  detractors: number;
  responseRate: number;
  totalResponses: number;
  npsHistory: NpsHistoryEntry[];
  recentResponses: RecentResponse[];
  allTimeResponses: RecentResponse[];
  surveys: Survey[];
}

// Google Business
export interface RatingEntry {
  stars: number;
  count: number;
}

export interface GoogleReview {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
  replied: boolean;
  replyText?: string;
}

export interface RatingHistoryEntry {
  month: string;
  rating: number | null;
}

export interface KeywordEntry {
  word: string;
  count: number;
  sentiment?: 'pos' | 'neg' | 'neu';
}

export interface GoogleBusinessData {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: RatingEntry[];
  recentReviews: GoogleReview[];
  unansweredCount: number;
  ratingHistory: RatingHistoryEntry[];
  topKeywords: KeywordEntry[];
  last5Avg: number | null;
}

export type ApiStatusType = 'connected' | 'error' | 'loading';

export interface ApiStatus {
  surveymonkey: ApiStatusType;
  google:       ApiStatusType;
  paytour:      ApiStatusType;
}

export type AlertType = 'warning' | 'info' | 'success' | 'error';
export type AlertSection = 'sales' | 'satisfaction' | 'reviews' | 'general';

export interface Alert {
  id: string;
  type: AlertType;
  message: string;
  section: AlertSection;
  timestamp: string;
}

// Vendas diárias manuais
export interface DailyVendasEntry {
  date:    string;  // 'YYYY-MM-DD'
  revenue: number;  // R$
  pax:     number;  // pessoas no dia
  orders:  number;  // reservas/pedidos
  notes?:  string;
}

// Goals / Metas
export interface Goals {
  receitaTotal: number;       // R$/mês
  atividadesMes: number;      // atividades vendidas/mês
  numeroVendas: number;       // pedidos/mês
  npsScore: number;           // pontos
  notaGoogle: number;         // estrelas (1–5)
  taxaSatisfacao: number;     // % promotores
}

export const DEFAULT_GOALS: Goals = {
  receitaTotal:  33361,
  atividadesMes: 2000,
  numeroVendas:  1400,
  npsScore:      65,
  notaGoogle:    4.7,
  taxaSatisfacao: 75,
};

// Occupancy / Contador de Pessoas
// ── Módulo Refeitório ─────────────────────────────────────────────────────────
export type TipoRefeicao = 'almoco' | 'jantar' | 'cafe' | 'lanche';

export interface Pessoa {
  id: string;
  nome: string;
  categoria: 'colaborador' | 'parceiro' | 'visitante';
  empresa: string;
  setor: string;
  foto: string;
  qrCode: string;
  ativo: boolean;
  cargo?: string;
  dataNascimento?: string;
  dataAdmissao?: string;
}

export interface Refeicao {
  id: string;
  pessoaId: string;
  nome: string;
  categoria: string;
  empresa: string;
  tipoRefeicao: TipoRefeicao;
  data: string;
  hora: string;
  timestamp: number;
  origemRegistro: 'QRCode' | 'Manual';
  status: 'registrada' | 'duplicada' | 'invalida' | 'fora_horario';
}

export interface LoungeInfo {
  nome:        string;
  telefone:    string;
  canal:       'Balcão' | 'Paytour' | 'Comercial' | 'Diretoria' | 'Edilene' | 'Outros' | '';
  veiculo:     'TX/UBER/PRIV' | 'Particular' | 'Luck' | 'WS' | 'CTZ' | 'Van' | 'Não identificado' | '';
  parceiro:    string;
  codParceiro: string;
  obs:         string;
  transferido: boolean;
}

export const LOUNGE_INFO_EMPTY: LoungeInfo = {
  nome: '', telefone: '', canal: '', veiculo: '', parceiro: '', codParceiro: '', obs: '', transferido: false,
};

export interface LoungeReserva {
  id:        string;
  loungeIdx: number;
  data:      string;
  info:      LoungeInfo;
  status:    'reserva' | 'confirmada' | 'chegou' | 'cancelada';
  criadaEm:  number;
}

export interface OccupancyState {
  beach: number;
  lounges: number[];
  prime: number;
  parceiros: number;
  colaboradores: number;
  loungeObs: string[];
  loungeData?: LoungeInfo[];
  reservasHoje?: LoungeReserva[];
}

export const SPACE_CONFIGS = {
  beach:  { name: 'Beach',  max: 500, attention: 0.6, alert: 0.9 },
  lounge: { name: 'Lounge', max: 10,  attention: 0.6, alert: 0.9, count: 19, start: 501 },
  prime:  { name: 'Prime',  max: 10,  attention: 0.5, alert: 1.0 },
} as const;

// Dados vindos da planilha de ocupação em tempo real
export interface SheetOccupancyData {
  date:       string;   // YYYY-MM-DD
  portaria:   number;   // total de entradas pela portaria
  beach:      number;   // pax no beach
  condominio: number;   // pax no condomínio
  lounge:     number;   // pax nos lounges (agregado)
  gap:        number;   // portaria - (beach + lounge + condomínio) — pode ser negativo
  total:      number;   // beach + lounge + condomínio
  timestamp:  string;   // horário da última atualização
  isToday:    boolean;
  stale?:     boolean;
}

// Capacidades máximas conforme a planilha / operação real
export const SHEET_CAPS = {
  beach:      600,
  lounge:     150,
  condominio:  30,
} as const;
