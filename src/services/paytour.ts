import { PaytourData, SalesByDay, TopProduct } from '../types';

// ── Result cache (5 min) + in-flight dedup ────────────────────────────────────
const resultCache   = new Map<string, { data: PaytourData; ts: number }>();
const inflightFetch = new Map<string, Promise<PaytourData>>();
const CACHE_TTL     = 5 * 60 * 1000;

export function invalidatePaytourCache() {
  resultCache.clear();
}

// ── Raw order type (matches what the server aggregator returns) ───────────────
interface RawOrder {
  id:               string;
  status:           string;
  valor:            string;
  data_hora_pedido: string;
  pedido_origem?:   string;
  produto_id?:      string;
  id_produto?:      string;
}

// ── Date / period helpers ─────────────────────────────────────────────────────
function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0);
}

function periodRange(period: string): { since: string; until: string | null } {
  const today = startOfToday();
  const fmt   = (d: Date) => d.toISOString().slice(0, 10);

  if (period === 'today') return { since: fmt(today), until: fmt(today) };

  if (period === '7d') {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { since: fmt(s), until: null };
  }
  if (period === '30d') {
    const s = new Date(today); s.setDate(s.getDate() - 29);
    return { since: fmt(s), until: null };
  }
  if (period === '90d') {
    const s = new Date(today); s.setDate(s.getDate() - 89);
    return { since: fmt(s), until: null };
  }
  if (period === 'month') {
    const n = new Date();
    return {
      since: fmt(new Date(n.getFullYear(), n.getMonth(), 1)),
      until: fmt(new Date(n.getFullYear(), n.getMonth() + 1, 0)),
    };
  }
  if (period === 'next_month') {
    const n = new Date();
    return {
      since: fmt(new Date(n.getFullYear(), n.getMonth() + 1, 1)),
      until: fmt(new Date(n.getFullYear(), n.getMonth() + 2, 0)),
    };
  }
  if (period.startsWith('custom:')) {
    const parts = period.split(':');
    return { since: parts[1] ?? fmt(today), until: parts[2] ?? null };
  }
  const n = new Date();
  return { since: fmt(new Date(n.getFullYear(), n.getMonth(), 1)), until: null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusGroup(status: string): 'confirmed' | 'pending' | 'cancelled' {
  const s = status.toLowerCase();
  if (s === 'aprovado' || s === 'pago')       return 'confirmed';
  if (s === 'cancelado' || s === 'reprovado') return 'cancelled';
  return 'pending';
}

function channelLabel(origem?: string): string {
  if (!origem) return 'Presencial';
  const c = origem.toLowerCase();
  if (c === 'loja')                         return 'Online';
  if (c === 'afiliado' || c === 'parceiro') return 'Agência';
  return 'Presencial';
}

const PRODUCTS = [
  { name: 'Day Use',           ids: ['2009461', '2527527', '2524542'] },
  { name: 'Lounge',            ids: ['2527525', '2512268', '2539230'] },
  { name: 'Massagem',          ids: ['2510653'] },
  { name: 'Passeio de Lancha', ids: ['2512997', '2519302'] },
];

function emptyProducts(): TopProduct[] {
  return PRODUCTS.map((p) => ({ name: p.name, sales: 0, revenue: 0, change: 0 }));
}

export interface PaytourProgress { current: number; total: number }

type ProgressCallback = (p: PaytourProgress | null) => void;

// ── Poll server until data is ready (warmingUp → real data) ──────────────────
async function fetchFromServer(
  since: string,
  until: string | null,
  onProgress?: ProgressCallback,
): Promise<RawOrder[]> {
  const params = new URLSearchParams({ since });
  if (until) params.set('until', until);
  const url = `/api/paytour-orders?${params}`;

  for (let attempt = 0; attempt < 60; attempt++) {
    const res  = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Server HTTP ${res.status}`);
    const json = await res.json() as {
      orders: RawOrder[];
      warmingUp?: boolean;
      stale?: boolean;
      error?: string;
      progress?: PaytourProgress | null;
    };

    if (json.error) throw new Error(json.error);

    if (json.warmingUp) {
      onProgress?.(json.progress ?? null);
      await new Promise((r) => setTimeout(r, 3_000));
      continue;
    }

    onProgress?.(null);
    return json.orders;
  }

  throw new Error('Paytour: timeout aguardando servidor (5 min)');
}

// ── Aggregate raw orders into PaytourData ─────────────────────────────────────
interface RawOrderWithItems extends RawOrder {
  itens?: { produto_id?: string; produto_disponibilidade_data?: string }[];
}

function aggregate(orders: RawOrderWithItems[], since: string): PaytourData {
  const todayStart = startOfToday();
  const topProducts = emptyProducts();

  let totalRevenue = 0;
  let totalSales   = 0;
  let totalItems   = 0;
  const statusCount  = { confirmed: 0, pending: 0, cancelled: 0 };
  const byDay: Record<string, { revenue: number; count: number }>     = {};
  const byChannel: Record<string, { count: number; revenue: number }> = {};

  let todayRevenue = 0;
  let todayOrders  = 0;
  let todayItems   = 0;

  for (const order of orders) {
    const grp = statusGroup(order.status);
    statusCount[grp]++;

    const d     = new Date(order.data_hora_pedido.replace(' ', 'T'));
    const value = parseFloat(order.valor ?? '0');
    const itensCnt = order.itens?.length ?? 0;

    if (d >= todayStart && grp !== 'cancelled') {
      todayRevenue += value;
      todayOrders++;
      todayItems += itensCnt;
    }

    if (grp === 'cancelled') continue;

    totalRevenue += value;
    totalSales++;
    totalItems += itensCnt;

    const day = order.data_hora_pedido.slice(0, 10);
    if (day) {
      if (!byDay[day]) byDay[day] = { revenue: 0, count: 0 };
      byDay[day].revenue += value;
      byDay[day].count++;
    }

    const ch = channelLabel(order.pedido_origem);
    if (!byChannel[ch]) byChannel[ch] = { count: 0, revenue: 0 };
    byChannel[ch].count++;
    byChannel[ch].revenue += value;

    // Produtos
    const pid = order.produto_id ?? order.id_produto ?? '';
    const prod = topProducts.find((p) => PRODUCTS.find((def) => def.name === p.name)?.ids.includes(pid));
    if (prod) { prod.sales++; prod.revenue += value; }
  }

  const salesByDay: SalesByDay[] = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  console.log(`[Paytour] ✓ R$ ${totalRevenue.toFixed(2)} | ${totalSales} pedidos | ${totalItems} atividades`);

  return {
    totalRevenue,
    totalSales,
    totalItems,
    averageTicket:         totalSales > 0 ? totalRevenue / totalSales : 0,
    conversionRate:        orders.length > 0
      ? Math.round((statusCount.confirmed / orders.length) * 100 * 10) / 10
      : 0,
    cancellations:         statusCount.cancelled,
    todayRevenue,
    todayOrders,
    todayItems,
    previousPeriodRevenue: 0,
    salesByDay,
    salesByChannel:        Object.entries(byChannel).map(([channel, v]) => ({ channel, ...v })),
    topProducts,
    reservationStatus:     statusCount,
  };
}

// ── Core fetch ────────────────────────────────────────────────────────────────
async function _doFetch(period: string, onProgress?: ProgressCallback): Promise<PaytourData> {
  const { since, until } = periodRange(period);
  const orders = await fetchFromServer(since, until, onProgress);
  return aggregate(orders, since);
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function fetchPaytourData(
  period: string,
  onProgress?: ProgressCallback,
): Promise<PaytourData> {
  const cached = resultCache.get(period);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const existing = inflightFetch.get(period);
  if (existing) return existing;

  const promise = _doFetch(period, onProgress)
    .then((data) => {
      // Não cacheia resultado "zerado": pode ser fruto de um warm-up ainda
      // incompleto no servidor — preferimos revalidar a exibir zeros obsoletos.
      if (data.totalSales > 0 || data.totalRevenue > 0) {
        resultCache.set(period, { data, ts: Date.now() });
      } else {
        resultCache.delete(period);
      }
      return data;
    })
    .finally(() => inflightFetch.delete(period));

  inflightFetch.set(period, promise);
  return promise;
}
