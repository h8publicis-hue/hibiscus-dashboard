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

// ── Paytour server-side aggregator ────────────────────────────────────────────
// WHY: The Paytour API has 584+ pages sorted by tour date (not order date).
// April 2026 orders are spread across ALL pages — only Node.js can fetch them
// all efficiently (no 6-connection browser limit).
// Endpoint: GET /api/paytour-orders?since=YYYY-MM-DD&until=YYYY-MM-DD

// ── Paytour request via Vite proxy (node:http → localhost → proxy → Paytour) ────
// WHY node:http instead of fetch: undici (Node 18 fetch) usa HTTP/2 / keep-alive
// que o http-proxy do Vite não suporta bem, causando respostas HTML inválidas.
// node:http puro (HTTP/1.1) funciona corretamente com o proxy do Vite.
async function paytourRequest(vitePort: number, path: string, auth: string, method = 'GET'): Promise<string> {
  const { request } = await import('node:http');
  return new Promise<string>((resolve, reject) => {
    // Headers completos de browser — Paytour rejeita (retorna HTML) sem User-Agent/Origin
    const headers: Record<string, string> = {
      Authorization:    auth,
      Accept:           'application/json, text/plain, */*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Origin:           'https://app.paytour.com.br',
      Referer:          'https://app.paytour.com.br/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      Connection:       'close',
    };
    if (method === 'POST') headers['Content-Length'] = '0';

    const req = request(
      {
        hostname: 'localhost',
        port:     vitePort,
        path:     `/paytour-api${path}`,
        method,
        headers,
        timeout:  30_000,
      },
      (res) => {
        const buf: Buffer[] = [];
        res.on('data',  (c: Buffer) => buf.push(c));
        res.on('end',   () => {
          const text = Buffer.concat(buf).toString('utf8');
          if (text.trimStart().startsWith('<')) {
            reject(new Error(`Paytour HTML (${res.statusCode}) em ${path.slice(0, 60)}`));
          } else {
            resolve(text);
          }
        });
        res.on('error', reject);
      },
    );
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout em ${path.slice(0, 60)}`)); });
    req.end();
  });
}

function paytourAggregatorPlugin(appKey: string, appSecret: string): Plugin {
  let vitePort = 3000;
  const LIST_CONCURRENCY   = 30;
  const DETAIL_CONCURRENCY = 40;
  const LOOKBACK_MONTHS    = 5;

  let cachedToken: string | null = null;
  let tokenExpiry = 0;

  async function getToken(): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
    const creds = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
    console.log('[paytour] Autenticando…');
    const body = await paytourRequest(vitePort, '/v2/lojas/login?grant_type=application', `Basic ${creds}`, 'POST');
    let j: { access_token?: string; expires_in?: number };
    try { j = JSON.parse(body); } catch { throw new Error(`Auth não-JSON: ${body.slice(0, 200)}`); }
    if (!j.access_token) throw new Error(`Sem token: ${JSON.stringify(j).slice(0, 200)}`);
    cachedToken = j.access_token;
    tokenExpiry = Date.now() + (j.expires_in ?? 3600) * 1_000 - 60_000;
    console.log('[paytour] Token OK:', cachedToken.slice(0, 20) + '…');
    return cachedToken;
  }

  interface RawListOrder {
    id: string;
    status: string;
    valor: string;
    data_hora_pedido: string;
    pedido_origem?: string;
  }
  interface RawItem {
    produto_id: string;
    produto_disponibilidade_data: string;
    valor: string;
    nome_produto: string;
  }
  interface RawDetailOrder extends RawListOrder {
    itens?: RawItem[];
  }

  async function fetchListPage(tk: string, page: number): Promise<{ itens?: RawListOrder[]; info?: { total_paginas?: number } }> {
    try {
      const body = await paytourRequest(vitePort, `/v2/pedidos?por_pagina=30&pagina=${page}`, `Bearer ${tk}`);
      return JSON.parse(body);
    } catch {
      return { itens: [] };
    }
  }

  async function fetchOrderDetail(tk: string, id: string): Promise<RawDetailOrder | null> {
    try {
      const body = await paytourRequest(vitePort, `/v2/pedidos/${id}`, `Bearer ${tk}`);
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  // ── Cache em disco para sobreviver reinicializações ───────────────────────
  const DISK_CACHE_DIR  = new URL('.paytour-cache', import.meta.url).pathname;
  const DISK_CACHE_TTL  = 12 * 60 * 60_000; // 12h em disco

  async function readDiskCache(key: string): Promise<{ orders: RawDetailOrder[]; ts: number } | null> {
    try {
      const { readFile } = await import('node:fs/promises');
      const file = `${DISK_CACHE_DIR}/${key.replace(/:/g, '_')}.json`;
      const raw  = JSON.parse(await readFile(file, 'utf8'));
      if (Date.now() - raw.ts < DISK_CACHE_TTL) return raw;
      return null;
    } catch { return null; }
  }

  async function writeDiskCache(key: string, orders: RawDetailOrder[]): Promise<void> {
    try {
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(DISK_CACHE_DIR, { recursive: true });
      const file = `${DISK_CACHE_DIR}/${key.replace(/:/g, '_')}.json`;
      await writeFile(file, JSON.stringify({ orders, ts: Date.now() }));
    } catch (e) { console.warn('[paytour] Erro ao salvar cache em disco:', (e as Error).message); }
  }

  // Cache em memória
  interface CacheEntry { orders: RawDetailOrder[]; ts: number }
  interface ProgressEntry { current: number; total: number }
  const cache       = new Map<string, CacheEntry>();
  const inflight    = new Map<string, Promise<void>>();
  const progressMap = new Map<string, ProgressEntry>();
  const FRESH_TTL  = 10 * 60_000;
  const STALE_TTL  = 60 * 60_000;

  function todayStr(): string {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString().slice(0, 10);
  }

  // ── Fast path: "hoje" — busca só as primeiras páginas (pedidos criados hoje) ─
  async function doFetchToday(key: string): Promise<void> {
    const tk      = await getToken();
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const todayS  = todayStr();

    console.log(`[paytour] HOJE (fast path): buscando páginas recentes…`);
    progressMap.set(key, { current: 0, total: 10 });

    // Busca até 10 páginas ou até sair do dia de hoje
    const listOrders: RawListOrder[] = [];
    for (let p = 1; p <= 10; p++) {
      const page = await fetchListPage(tk, p);
      const items = page?.itens ?? [];
      let doneWithToday = false;
      for (const o of items) {
        const d = new Date(o.data_hora_pedido.replace(' ', 'T'));
        if (d >= today) listOrders.push(o);
        else { doneWithToday = true; break; }
      }
      progressMap.set(key, { current: p, total: 10 });
      if (doneWithToday || items.length === 0) break;
    }

    console.log(`[paytour] Hoje: ${listOrders.length} pedidos criados hoje — buscando detalhes…`);

    // Busca detalhes de TODOS os pedidos de hoje (são poucos)
    const details = await Promise.all(listOrders.map((o) => fetchOrderDetail(tk, o.id)));
    const orders  = details.filter(Boolean) as RawDetailOrder[];

    const totalValor  = orders.reduce((s, o) => s + parseFloat(o.valor ?? '0'), 0);
    const totalItens  = orders.reduce((s, o) => s + (o.itens?.length ?? 0), 0);
    console.log(`[paytour] HOJE ✓ ${orders.length} pedidos | ${totalItens} atividades | R$ ${totalValor.toFixed(2)}`);

    cache.set(key, { orders, ts: Date.now() });
    progressMap.delete(key);
    // Hoje não vai para disco — muda o dia todo
  }

  // ── Standard path: qualquer período com lookback ──────────────────────────
  async function doFetch(since: string, until: string | null): Promise<void> {
    const key       = `${since}:${until ?? ''}`;
    const sinceDate = new Date(`${since}T00:00:00`);
    const untilDate = until ? new Date(`${until}T23:59:59`) : new Date();

    // Fast path para "hoje"
    const isToday = since === todayStr() && (!until || until === todayStr());
    if (isToday) { await doFetchToday(key); return; }

    // ── Cache em disco ───────────────────────────────────────────────────────
    const disk = await readDiskCache(key);
    if (disk) {
      console.log(`[paytour] Cache disco: ${disk.orders.length} pedidos para ${key}`);
      cache.set(key, disk);
      progressMap.delete(key);
      return;
    }

    const tk = await getToken();

    // ── Lookback: pedidos criados até LOOKBACK_MONTHS antes do início ─────────
    const lookbackDate = new Date(sinceDate);
    lookbackDate.setMonth(lookbackDate.getMonth() - LOOKBACK_MONTHS);

    const p1         = await fetchListPage(tk, 1);
    const totalPages = p1?.info?.total_paginas ?? 1;
    console.log(`[paytour] ${since}→${until ?? 'hoje'}: lookback desde ${lookbackDate.toISOString().slice(0,10)}, ${totalPages} págs total`);

    const listOrders: RawListOrder[] = [...(p1?.itens ?? [])];
    let reachedLookback = false;
    progressMap.set(key, { current: 1, total: totalPages });

    for (let s = 2; s <= totalPages && !reachedLookback; s += LIST_CONCURRENCY) {
      const e     = Math.min(s + LIST_CONCURRENCY - 1, totalPages);
      const pages = await Promise.all(
        Array.from({ length: e - s + 1 }, (_, i) => fetchListPage(tk, s + i)),
      );
      for (const pg of pages) {
        for (const o of (pg?.itens ?? [])) {
          listOrders.push(o);
          if (new Date(o.data_hora_pedido.replace(' ', 'T')) < lookbackDate) {
            reachedLookback = true; break;
          }
        }
        if (reachedLookback) break;
      }
      progressMap.set(key, { current: Math.min(e, totalPages), total: totalPages });
    }

    const inWindow = listOrders.filter((o) => {
      const d = new Date(o.data_hora_pedido.replace(' ', 'T'));
      return d >= lookbackDate && d <= untilDate;
    });
    console.log(`[paytour] ${inWindow.length} pedidos na janela — buscando detalhes…`);

    // ── Detalhes em paralelo ─────────────────────────────────────────────────
    const detailed: RawDetailOrder[] = [];
    const totalDetail = inWindow.length;
    let doneDetail    = 0;
    for (let s = 0; s < totalDetail; s += DETAIL_CONCURRENCY) {
      const batch   = inWindow.slice(s, s + DETAIL_CONCURRENCY);
      const results = await Promise.all(batch.map((o) => fetchOrderDetail(tk, o.id)));
      results.forEach((r, i) => detailed.push(r ?? { ...batch[i], itens: [] }));
      doneDetail += batch.length;
      progressMap.set(key, {
        current: Math.round((doneDetail / totalDetail) * totalPages),
        total:   totalPages,
      });
    }

    // ── Filtra por data do PASSEIO ────────────────────────────────────────────
    const orders = detailed.filter((o) =>
      (o.itens ?? []).some((item) => {
        if (!item.produto_disponibilidade_data) return false;
        const d = new Date(item.produto_disponibilidade_data + 'T00:00:00');
        return d >= sinceDate && d <= untilDate;
      }),
    );

    const statusCount: Record<string, number> = {};
    let totalValor = 0;
    for (const o of orders) {
      statusCount[o.status] = (statusCount[o.status] ?? 0) + 1;
      totalValor += parseFloat(o.valor ?? '0');
    }
    console.log(`[paytour] ✓ ${orders.length} pedidos | R$ ${totalValor.toFixed(2)} | Status: ${JSON.stringify(statusCount)}`);

    cache.set(key, { orders, ts: Date.now() });
    progressMap.delete(key);
    await writeDiskCache(key, orders);
  }

  function ensureFetch(since: string, until: string | null): Promise<void> {
    const key = `${since}:${until ?? ''}`;
    if (inflight.has(key)) return inflight.get(key)!;
    const p = doFetch(since, until).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  function currentMonthRange(): { since: string; until: string } {
    const now   = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const until = now.toISOString().slice(0, 10);
    return { since, until };
  }

  // Cache "hoje" expira à meia-noite
  function todayCacheTTL(): number {
    const now       = new Date();
    const midnight  = new Date(now); midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  return {
    name: 'paytour-aggregator',
    configureServer(server) {

      // ── Pré-aquecer depois que o servidor estiver ouvindo (porta definida) ─
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        vitePort   = (typeof addr === 'object' && addr) ? addr.port : 3000;
        console.log(`[paytour] Servidor na porta ${vitePort} — pré-aquecendo em 2s…`);
        if (appKey && appSecret) {
          setTimeout(async () => {
            const today = todayStr();
            // 1. Hoje primeiro (fast ~5s)
            await ensureFetch(today, today).catch((e) => console.error('[paytour] Pré-aquec. hoje falhou:', e));
            // 2. Mês corrente em seguida (mais lento, tem cache em disco)
            const { since, until } = currentMonthRange();
            ensureFetch(since, until).catch((e) => console.error('[paytour] Pré-aquec. mês falhou:', e));
          }, 2000);
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = (req.url as string) ?? '';
        if (!url.startsWith('/api/paytour-orders')) return next();

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');

        if (!appKey || !appSecret) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Credenciais Paytour não configuradas' }));
          return;
        }

        const qs    = new URL(url, 'http://localhost').searchParams;
        const since = qs.get('since');
        const until = qs.get('until');
        if (!since) { res.statusCode = 400; res.end(JSON.stringify({ error: 'since obrigatório' })); return; }

        const key      = `${since}:${until ?? ''}`;
        const entry    = cache.get(key);
        const age      = entry ? Date.now() - entry.ts : Infinity;
        const isToday  = since === todayStr() && (!until || until === todayStr());
        // "Hoje" usa TTL curto (2 min) para dados sempre frescos no TV
        const freshTTL = isToday ? 2 * 60_000 : FRESH_TTL;

        // ── Cache fresco: retorna imediatamente ───────────────────────────
        if (entry && age < freshTTL) {
          console.log(`[paytour] Cache fresco: ${key} (${entry.orders.length} pedidos, ${Math.round(age/1000)}s atrás)`);
          res.end(JSON.stringify({ orders: entry.orders }));
          return;
        }

        // ── Cache velho (stale): retorna agora + revalida em background ───
        if (entry && age < STALE_TTL) {
          console.log(`[paytour] Stale: retornando ${entry.orders.length} pedidos + revalidando em background`);
          res.end(JSON.stringify({ orders: entry.orders, stale: true }));
          ensureFetch(since, until).catch(console.error); // background
          return;
        }

        // ── Sem cache: dispara fetch em background, retorna warmingUp ────
        // Browser faz polling a cada 5s até os dados ficarem prontos.
        // Isso evita que o browser fique pendurado por 60+ segundos.
        if (inflight.has(key)) {
          const prog = progressMap.get(key);
          res.end(JSON.stringify({ orders: [], warmingUp: true, progress: prog ?? null }));
          return;
        }
        console.log(`[paytour] Sem cache para ${key} — iniciando fetch…`);
        ensureFetch(since, until).catch((e) => console.error('[paytour] Erro:', e));
        res.end(JSON.stringify({ orders: [], warmingUp: true, progress: null }));
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
      port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
      proxy: {
        '/paytour-api': {
          target:      'https://api-ha.paytour.com.br',
          changeOrigin: true,
          rewrite:     (path) => path.replace(/^\/paytour-api/, ''),
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
