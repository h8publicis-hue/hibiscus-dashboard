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
  promoters: number;
  neutrals: number;
  detractors: number;
  responseRate: number;
  totalResponses: number;
  npsHistory: NpsHistoryEntry[];
  recentResponses: RecentResponse[];
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
}

export interface RatingHistoryEntry {
  month: string;
  rating: number;
}

export interface KeywordEntry {
  word: string;
  count: number;
}

export interface GoogleBusinessData {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: RatingEntry[];
  recentReviews: GoogleReview[];
  unansweredCount: number;
  ratingHistory: RatingHistoryEntry[];
  topKeywords: KeywordEntry[];
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
  receitaTotal:  220000,
  atividadesMes: 2000,
  numeroVendas:  1400,
  npsScore:      65,
  notaGoogle:    4.7,
  taxaSatisfacao: 75,
};

// Occupancy / Contador de Pessoas
export interface OccupancyState {
  beach: number;      // 0–500
  lounges: number[];  // 14 elementos, cada 0–10
  prime: number;      // 0–10
}

export const SPACE_CONFIGS = {
  beach:  { name: 'Beach',  max: 500, attention: 0.6, alert: 0.9 },
  lounge: { name: 'Lounge', max: 10,  attention: 0.6, alert: 0.9, count: 14 },
  prime:  { name: 'Prime',  max: 10,  attention: 0.6, alert: 0.9 },
} as const;
