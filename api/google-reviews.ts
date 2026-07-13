import { get } from 'node:https';

function httpsGet(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(url, { timeout: 20000, headers }, (res) => {
      if ((res.statusCode ?? 0) >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

let cache: { data: unknown; ts: number } | null = null;
const TTL = 2 * 60 * 60 * 1000; // 2h

const STOP_WORDS = new Set([
  'a','o','e','de','do','da','em','para','com','um','uma','que','foi','mas',
  'muito','mais','não','por','se','no','na','os','as','dos','das','nos','nas',
  'são','está','este','esse','essa','aqui','pelo','pela','bem','também','só',
  'ele','ela','eles','elas','você','tudo','isso','ser','ter','tem','meu','sua',
]);

function buildKeywords(reviews: any[]) {
  const countsByPol: Record<'pos' | 'neg' | 'neu', Record<string, number>> = { pos: {}, neg: {}, neu: {} };
  reviews.forEach((r: any) => {
    const text = (r.text?.text ?? r.text ?? r.originalText?.text ?? '') as string;
    const pol: 'pos' | 'neg' | 'neu' = r.rating >= 4 ? 'pos' : r.rating <= 2 ? 'neg' : 'neu';
    text.toLowerCase().replace(/[^\w\sàáâãéêíóôõúç]/g, ' ').split(/\s+/)
      .filter((w: string) => w.length > 3 && !STOP_WORDS.has(w))
      .forEach((w: string) => { countsByPol[pol][w] = (countsByPol[pol][w] ?? 0) + 1; });
  });
  const allCounts: Record<string, number> = {};
  for (const pol of ['pos', 'neg', 'neu'] as const) {
    for (const [w, c] of Object.entries(countsByPol[pol])) {
      allCounts[w] = (allCounts[w] ?? 0) + (c as number);
    }
  }
  return Object.entries(allCounts)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 12)
    .map(([word, count]) => ({
      word, count,
      sentiment: countsByPol.neg[word] > (countsByPol.pos[word] ?? 0) ? 'neg'
               : (countsByPol.pos[word] ?? 0) > 0 ? 'pos' : 'neu',
    }));
}

function buildDistribution(reviews: any[], total: number) {
  const sampleDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((r: any) => { sampleDist[r.rating] = (sampleDist[r.rating] ?? 0) + 1; });
  const sN = reviews.length || 1;
  return [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: Math.round((sampleDist[s] / sN) * total) }));
}

function buildHistory(reviews: any[], avgRating: number) {
  const byMonth: Record<string, number[]> = {};
  reviews.forEach((r: any) => {
    const ts = r.publishTime ?? r.time;
    const d  = ts ? (typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)) : null;
    if (!d) return;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (byMonth[k] = byMonth[k] ?? []).push(r.rating);
  });
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const k     = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    const arr   = byMonth[k];
    const rating = arr?.length
      ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10
      : avgRating;
    return { month, rating };
  });
}

// ── Tenta Places API v1 (nova) — retorna ownerResponse ──────────────────────
async function fetchNewApi(placeId: string, apiKey: string) {
  const url  = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR&key=${apiKey}`;
  const body = await httpsGet(url, {
    Accept: 'application/json',
    'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews',
  });
  const json = JSON.parse(body) as any;
  if (!json.rating) throw new Error('Places v1: resposta inesperada');

  const reviews   = json.reviews ?? [];
  const total     = json.userRatingCount ?? 0;
  const avgRating = json.rating ?? 0;

  const recentReviews = reviews.map((r: any, i: number) => ({
    id:        String(i + 1),
    author:    r.authorAttribution?.displayName ?? 'Anônimo',
    rating:    r.rating,
    text:      r.text?.text ?? r.originalText?.text ?? '',
    date:      r.publishTime ? new Date(r.publishTime).toISOString().slice(0, 10) : '',
    replied:   !!r.ownerResponse?.text,
    replyText: (r.ownerResponse?.text ?? null) as string | null,
  }));

  return { reviews, total, avgRating, recentReviews };
}

// ── Fallback: Places API legada ──────────────────────────────────────────────
async function fetchLegacyApi(placeId: string, apiKey: string) {
  const url  = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,user_ratings_total,reviews&language=pt-BR&reviews_sort=newest&key=${apiKey}`;
  const body = await httpsGet(url);
  const json = JSON.parse(body) as any;
  if (json.status !== 'OK') throw new Error(`Places legacy: ${json.status}`);

  const place     = json.result;
  const reviews   = place.reviews ?? [];
  const total     = place.user_ratings_total ?? 0;
  const avgRating = place.rating ?? 0;

  const recentReviews = reviews.map((r: any, i: number) => ({
    id:        String(i + 1),
    author:    r.author_name ?? 'Anônimo',
    rating:    r.rating,
    text:      r.text ?? '',
    date:      r.time ? new Date(r.time * 1000).toISOString().slice(0, 10) : '',
    replied:   false,   // API legada não retorna respostas
    replyText: null,
  }));

  return { reviews, total, avgRating, recentReviews };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  const apiKey  = process.env.GOOGLE_PLACES_API_KEY ?? '';
  const placeId = process.env.GOOGLE_PLACE_ID ?? '';
  if (!apiKey || !placeId) return res.json({ configured: false });
  if (cache && Date.now() - cache.ts < TTL) return res.json(cache.data);

  try {
    // Tenta nova API (com ownerResponse); cai para legada se não habilitada
    let result: Awaited<ReturnType<typeof fetchNewApi>>;
    try {
      result = await fetchNewApi(placeId, apiKey);
      console.log('[google] usando Places API v1 (nova)');
    } catch (e: any) {
      console.warn(`[google] Places v1 falhou (${e.message}), usando API legada`);
      result = await fetchLegacyApi(placeId, apiKey);
    }

    const { reviews, total, avgRating, recentReviews } = result;

    const topKeywords     = buildKeywords(reviews);
    const ratingDistribution = buildDistribution(reviews, total);
    const ratingHistory   = buildHistory(reviews, avgRating);
    const unansweredCount = recentReviews.filter((r: any) => !r.replied && r.text).length;
    const last5Avg        = reviews.length
      ? Math.round((reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length) * 10) / 10
      : null;

    const data = {
      configured: true,
      averageRating: avgRating,
      totalReviews: total,
      ratingDistribution,
      ratingHistory,
      topKeywords,
      recentReviews,
      unansweredCount,
      last5Avg,
    };
    cache = { data, ts: Date.now() };
    return res.json(data);
  } catch (err: any) {
    console.error('[google]', err.message);
    return res.status(500).json({ configured: true, error: String(err) });
  }
}
