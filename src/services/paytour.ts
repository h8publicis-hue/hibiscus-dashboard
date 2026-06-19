import { PaytourData, SalesByDay, SalesByChannel, TopProduct } from '../types';

// ── Period → date range ───────────────────────────────────────────────────────
function periodToDates(period: string): { since: string; until: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt  = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();

  if (period === 'today') {
    const s = fmt(today);
    return { since: s, until: s };
  }
  if (period === 'month') {
    const since = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
    const until = fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    return { since, until };
  }
  if (period === '7d') {
    const d = new Date(today); d.setDate(d.getDate() - 6);
    return { since: fmt(d), until: fmt(today) };
  }
  if (period === '30d') {
    const d = new Date(today); d.setDate(d.getDate() - 29);
    return { since: fmt(d), until: fmt(today) };
  }
  if (period === '90d') {
    const d = new Date(today); d.setDate(d.getDate() - 89);
    return { since: fmt(d), until: fmt(today) };
  }
  if (period.startsWith('custom:')) {
    const [, since, until] = period.split(':');
    return { since, until };
  }
  const s = fmt(today);
  return { since: s, until: s };
}

// ── Raw order type ────────────────────────────────────────────────────────────
interface RawItem {
  produto_id: string;
  produto_disponibilidade_data: string;
  valor: string;
  nome_produto: string;
}

interface RawOrder {
  id: string;
  status: string;
  valor: string;
  data_hora_pedido: string;
  pedido_origem?: string;
  itens?: RawItem[];
}

// ── Map raw orders → PaytourData ─────────────────────────────────────────────
function mapOrders(orders: RawOrder[], since: string, until: string): PaytourData {
  const _now   = new Date();
  const today  = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;

  const confirmed  = orders.filter((o) => o.status === 'confirmado' || o.status === 'aprovado');
  const pending    = orders.filter((o) => o.status === 'pendente');
  const cancelled  = orders.filter((o) => o.status === 'cancelado' || o.status === 'reprovado');
  const active     = [...confirmed, ...pending];

  const totalRevenue = active.reduce((s, o) => s + parseFloat(o.valor || '0'), 0);
  const totalSales   = active.length;
  const totalItems   = active.reduce((s, o) => s + (o.itens?.length ?? 1), 0);
  const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

  // Today sub-totals
  const todayOrders  = confirmed.filter((o) => o.data_hora_pedido.slice(0, 10) === today);
  const todayRevenue = todayOrders.reduce((s, o) => s + parseFloat(o.valor || '0'), 0);
  const todayItems   = todayOrders.reduce((s, o) => s + (o.itens?.length ?? 1), 0);

  // Sales by day
  const byDay: Record<string, { revenue: number; count: number }> = {};
  active.forEach((o) => {
    const d = o.data_hora_pedido.slice(0, 10);
    if (d >= since && d <= until) {
      if (!byDay[d]) byDay[d] = { revenue: 0, count: 0 };
      byDay[d].revenue += parseFloat(o.valor || '0');
      byDay[d].count++;
    }
  });
  const salesByDay: SalesByDay[] = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  // Sales by channel
  const byChannel: Record<string, { count: number; revenue: number }> = {};
  active.forEach((o) => {
    const ch = o.pedido_origem ?? 'site';
    if (!byChannel[ch]) byChannel[ch] = { count: 0, revenue: 0 };
    byChannel[ch].count++;
    byChannel[ch].revenue += parseFloat(o.valor || '0');
  });
  const salesByChannel: SalesByChannel[] = Object.entries(byChannel)
    .map(([channel, v]) => ({ channel, ...v }));

  // Top products
  const byProduct: Record<string, { sales: number; revenue: number }> = {};
  active.forEach((o) => {
    (o.itens ?? []).forEach((item) => {
      const name = item.nome_produto ?? item.produto_id;
      if (!byProduct[name]) byProduct[name] = { sales: 0, revenue: 0 };
      byProduct[name].sales++;
      byProduct[name].revenue += parseFloat(item.valor || '0');
    });
  });
  const topProducts: TopProduct[] = Object.entries(byProduct)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(([name, v]) => ({ name, ...v, change: 0 }));

  return {
    totalRevenue,
    totalSales,
    totalItems,
    averageTicket,
    conversionRate: 0,
    cancellations:  cancelled.length,
    todayRevenue,
    todayOrders:    todayOrders.length,
    todayItems,
    salesByDay,
    salesByChannel,
    topProducts,
    previousPeriodRevenue: 0,
    reservationStatus: {
      confirmed: confirmed.length,
      pending:   pending.length,
      cancelled: cancelled.length,
    },
  };
}

// ── In-memory cache + in-flight deduplication ────────────────────────────────
interface CacheEntry {
  data: PaytourData;
  ts:   number;
}
const cache    = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PaytourData>>();

const TTL_TODAY  = 5  * 60 * 1000;  // 5 min
const TTL_OTHER  = 30 * 60 * 1000;  // 30 min

export function invalidatePaytourCache(): void {
  cache.clear();
  nextMonthCache    = null;
  nextMonthInflight = null;
}

// ── Fetch simples — a Vercel function nunca retorna warmingUp ────────────────
async function apiFetch(url: string): Promise<RawOrder[]> {
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Paytour API ${res.status}`);
  const json = await res.json() as { orders?: RawOrder[] } | RawOrder[];
  if (Array.isArray(json)) return json;
  return (json as { orders?: RawOrder[] }).orders ?? [];
}

// ── Dados do próximo mês por data de visita ───────────────────────────────────
export interface NextMonthVisit {
  revenue:    number;
  pedidos:    number;
  atividades: number;
}

let nextMonthCache:    { data: NextMonthVisit; ts: number; key: string } | null = null;
let nextMonthInflight: Promise<NextMonthVisit> | null = null;

export async function fetchNextMonthVisitData(): Promise<NextMonthVisit> {
  const pad  = (n: number) => String(n).padStart(2, '0');
  const fmt  = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const now  = new Date();
  const nm   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const visitSince = fmt(nm);
  const visitUntil = fmt(last);
  const key = `${visitSince}:${visitUntil}`;

  if (nextMonthCache && nextMonthCache.key === key && Date.now() - nextMonthCache.ts < TTL_OTHER) {
    return nextMonthCache.data;
  }

  // Deduplication: se já tem uma request em voo, retorna a mesma promise
  if (nextMonthInflight) return nextMonthInflight;

  nextMonthInflight = (async () => {
    try {
      const url    = `/api/paytour-orders?since=${visitSince}&until=${visitUntil}&filter=visita`;
      const orders = await apiFetch(url) as RawOrder[];

      const active = orders.filter(o =>
        o.status === 'confirmado' || o.status === 'aprovado' || o.status === 'pendente'
      );
      const revenue    = active.reduce((s, o) => s + parseFloat(o.valor || '0'), 0);
      const pedidos    = active.length;
      const atividades = active.reduce((s, o) => {
        const items = (o.itens ?? []).filter(item => {
          const vd = item.produto_disponibilidade_data?.slice(0, 10);
          return vd && vd >= visitSince && vd <= visitUntil;
        });
        return s + (items.length > 0 ? items.length : 1);
      }, 0);

      const data = { revenue, pedidos, atividades };
      nextMonthCache = { data, ts: Date.now(), key };
      return data;
    } finally {
      nextMonthInflight = null;
    }
  })();

  return nextMonthInflight;
}

// ── Public fetch function (com deduplicação) ──────────────────────────────────
export async function fetchPaytourData(period: string): Promise<PaytourData> {
  const ttl  = period === 'today' ? TTL_TODAY : TTL_OTHER;
  const entry = cache.get(period);
  if (entry && Date.now() - entry.ts < ttl) return entry.data;

  // Se já existe uma request em voo para o mesmo período, retorna a mesma promise
  const existing = inflight.get(period);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { since, until } = periodToDates(period);
      const url    = `/api/paytour-orders?since=${since}&until=${until}`;
      const orders = await apiFetch(url);
      const data   = mapOrders(orders, since, until);
      cache.set(period, { data, ts: Date.now() });
      return data;
    } finally {
      inflight.delete(period);
    }
  })();

  inflight.set(period, promise);
  return promise;
}
