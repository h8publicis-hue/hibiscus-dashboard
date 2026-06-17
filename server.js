// ── Production server for Railway ────────────────────────────────────────────
// Serves the React build + API endpoints + auth
import express       from 'express';
import cookieParser  from 'cookie-parser';
import { createHash } from 'node:crypto';
import { get }        from 'node:https';
import { request }    from 'node:https';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT ?? 3000;
const PASSWORD  = process.env.DASHBOARD_PASSWORD ?? '';
const COOKIE_SECRET = process.env.COOKIE_SECRET ?? 'hibiscus-secret-2026';

const app = express();
app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));

// ── Assets estáticos SEMPRE acessíveis (sem auth) ─────────────────────────────
app.use(express.static(join(__dirname, 'dist')));

// ── Auth helpers ──────────────────────────────────────────────────────────────
function hashPassword(p) {
  return createHash('sha256').update(p + COOKIE_SECRET).digest('hex');
}

function isAuthenticated(req) {
  if (!PASSWORD) return true; // sem senha configurada = acesso livre
  const cookie = req.signedCookies?.auth;
  return cookie === hashPassword(PASSWORD);
}

function authMiddleware(req, res, next) {
  if (req.path === '/login' || req.path.startsWith('/api/auth')) return next();
  if (isAuthenticated(req)) return next();
  // SPA: retorna 401 para requests de API, redireciona para /login nos demais
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Não autorizado' });
  } else {
    res.redirect('/login');
  }
}

// auth desativado — acesso direto
// app.use(authMiddleware);

// ── Auth endpoints ────────────────────────────────────────────────────────────
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (!PASSWORD || password === PASSWORD) {
    res.cookie('auth', hashPassword(PASSWORD), {
      signed:   true,
      httpOnly: true,
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 dias
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
    });
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Senha incorreta' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth');
  res.json({ ok: true });
});

app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// ── Google Reviews ────────────────────────────────────────────────────────────
let googleCache = null;
const GOOGLE_CACHE_TTL = 60 * 60 * 1000; // 1h

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Google timeout')); });
  });
}

function transformGoogleData(place) {
  const reviews   = place.reviews ?? [];
  const total     = place.user_ratings_total ?? 0;
  const avgRating = place.rating ?? 0;
  const stop = new Set(['a','o','e','de','do','da','em','para','com','um','uma','que','foi','mas','muito','mais','não','por','se','no','na','the','and','was','is','in','of','to','for','it','we']);
  const counts = {};
  reviews.forEach((r) => {
    r.text?.toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/)
      .filter((w) => w.length > 3 && !stop.has(w))
      .forEach((w) => { counts[w] = (counts[w] ?? 0) + 1; });
  });
  const topKeywords = Object.entries(counts).sort(([,a],[,b])=>b-a).slice(0,10).map(([word,count])=>({word,count}));
  const sampleDist = {1:0,2:0,3:0,4:0,5:0};
  reviews.forEach((r) => { sampleDist[r.rating] = (sampleDist[r.rating]??0)+1; });
  const sN = reviews.length||1;
  const ratingDistribution = [5,4,3,2,1].map((s)=>({stars:s,count:Math.round((sampleDist[s]/sN)*total)}));
  const byMonth = {};
  reviews.forEach((r) => {
    const d = new Date(r.time*1000);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    (byMonth[k] = byMonth[k]??[]).push(r.rating);
  });
  const now = new Date();
  const ratingHistory = Array.from({length:6},(_,i)=>{
    const d = new Date(now.getFullYear(), now.getMonth()-(5-i), 1);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const month = d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
    const arr = byMonth[k];
    const rating = arr?.length ? Math.round((arr.reduce((s,v)=>s+v,0)/arr.length)*10)/10 : Math.round(avgRating*10)/10;
    return {month,rating};
  });
  return {
    averageRating: avgRating, totalReviews: total,
    ratingDistribution,
    recentReviews: reviews.map((r,i)=>({id:String(i+1),author:r.author_name,rating:r.rating,text:r.text,date:new Date(r.time*1000).toISOString().slice(0,10),replied:false})),
    unansweredCount: reviews.length,
    ratingHistory, topKeywords,
  };
}

app.get('/api/google-reviews', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const apiKey  = process.env.GOOGLE_PLACES_API_KEY ?? '';
  const placeId = process.env.GOOGLE_PLACE_ID ?? '';
  if (!apiKey || !placeId) { res.json({ configured: false }); return; }
  if (googleCache && Date.now() - googleCache.ts < GOOGLE_CACHE_TTL) {
    res.json(googleCache.data); return;
  }
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,user_ratings_total,reviews&language=pt-BR&reviews_sort=newest&key=${apiKey}`;
    const body = await httpsGet(url);
    const json = JSON.parse(body);
    if (json.status !== 'OK') throw new Error(`Places: ${json.status}`);
    const data = { configured: true, ...transformGoogleData(json.result) };
    googleCache = { data, ts: Date.now() };
    res.json(data);
  } catch (err) {
    console.error('[google]', err.message);
    res.status(500).json({ configured: true, error: String(err) });
  }
});

// ── Google Sheets proxy (SurveyMonkey/NPS) ───────────────────────────────────
app.get('/sheets-api/*', async (req, res) => {
  const path = req.url.replace('/sheets-api', '');
  const url  = `https://docs.google.com${path}`;
  try {
    const body = await httpsGet(url);
    res.setHeader('Content-Type', 'application/json');
    res.send(body);
  } catch (err) {
    res.status(500).send(String(err));
  }
});

// ── Paytour aggregator ────────────────────────────────────────────────────────
const PAYTOUR_API    = 'https://api-ha.paytour.com.br';
const PAYTOUR_HDRS   = {
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin':          'https://app.paytour.com.br',
  'Referer':         'https://app.paytour.com.br/',
  'Sec-Fetch-Dest':  'empty',
  'Sec-Fetch-Mode':  'cors',
  'Sec-Fetch-Site':  'same-site',
};
const DISK_CACHE_DIR = join(__dirname, '.paytour-cache');
const DISK_TTL       = 12 * 60 * 60_000;
const MEM_FRESH_TTL  = 10 * 60_000;
const MEM_STALE_TTL  = 60 * 60_000;

const memCache    = new Map();
const inflight    = new Map();
const progressMap = new Map();

let   cachedToken = null;
let   tokenExpiry = 0;

function paytourFetch(path, auth, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(PAYTOUR_API + path);
    const hdrs = { ...PAYTOUR_HDRS, Authorization: auth };
    if (method === 'POST') hdrs['Content-Length'] = '0';
    const req = request(
      { hostname: url.hostname, path: url.pathname + url.search, method, headers: hdrs, timeout: 30_000 },
      (res) => {
        const buf = [];
        res.on('data', (c) => buf.push(c));
        res.on('end',  () => {
          const text = Buffer.concat(buf).toString('utf8');
          if (text.trimStart().startsWith('<')) reject(new Error(`HTML response em ${path.slice(0,50)}`));
          else resolve(text);
        });
        res.on('error', reject);
      },
    );
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout ${path.slice(0,50)}`)); });
    req.end();
  });
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const appKey    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
  const appSecret = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
  if (!appKey || !appSecret) throw new Error('Credenciais Paytour não configuradas');
  const creds = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
  const body  = await paytourFetch('/v2/lojas/login?grant_type=application', `Basic ${creds}`, 'POST');
  const j     = JSON.parse(body);
  if (!j.access_token) throw new Error('Sem token Paytour');
  cachedToken = j.access_token;
  tokenExpiry = Date.now() + (j.expires_in ?? 3600) * 1_000 - 60_000;
  console.log('[paytour] Token OK');
  return cachedToken;
}

async function fetchListPage(tk, page) {
  try {
    const body = await paytourFetch(`/v2/pedidos?por_pagina=30&pagina=${page}`, `Bearer ${tk}`);
    return JSON.parse(body);
  } catch { return { itens: [] }; }
}

async function fetchDetail(tk, id) {
  try {
    const body = await paytourFetch(`/v2/pedidos/${id}`, `Bearer ${tk}`);
    return JSON.parse(body);
  } catch { return null; }
}

async function readDiskCache(key) {
  try {
    const file = join(DISK_CACHE_DIR, key.replace(/:/g,'_') + '.json');
    const raw  = JSON.parse(await readFile(file, 'utf8'));
    if (Date.now() - raw.ts < DISK_TTL) return raw;
    return null;
  } catch { return null; }
}

async function deleteDiskCache(key) {
  try {
    await unlink(join(DISK_CACHE_DIR, key.replace(/:/g,'_') + '.json'));
  } catch { /* já não existe — ok */ }
}

async function writeDiskCache(key, orders) {
  try {
    await mkdir(DISK_CACHE_DIR, { recursive: true });
    const file = join(DISK_CACHE_DIR, key.replace(/:/g,'_') + '.json');
    await writeFile(file, JSON.stringify({ orders, ts: Date.now() }));
  } catch (e) { console.warn('[paytour] Disco:', e.message); }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Sync completo por data do PASSEIO (para uso noturno) ──────────────────────
// Busca todos os pedidos, filtra itens com produto_disponibilidade_data no período.
// Demora ~5-15 min — roda de madrugada e salva em disco.
async function doFullSync(since, until) {
  const key       = `${since}:${until}`;
  const sinceDate = new Date(`${since}T00:00:00`);
  const untilDate = new Date(`${until}T23:59:59`);
  const tk        = await getToken();

  console.log(`[paytour:sync] Iniciando sync ${since}→${until} (lookback 3 meses)`);

  // Lookback: busca pedidos criados até 3 meses antes do início do período
  const lookback = new Date(`${since}T00:00:00`);
  lookback.setMonth(lookback.getMonth() - 3);
  console.log(`[paytour:sync] Lookback desde ${lookback.toISOString().slice(0,10)}`);

  // 1. Busca páginas até ultrapassar o lookback (para cedo!)
  const p1         = await fetchListPage(tk, 1);
  const totalPages = p1?.info?.total_paginas ?? 1;
  progressMap.set(key, { current: 1, total: totalPages });

  const allList = [...(p1?.itens ?? [])];
  let reached = false;

  // Verifica já na página 1
  for (const o of (p1?.itens ?? [])) {
    if (new Date(o.data_hora_pedido.replace(' ','T')) < lookback) { reached = true; break; }
  }

  for (let s = 2; s <= totalPages && !reached; s += 10) {
    const e     = Math.min(s + 9, totalPages);
    const pages = await Promise.all(Array.from({ length: e - s + 1 }, (_, i) => fetchListPage(tk, s + i)));
    for (const pg of pages) {
      for (const o of (pg?.itens ?? [])) {
        allList.push(o);
        if (new Date(o.data_hora_pedido.replace(' ','T')) < lookback) { reached = true; break; }
      }
      if (reached) break;
    }
    progressMap.set(key, { current: Math.min(e, totalPages), total: totalPages });
  }
  console.log(`[paytour:sync] Parou na pág ${progressMap.get(key)?.current}: ${allList.length} pedidos brutos`);

  // 2. Busca detalhes em paralelo (para ter data do passeio)
  const BATCH = 40;
  const detailed = [];
  for (let s = 0; s < allList.length; s += BATCH) {
    const batch   = allList.slice(s, s + BATCH);
    const results = await Promise.all(batch.map((o) => fetchDetail(tk, o.id)));
    results.forEach((r, i) => detailed.push(r ?? { ...batch[i], itens: [] }));
    if (s % 400 === 0) console.log(`[paytour:sync] Detalhes: ${s}/${allList.length}`);
  }

  // 3. Filtra por data do PASSEIO nos itens
  const orders = detailed.filter((o) => {
    const grp = (o.status ?? '').toLowerCase();
    if (grp === 'cancelado' || grp === 'reprovado') return false;
    return (o.itens ?? []).some((item) => {
      if (!item.produto_disponibilidade_data) return false;
      const d = new Date(item.produto_disponibilidade_data + 'T00:00:00');
      return d >= sinceDate && d <= untilDate;
    });
  });

  const totalValor = orders.reduce((s, o) => s + parseFloat(o.valor ?? '0'), 0);
  const totalItens = orders.reduce((s, o) => s + (o.itens ?? []).filter((i) => {
    if (!i.produto_disponibilidade_data) return false;
    const d = new Date(i.produto_disponibilidade_data + 'T00:00:00');
    return d >= sinceDate && d <= untilDate;
  }).length, 0);

  console.log(`[paytour:sync] ✅ ${orders.length} pedidos | ${totalItens} atividades | R$ ${totalValor.toFixed(2)}`);

  memCache.set(key, { orders, ts: Date.now() });
  progressMap.delete(key);
  await writeDiskCache(key, orders);
  return orders;
}

// ── Agendador noturno ─────────────────────────────────────────────────────────
function nextMonthRange() {
  const now   = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
  const until = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);
  return { since, until };
}

function scheduleMidnightSync() {
  const now     = new Date();
  const target  = new Date(now);
  target.setHours(3, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;

  console.log(`[paytour:sync] Próximo sync: ${target.toLocaleString('pt-BR')} (em ${Math.round(msUntil/60000)} min)`);

  setTimeout(async () => {
    const n     = new Date();
    // Mês atual
    const since = new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
    const until = new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10);
    // Mês seguinte
    const { since: ns, until: nu } = nextMonthRange();

    console.log(`[paytour:sync] 🌙 Sync noturno: ${since}→${until} + ${ns}→${nu}`);
    try {
      // Mês atual: abordagem rápida por data de criação (lista) — renova cache em disco
      const curKey  = `${since}:${until}`;
      const nextKey = `${ns}:${nu}`;
      // Apaga caches antigos para forçar uma busca fresca (não confiar no TTL)
      memCache.delete(curKey);
      memCache.delete(nextKey);
      await deleteDiskCache(curKey);
      await deleteDiskCache(nextKey);

      await ensureFetch(since, until);

      // Mês seguinte: sync completo por data do passeio — renova cache em disco
      // (sem isso, o cache só era atualizado no startup e expirava em pleno expediente)
      await doFullSync(ns, nu);

      console.log(`[paytour:sync] 🌙 Sync noturno concluído!`);
    } catch (e) {
      console.error(`[paytour:sync] Erro:`, e.message);
    }
    scheduleMidnightSync();
  }, msUntil);
}

async function doFetchToday(key) {
  const tk    = await getToken();
  const today = new Date(); today.setHours(0,0,0,0);
  progressMap.set(key, { current: 0, total: 10 });
  const listOrders = [];
  for (let p = 1; p <= 10; p++) {
    const page = await fetchListPage(tk, p);
    const items = page?.itens ?? [];
    let done = false;
    for (const o of items) {
      const d = new Date(o.data_hora_pedido.replace(' ','T'));
      if (d >= today) listOrders.push(o);
      else { done = true; break; }
    }
    progressMap.set(key, { current: p, total: 10 });
    if (done || items.length === 0) break;
  }
  console.log(`[paytour] Hoje: ${listOrders.length} pedidos — buscando detalhes…`);
  const details = await Promise.all(listOrders.map((o) => fetchDetail(tk, o.id)));
  const orders  = details.filter(Boolean);
  const total   = orders.reduce((s,o) => s + parseFloat(o.valor??'0'), 0);
  const itens   = orders.reduce((s,o) => s + (o.itens?.length??0), 0);
  console.log(`[paytour] HOJE ✓ ${orders.length} pedidos | ${itens} atividades | R$ ${total.toFixed(2)}`);
  memCache.set(key, { orders, ts: Date.now() });
  progressMap.delete(key);
}

async function doFetch(since, until) {
  const key       = `${since}:${until ?? ''}`;
  const sinceDate = new Date(`${since}T00:00:00`);
  const untilDate = until ? new Date(`${until}T23:59:59`) : new Date();
  const isToday   = since === todayStr() && (!until || until === todayStr());

  if (isToday) { await doFetchToday(key); return; }

  // Usa cache em disco se válido — renova ts para evitar re-sync imediato
  const disk = await readDiskCache(key);
  if (disk) {
    console.log(`[paytour] Cache disco ✅ ${disk.orders.length} pedidos para ${key}`);
    memCache.set(key, { orders: disk.orders, ts: Date.now() });
    progressMap.delete(key);
    return;
  }

  // Próximo mês: usa doFullSync (tour date filtering)
  const { since: _ns, until: _nu } = nextMonthRange();
  if (since === _ns && until === _nu) {
    await doFullSync(since, until);
    return;
  }

  // Sem cache: busca lista completa filtrando por data_hora_pedido (sem N+1)
  const tk = await getToken();
  const p1         = await fetchListPage(tk, 1);
  const totalPages = p1?.info?.total_paginas ?? 1;
  console.log(`[paytour] ${since}→${until??'hoje'}: varrendo ${totalPages} págs por data de pedido`);

  const allItems = [...(p1?.itens ?? [])];
  progressMap.set(key, { current: 1, total: totalPages });

  for (let s = 2; s <= totalPages; s += 30) {
    const e     = Math.min(s + 29, totalPages);
    const pages = await Promise.all(Array.from({ length: e - s + 1 }, (_, i) => fetchListPage(tk, s + i)));
    pages.forEach((pg) => allItems.push(...(pg?.itens ?? [])));
    progressMap.set(key, { current: Math.min(e, totalPages), total: totalPages });
  }

  // Filtra por data de criação do pedido no período
  const seen = new Set();
  const orders = [];
  for (const o of allItems) {
    if (!o?.data_hora_pedido || seen.has(o.id)) continue;
    const d = new Date(o.data_hora_pedido.replace(' ', 'T'));
    const grp = (o.status ?? '').toLowerCase();
    if (d >= sinceDate && d <= untilDate && grp !== 'cancelado' && grp !== 'reprovado') {
      seen.add(o.id);
      orders.push({ ...o, itens: [] }); // sem detalhes
    }
  }

  const totalValor = orders.reduce((s, o) => s + parseFloat(o.valor ?? '0'), 0);
  console.log(`[paytour] ✅ ${orders.length} pedidos | R$ ${totalValor.toFixed(2)} para ${key}`);

  memCache.set(key, { orders, ts: Date.now() });
  progressMap.delete(key);
  await writeDiskCache(key, orders);
}

function ensureFetch(since, until) {
  const key = `${since}:${until??''}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = doFetch(since, until).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

app.get('/api/paytour-orders', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const { since, until } = req.query;
  if (!since) { res.status(400).json({ error: 'since obrigatório' }); return; }

  const key     = `${since}:${until??''}`;
  const entry   = memCache.get(key);
  const age     = entry ? Date.now() - entry.ts : Infinity;
  const isToday = since === todayStr() && (!until || until === todayStr());
  const freshTTL = isToday ? 2 * 60_000 : MEM_FRESH_TTL;

  if (entry && age < freshTTL)   { res.json({ orders: entry.orders }); return; }
  if (entry && age < MEM_STALE_TTL) {
    res.json({ orders: entry.orders, stale: true });
    ensureFetch(since, until ?? null).catch(console.error);
    return;
  }
  if (inflight.has(key)) {
    const prog = progressMap.get(key);
    res.json({ orders: [], warmingUp: true, progress: prog ?? null });
    return;
  }
  ensureFetch(since, until ?? null).catch(console.error);
  res.json({ orders: [], warmingUp: true, progress: null });
});

// ── Pre-warm on startup ───────────────────────────────────────────────────────
setTimeout(async () => {
  const appKey    = process.env.VITE_PAYTOUR_APP_KEY ?? '';
  const appSecret = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
  if (!appKey || !appSecret) return;

  // 1. Hoje (rápido — sempre atualiza)
  const today = todayStr();
  await ensureFetch(today, today).catch((e) => console.error('[paytour] Hoje falhou:', e.message));

  // 2. Mês corrente — verifica se tem cache em disco válido
  const now   = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const until = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const key   = `${since}:${until}`;

  const diskExists = await readDiskCache(key);
  if (diskExists) {
    console.log(`[paytour] Cache mensal em disco — carregando instantaneamente`);
    memCache.set(key, { orders: diskExists.orders, ts: Date.now() });
  } else {
    console.log(`[paytour] Sem cache mensal — iniciando sync em background…`);
    doFullSync(since, until).catch((e) => console.error('[paytour] Sync mês falhou:', e.message));
  }

  // 3. Mês seguinte — sync completo por data do passeio (tour date)
  const { since: ns, until: nu } = nextMonthRange();
  const nextKey  = `${ns}:${nu}`;
  const nextDisk = await readDiskCache(nextKey);
  if (nextDisk) {
    console.log(`[paytour] Cache mês seguinte em disco`);
    memCache.set(nextKey, { orders: nextDisk.orders, ts: Date.now() });
  } else {
    console.log(`[paytour:sync] Iniciando sync de ${ns}→${nu} (tour date, ~10-15 min)…`);
    // Roda em background — não bloqueia o startup
    doFullSync(ns, nu).catch((e) => console.error('[paytour] Sync julho falhou:', e.message));
  }

  // 4. Agenda sync noturno
  scheduleMidnightSync();
}, 3000);

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] Hibiscus Dashboard rodando na porta ${PORT}`);
});
