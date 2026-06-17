import { PaytourData, SurveyMonkeyData, GoogleBusinessData } from '../types';

function generateSalesData(days: number) {
  const data = [];
  const now = new Date('2026-04-07');
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const base = isWeekend ? 12000 : 5500;
    const revenue = Math.max(2000, Math.round(base + (Math.sin(i * 0.4) * 1800) + (i % 7) * 220));
    const count = Math.round(revenue / 152);
    data.push({ date: date.toISOString().split('T')[0], revenue, count });
  }
  return data;
}

export const mockPaytourData: PaytourData = {
  totalRevenue: 204685,
  totalSales: 1350,
  totalItems: 3240,
  averageTicket: 151.62,
  conversionRate: 71.2,
  cancellations: 37,
  todayRevenue: 8450,
  todayOrders: 56,
  todayItems: 134,
  salesByDay: generateSalesData(90),
  salesByChannel: [
    { channel: 'Online', count: 742, revenue: 112470 },
    { channel: 'Presencial', count: 338, revenue: 51225 },
    { channel: 'Agência', count: 270, revenue: 40990 },
  ],
  topProducts: [
    { name: 'Day Use — Piscina & Praia', sales: 412, revenue: 41200, change: 18.3 },
    { name: 'Lounge Premium',            sales: 198, revenue: 34650, change: 11.2 },
    { name: 'Massagem Relaxante 60min',  sales: 176, revenue: 19360, change:  6.8 },
    { name: 'Passeio de Lancha — Ilhas', sales: 143, revenue: 39325, change: 24.1 },
    { name: 'Day Use + Massagem (Combo)',sales: 118, revenue: 17700, change: 30.5 },
    { name: 'Lounge + Passeio (Combo)',  sales:  87, revenue: 21750, change:  9.4 },
    { name: 'Massagem Pedras Quentes',   sales:  72, revenue:  9360, change: -2.1 },
    { name: 'Snorkel & Mergulho',        sales:  65, revenue:  9750, change: 42.0 },
    { name: 'Aluguel de Caiaque',        sales:  48, revenue:  3840, change: 15.7 },
    { name: 'Pacote Aniversário',        sales:  31, revenue:  7750, change: -5.3 },
  ],
  previousPeriodRevenue: 185000,
  reservationStatus: { confirmed: 1198, pending: 115, cancelled: 37 },
};

export const mockSurveyMonkeyData: SurveyMonkeyData = {
  npsScore: 52,
  promoters: 67,
  neutrals: 18,
  detractors: 15,
  responseRate: 36.8,
  totalResponses: 912,
  npsHistory: [
    { month: 'Out', score: 44 },
    { month: 'Nov', score: 49 },
    { month: 'Dez', score: 56 },
    { month: 'Jan', score: 51 },
    { month: 'Fev', score: 58 },
    { month: 'Mar', score: 52 },
  ],
  recentResponses: [
    { id: '1', text: 'Estrutura impecável! A piscina é maravilhosa e o atendimento superou todas as expectativas. Voltarei com certeza!', sentiment: 'positive', date: '2026-04-06', score: 10 },
    { id: '2', text: 'Boa experiência no geral, mas o lounge estava um pouco cheio no fim de semana. A vista é linda.', sentiment: 'neutral', date: '2026-04-05', score: 7 },
    { id: '3', text: 'Decepcionante. O passeio de lancha foi cancelado sem aviso prévio e não recebi reembolso imediato.', sentiment: 'negative', date: '2026-04-05', score: 2 },
    { id: '4', text: 'A massagem de pedras quentes foi simplesmente divina! Ambiente super relaxante e profissional qualificado.', sentiment: 'positive', date: '2026-04-04', score: 9 },
    { id: '5', text: 'Day Use perfeito para família. As crianças adoraram a piscina e os adultos aproveitaram o lounge.', sentiment: 'positive', date: '2026-04-04', score: 10 },
    { id: '6', text: 'Estrutura boa, mas os drinks poderiam ter mais opções. A praia privativa compensa tudo.', sentiment: 'neutral', date: '2026-04-03', score: 6 },
    { id: '7', text: 'O passeio de lancha pelas ilhas foi o melhor da viagem! Guia excelente, mar incrível. Nota 10!', sentiment: 'positive', date: '2026-04-03', score: 10 },
    { id: '8', text: 'Gostei bastante, só o estacionamento que é complicado nos fins de semana. Estrutura impecável.', sentiment: 'neutral', date: '2026-04-02', score: 7 },
    { id: '9', text: 'Não recomendo. Cobranças indevidas no cartão e demora no atendimento ao cliente para resolver.', sentiment: 'negative', date: '2026-04-01', score: 1 },
    { id: '10', text: 'Melhor beach club da região! Combinei o day use com a massagem e foi uma experiência inesquecível.', sentiment: 'positive', date: '2026-04-01', score: 10 },
  ],
  surveys: [
    { name: 'Pós-Visita Satisfação', responses: 548, rate: 41.2 },
    { name: 'NPS Mensal',            responses: 224, rate: 30.5 },
    { name: 'Avaliação de Serviços', responses: 140, rate: 38.7 },
  ],
};

export const mockGoogleBusinessData: GoogleBusinessData = {
  averageRating: 4.4,
  totalReviews: 912,
  ratingDistribution: [
    { stars: 5, count: 558 },
    { stars: 4, count: 228 },
    { stars: 3, count: 72 },
    { stars: 2, count: 34 },
    { stars: 1, count: 20 },
  ],
  recentReviews: [
    { id: '1', author: 'Mariana S.', rating: 5, text: 'Estrutura linda! A piscina infinita com vista pro mar é de tirar o fôlego. Atendimento cinco estrelas. Já estou planejando a próxima visita!', date: '2026-04-06', replied: true },
    { id: '2', author: 'João P.', rating: 2, text: 'O passeio de lancha foi cancelado por "condições climáticas" mas o dia estava perfeito. Péssima comunicação e demora no reembolso.', date: '2026-04-05', replied: false },
    { id: '3', author: 'Ana L.', rating: 5, text: 'Fiz o combo Day Use + Massagem e foi uma experiência maravilhosa. O ambiente é super relaxante e a equipe muito atenciosa.', date: '2026-04-05', replied: true },
    { id: '4', author: 'Carlos M.', rating: 4, text: 'Ótima estrutura e localização privilegiada. Apenas o estacionamento deixa a desejar nos fins de semana. Drinks excelentes!', date: '2026-04-04', replied: false },
    { id: '5', author: 'Fernanda R.', rating: 1, text: 'Decepcionante! Foram cobrados serviços que não consumi. Liguei várias vezes e ninguém resolveu. Não volto mais.', date: '2026-04-04', replied: false },
    { id: '6', author: 'Roberto K.', rating: 5, text: 'O passeio de lancha pelas ilhas foi incrível! Água cristalina, ótimo equipamento e tripulação super simpática. Vale cada centavo!', date: '2026-04-03', replied: true },
    { id: '7', author: 'Luciana T.', rating: 4, text: 'Lounge premium confortável e com visual esplêndido. A massagem relaxante foi o ponto alto da visita. Voltarei!', date: '2026-04-03', replied: false },
    { id: '8', author: 'Pedro A.', rating: 5, text: 'Vim de São Paulo especialmente para conhecer o Hibiscus. Não me decepcionou! Fiz o day use e depois o snorkel. Paraíso!', date: '2026-04-02', replied: true },
    { id: '9', author: 'Beatriz C.', rating: 3, text: 'Estrutura bonita mas bastante lotada no sábado. Serviço um pouco lento na área da piscina. Esperava mais organização.', date: '2026-04-01', replied: false },
    { id: '10', author: 'Thomas W.', rating: 5, text: 'Absolutely stunning beach club! The infinity pool, the lancha tour, the massages — all world class. Best day of our trip to Brazil!', date: '2026-03-31', replied: true },
  ],
  unansweredCount: 5,
  ratingHistory: [
    { month: 'Out', rating: 4.2 },
    { month: 'Nov', rating: 4.3 },
    { month: 'Dez', rating: 4.5 },
    { month: 'Jan', rating: 4.4 },
    { month: 'Fev', rating: 4.6 },
    { month: 'Mar', rating: 4.4 },
  ],
  topKeywords: [
    { word: 'piscina',     count: 298 },
    { word: 'atendimento', count: 271 },
    { word: 'estrutura',   count: 244 },
    { word: 'relaxante',   count: 219 },
    { word: 'lancha',      count: 187 },
    { word: 'massagem',    count: 165 },
    { word: 'excelente',   count: 154 },
    { word: 'recomendo',   count: 141 },
    { word: 'drinks',      count: 128 },
    { word: 'incrível',    count: 115 },
  ],
};
