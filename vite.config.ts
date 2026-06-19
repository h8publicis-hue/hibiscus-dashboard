import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// ── Types for Google Places API response ──────────────────────────────────────
interface PlaceReview {
  author_name:                  string;
  rating:                       number;
  text:                         string;
  time:                         number; // Unix seconds
  relative_time_description:   string;
}
interface PlaceResult {
  rating?:             number;
  user_ratings_total?: number;
  reviews?:            PlaceReview[];
}
interface PlaceApiResponse {
  status:         string;
  error_message?: string;
  result:         PlaceResult;
}

// ── Paytour aggregator plugin ─────────────────────────────────────────────────
import fs   from 'node:fs';
import path from 'node:path';

interface PaytourOrder {
  id: string;
  status: string;
  valor: string;
  data_hora_pedido: string;
  pedido_origem?: string;
  itens?: Array<{
    produto_id: string;
    produto_disponibilidade_data: string;
    valor: string;
    nome_produto: string;
  }>;
}

function paytourAggregatorPlugin(appKey: string, appSecret: string): Plugin {
  const BASE        = 'https://api-ha.paytour.com.br';
  const DISK_DIR    = path.join(process.cwd(), '.paytour-cache');
  const DISK_TTL    = 12 * 60 * 60 * 1000;
  const TTL_TODAY   = 2  * 60 * 1000;
  const TTL_OTHER   = 10 * 60 * 1000;
  // Sequential pagination — never fires more than 1 request at a time

  // ── Token cache ─────────────────────────────────────────────────────────────
  let cachedToken  = '';
  let tokenExpiry  = 0;

  async function getToken(): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
    const creds = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
    const res   = await fetch(`${BASE}/v2/lojas/login?grant_type=application`, {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${creds}`,
        'User-Agent':   'Mozilla/5.0',
        Origin:         'https://app.paytour.com.br',
        'Content-Length': '0',
      },
    });
    const j = await res.json() as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new Error('Paytour auth failed');
    cachedToken = j.access_token;
    tokenExpiry = Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000;
    console.log('[paytour] token OK');
    return cachedToken;
  }

  async function apiGet(tk: string, urlPath: string) {
    const res = await fetch(`${BASE}${urlPath}`, {
      headers: {
        Authorization:   `Bearer ${tk}`,
        'User-Agent':    'Mozilla/5.0',
        Origin:          'https://app.paytour.com.br',
        Referer:         'https://app.paytour.com.br/',
        Accept:          'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });
    return res.json();
  }

  // ── Disk cache ───────────────────────────────────────────────────────────────
  function diskPath(since: string, until: string) {
    return path.join(DISK_DIR, `${since}_${until}.json`);
  }
  function readDisk(since: string, until: string): PaytourOrder[] | null {
    try {
      const p = diskPath(since, until);
      if (Date.now() - fs.statSync(p).mtimeMs > DISK_TTL) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8')) as PaytourOrder[];
    } catch { return null; }
  }
  function writeDisk(since: string, until: string, orders: PaytourOrder[]) {
    try {
      fs.mkdirSync(DISK_DIR, { recursive: true });
      fs.writeFileSync(diskPath(since, until), JSON.stringify(orders));
    } catch { /* ignore */ }
  }

  // ── In-memory cache ──────────────────────────────────────────────────────────
  const mem = new Map<string, { orders: PaytourOrder[]; ts: number }>();
  const inflight = new Map<string, Promise<PaytourOrder[]>>();

  // ── Fetch orders sequentially — 1 request at a time, stop by date ───────────
  async function fetchOrders(since: string, until: string): Promise<PaytourOrder[]> {
    const tk      = await getToken();
    const _n      = new Date();
    const today   = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,'0')}-${String(_n.getDate()).padStart(2,'0')}`;
    const isToday = since === today && until === today;
    const maxPage = isToday ? 10 : 9999;
    const all: PaytourOrder[] = [];

    for (let page = 1; page <= maxPage; page++) {
      const data = await apiGet(tk, `/v2/pedidos?por_pagina=30&pagina=${page}`) as {
        itens?: PaytourOrder[];
        info?:  { total_paginas?: number };
      };
      const items = data?.itens ?? [];
      if (!items.length) break;

      let done = false;
      for (const o of items) {
        const d = o.data_hora_pedido.slice(0, 10);
        if (d < since) { done = true; break; }
        if (d <= until) all.push(o);
      }
      if (done) break;

      // Stop if we've passed all pages
      const totalPages = data?.info?.total_paginas ?? page;
      if (page >= totalPages) break;
    }

    console.log(`[paytour] ${since}→${until}: ${all.length} pedidos`);
    return all;
  }

  function ensureFetch(since: string, until: string): Promise<PaytourOrder[]> {
    const key = `${since}_${until}`;
    if (inflight.has(key)) return inflight.get(key)!;
    const p = fetchOrders(since, until)
      .then((orders) => {
        mem.set(key, { orders, ts: Date.now() });
        const today = new Date().toISOString().slice(0, 10);
        if (since !== today || until !== today) writeDisk(since, until, orders);
        return orders;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  // ── Plugin ───────────────────────────────────────────────────────────────────
  return {
    name: 'paytour-aggregator',
    configureServer(server) {
      if (appKey && appSecret) {
        setTimeout(() => {
          const today = new Date().toISOString().slice(0, 10);
          console.log('[paytour] pré-aquecendo hoje…');
          ensureFetch(today, today).catch(console.error);
        }, 2000);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use('/api/paytour-orders', async (req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        if (!appKey || !appSecret) {
          res.end(JSON.stringify({ orders: [] }));
          return;
        }

        const qs    = new URL(req.url, 'http://localhost').searchParams;
        const since = qs.get('since') ?? new Date().toISOString().slice(0, 10);
        const until = qs.get('until') ?? since;
        const today = new Date().toISOString().slice(0, 10);
        const key   = `${since}_${until}`;
        const ttl   = since === today && until === today ? TTL_TODAY : TTL_OTHER;

        // Fresh memory cache
        const cached = mem.get(key);
        if (cached && Date.now() - cached.ts < ttl) {
          res.end(JSON.stringify({ orders: cached.orders }));
          return;
        }

        // Stale memory — return stale + revalidate
        if (cached) {
          res.end(JSON.stringify({ orders: cached.orders, stale: true }));
          ensureFetch(since, until).catch(console.error);
          return;
        }

        // Disk cache
        const disk = readDisk(since, until);
        if (disk) {
          mem.set(key, { orders: disk, ts: Date.now() });
          res.end(JSON.stringify({ orders: disk, stale: true }));
          ensureFetch(since, until).catch(console.error);
          return;
        }

        // In-flight — return warmingUp
        if (inflight.has(key)) {
          res.end(JSON.stringify({ orders: [], warmingUp: true }));
          return;
        }

        // First fetch — wait for it (first call only)
        try {
          const orders = await ensureFetch(since, until);
          res.end(JSON.stringify({ orders }));
        } catch (err) {
          console.error('[paytour]', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

// ── HTTPS helpers via Node built-ins (ESM-safe) ───────────────────────────────
async function httpsGet(url: string): Promise<string> {
  const { get } = await import('node:https');
  return new Promise((resolve, reject) => {
    const req = get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Places HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Places API timeout')); });
  });
}


// ── Helpers ───────────────────────────────────────────────────────────────────
function extractKeywords(reviews: PlaceReview[]) {
  const stopPt = new Set([
    'a','o','e','de','do','da','em','para','com','um','uma','que','foi',
    'mas','muito','mais','não','por','se','no','na','os','as','ou','ao',
    'dos','das','me','seu','sua','esse','essa','isso','pela','pelo',
    // English stopwords (for multilingual reviews)
    'the','and','was','is','in','of','to','for','it','we','our','very',
  ]);
  const counts: Record<string, number> = {};
  reviews.forEach((r) => {
    r.text.toLowerCase()
      .replace(/[^a-záâãàéêíóôõúüçA-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopPt.has(w))
      .forEach((w) => { counts[w] = (counts[w] ?? 0) + 1; });
  });
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));
}

function transformPlaceData(place: PlaceResult) {
  const reviews   = place.reviews ?? [];
  const total     = place.user_ratings_total ?? 0;
  const avgRating = place.rating ?? 0;

  // ── Star distribution ─────────────────────────────────────────────────────
  // The Places API returns at most 5 reviews, so we can't get exact counts.
  // Strategy: use the sample to get proportions, then scale to total.
  const sampleDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((r) => { sampleDist[r.rating] = (sampleDist[r.rating] ?? 0) + 1; });
  const sampleN = reviews.length || 1;

  const ratingDistribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: Math.round((sampleDist[stars] / sampleN) * total),
  }));

  // ── Rating history (last 6 months) ────────────────────────────────────────
  // Group available reviews by month; fill missing months with overall average.
  const byMonth: Record<string, number[]> = {};
  reviews.forEach((r) => {
    const d   = new Date(r.time * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (byMonth[key] = byMonth[key] ?? []).push(r.rating);
  });

  const now = new Date();
  const ratingHistory = Array.from({ length: 6 }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const month = d.toLocaleDateString('pt-BR', { month: 'short' })
      .replace('.', '').charAt(0).toUpperCase() +
      d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').slice(1);
    const arr    = byMonth[key];
    const rating = arr?.length
      ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10
      : Math.round(avgRating * 10) / 10;
    return { month, rating };
  });

  return {
    averageRating: avgRating,
    totalReviews:  total,
    ratingDistribution,
    recentReviews: reviews.map((r, i) => ({
      id:      String(i + 1),
      author:  r.author_name,
      rating:  r.rating,
      text:    r.text,
      date:    new Date(r.time * 1000).toISOString().slice(0, 10),
      replied: false,
    })),
    unansweredCount: reviews.filter((r) => !r.relative_time_description.includes('respondid')).length,
    ratingHistory,
    topKeywords: extractKeywords(reviews),
  };
}

// ── Vite Plugin — /api/google-reviews ─────────────────────────────────────────
// WHY server-side: GOOGLE_PLACES_API_KEY has no "VITE_" prefix, so Vite never
// sends it to the browser. This middleware runs only in the Node.js process.
function googleReviewsPlugin(apiKey: string, placeId: string): Plugin {
  let cache: { data: unknown; ts: number } | null = null;
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour — avoids quota exhaustion

  return {
    name: 'google-reviews-api',

    configureServer(server) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use('/api/google-reviews', async (_req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');

        // No credentials → signal "not configured" (not an error)
        if (!apiKey || !placeId) {
          console.warn('[google-reviews] Missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID in .env.local');
          res.statusCode = 200;
          res.end(JSON.stringify({ configured: false }));
          return;
        }

        // Serve cached result while still fresh
        if (cache && Date.now() - cache.ts < CACHE_TTL) {
          res.end(JSON.stringify(cache.data));
          return;
        }

        try {
          const url = [
            'https://maps.googleapis.com/maps/api/place/details/json',
            `?place_id=${encodeURIComponent(placeId)}`,
            '&fields=name,rating,user_ratings_total,reviews',
            '&language=pt-BR',
            '&reviews_sort=newest',
            `&key=${apiKey}`,
          ].join('');

          console.log('[google-reviews] Calling Places API for place_id:', placeId);

          const body = await httpsGet(url);
          const json = JSON.parse(body) as PlaceApiResponse;

          console.log('[google-reviews] Places API status:', json.status);

          if (json.status !== 'OK') {
            const msg = `Places API returned: ${json.status}${json.error_message ? ' — ' + json.error_message : ''}`;
            console.error('[google-reviews]', msg);
            throw new Error(msg);
          }

          const data = { configured: true, ...transformPlaceData(json.result) };
          cache = { data, ts: Date.now() };
          res.end(JSON.stringify(data));
        } catch (err) {
          console.error('[google-reviews plugin] Error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ configured: true, error: String(err) }));
        }
      });
    },
  };
}

// ── Vite Plugin — /api/ocupacao ───────────────────────────────────────────────
function ocupacaoPlugin(): Plugin {
  let state = { beach: 0, lounges: Array(14).fill(0), prime: 0 };
  return {
    name: 'ocupacao-api',
    configureServer(server) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use('/api/ocupacao', (req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET') {
          res.end(JSON.stringify(state));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c: string) => { body += c; });
          req.on('end', () => {
            try {
              const d = JSON.parse(body);
              const cl = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number(n) || 0));
              state = {
                beach:   cl(d.beach, 0, 500),
                lounges: Array(14).fill(0).map((_: number, i: number) => cl(d.lounges?.[i], 0, 10)),
                prime:   cl(d.prime, 0, 10),
              };
            } catch { /* ignore */ }
            res.end(JSON.stringify(state));
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

// ── Vite config ───────────────────────────────────────────────────────────────
export default defineConfig(({ mode }) => {
  // loadEnv with '' prefix loads ALL .env vars (including non-VITE_ ones)
  // so the plugin can read GOOGLE_PLACES_API_KEY without exposing it to the browser
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      ocupacaoPlugin(),
      googleReviewsPlugin(
        env.GOOGLE_PLACES_API_KEY ?? '',
        env.GOOGLE_PLACE_ID       ?? '',
      ),
      paytourAggregatorPlugin(
        env.VITE_PAYTOUR_APP_KEY    ?? '',
        env.VITE_PAYTOUR_APP_SECRET ?? '',
      ),
    ],
    server: {
      host: true,
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
      proxy: {
        '/paytour-api': {
          target:       'https://api-ha.paytour.com.br',
          changeOrigin: true,
          rewrite:      (p) => p.replace(/^\/paytour-api/, ''),
          secure:       true,
        },
        '/sheets-api': {
          target:      'https://docs.google.com',
          changeOrigin: true,
          rewrite:     (path) => path.replace(/^\/sheets-api/, ''),
          secure:       true,
        },
      },
    },
  };
});
