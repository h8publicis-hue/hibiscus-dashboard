// ── Production server for Railway ────────────────────────────────────────────
// Serves the React build + API endpoints + auth
import express       from 'express';
import cookieParser  from 'cookie-parser';
import { createHash } from 'node:crypto';
import { get, request as httpRequest } from 'node:https';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs   from 'node:fs';
import path from 'node:path';

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

// ── Paytour ───────────────────────────────────────────────────────────────────
const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'api-ha.paytour.com.br';
const PT_DISK   = path.join(dirname(fileURLToPath(import.meta.url)), '.paytour-cache');
const PT_DISK_TTL = 12 * 60 * 60 * 1000;
const ptMemCache  = new Map();
const TTL_TODAY   = 2  * 60 * 1000;
const TTL_OTHER   = 10 * 60 * 1000;

// ── Paytour auth (JWT) ────────────────────────────────────────────────────────
let ptToken = '';
let ptTokenExpiry = 0;

async function getPtToken() {
  if (ptToken && Date.now() < ptTokenExpiry) return ptToken;
  const creds = Buffer.from(`${PT_KEY}:${PT_SECRET}`).toString('base64');
  const res   = await fetch(`https://${PT_BASE}/v2/lojas/login?grant_type=application`, {
    method:  'POST',
    headers: {
      Authorization:    `Basic ${creds}`,
      'User-Agent':     'Mozilla/5.0',
      Origin:           'https://app.paytour.com.br',
      'Content-Length': '0',
    },
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`Paytour auth failed: ${JSON.stringify(j)}`);
  ptToken       = j.access_token;
  ptTokenExpiry = Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000;
  console.log('[paytour] token OK');
  return ptToken;
}

async function paytourApiGet(urlPath) {
  const tk  = await getPtToken();
  const res = await fetch(`https://${PT_BASE}${urlPath}`, {
    headers: {
      Authorization: `Bearer ${tk}`,
      'User-Agent':  'Mozilla/5.0',
      Origin:        'https://app.paytour.com.br',
      Referer:       'https://app.paytour.com.br/',
      Accept:        'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  return res.json();
}

async function fetchPaytourOrders(since, until) {
  const _n      = new Date();
  const today   = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,'0')}-${String(_n.getDate()).padStart(2,'0')}`;
  const isToday = since === today && until === today;
  const maxPage = isToday ? 10 : 9999;
  const all     = [];

  for (let page = 1; page <= maxPage; page++) {
    const data  = await paytourApiGet(`/v2/pedidos?por_pagina=30&pagina=${page}`);
    const items = data?.itens ?? [];
    if (!items.length) break;

    let done = false;
    for (const o of items) {
      const d = o.data_hora_pedido.slice(0, 10);
      if (d < since) { done = true; break; }
      if (d <= until) all.push(o);
    }
    if (done) break;

    const totalPages = data?.info?.total_paginas ?? page;
    if (page >= totalPages) break;
  }

  console.log(`[paytour] ${since}→${until}: ${all.length} pedidos`);
  return all;
}

function ptDiskPath(since, until) { return path.join(PT_DISK, `${since}_${until}.json`); }
function readPtDisk(since, until) {
  try {
    const p = ptDiskPath(since, until);
    if (Date.now() - fs.statSync(p).mtimeMs > PT_DISK_TTL) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}
function writePtDisk(since, until, orders) {
  try { fs.mkdirSync(PT_DISK, { recursive: true }); fs.writeFileSync(ptDiskPath(since, until), JSON.stringify(orders)); }
  catch { /* ignore */ }
}
function ptRevalidate(since, until) {
  const today = new Date().toISOString().slice(0, 10);
  const key   = `${since}_${until}`;
  fetchPaytourOrders(since, until)
    .then((orders) => {
      ptMemCache.set(key, { orders, ts: Date.now() });
      if (since !== today || until !== today) writePtDisk(since, until, orders);
    })
    .catch((e) => console.error('[paytour] revalidate error:', e));
}

app.get('/api/paytour-orders', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (!PT_KEY || !PT_SECRET) { res.json({ orders: [] }); return; }
  const today = new Date().toISOString().slice(0, 10);
  const since = req.query.since ?? today;
  const until = req.query.until ?? today;
  const key   = `${since}_${until}`;
  const ttl   = (since === today && until === today) ? TTL_TODAY : TTL_OTHER;
  const cached = ptMemCache.get(key);
  if (cached) {
    const stale = Date.now() - cached.ts > ttl;
    if (stale) ptRevalidate(since, until);
    res.json({ orders: cached.orders, stale }); return;
  }
  const disk = readPtDisk(since, until);
  if (disk) {
    ptMemCache.set(key, { orders: disk, ts: Date.now() });
    ptRevalidate(since, until);
    res.json({ orders: disk, stale: true }); return;
  }
  try {
    const orders = await fetchPaytourOrders(since, until);
    ptMemCache.set(key, { orders, ts: Date.now() });
    if (since !== today || until !== today) writePtDisk(since, until, orders);
    res.json({ orders });
  } catch (err) {
    console.error('[paytour]', err.message);
    res.status(500).json({ error: String(err) });
  }
});

// ── Ocupação (persistida em arquivo) ─────────────────────────────────────────
const OCC_FILE = path.join(dirname(fileURLToPath(import.meta.url)), '.ocupacao.json');
const DEFAULT_OCC = { beach: 0, lounges: Array(14).fill(0), prime: 0 };

function readOcc() {
  try { return JSON.parse(fs.readFileSync(OCC_FILE, 'utf8')); } catch { return DEFAULT_OCC; }
}
function writeOcc(data) {
  try { fs.writeFileSync(OCC_FILE, JSON.stringify(data)); } catch { /* ignore */ }
}

app.get('/api/ocupacao', (req, res) => {
  res.json(readOcc());
});

app.post('/api/ocupacao', (req, res) => {
  const { beach, lounges, prime } = req.body;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
  const data = {
    beach:   clamp(beach, 0, 500),
    lounges: Array(14).fill(0).map((_, i) => clamp(lounges?.[i], 0, 10)),
    prime:   clamp(prime, 0, 10),
  };
  writeOcc(data);
  res.json(data);
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

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] Hibiscus Dashboard rodando na porta ${PORT}`);
});
