import { IncomingMessage, ServerResponse } from 'http';
import { get } from 'https';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PlaceReview {
  author_name:                string;
  rating:                     number;
  text:                       string;
  time:                       number;
  relative_time_description:  string;
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Places HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Places API timeout')); });
  });
}

function extractKeywords(reviews: PlaceReview[]) {
  const stop = new Set([
    'a','o','e','de','do','da','em','para','com','um','uma','que','foi',
    'mas','muito','mais','não','por','se','no','na','os','as','ou','ao',
    'dos','das','me','seu','sua','esse','essa','isso','pela','pelo',
    'the','and','was','is','in','of','to','for','it','we','our','very',
  ]);
  const counts: Record<string, number> = {};
  reviews.forEach((r) => {
    r.text.toLowerCase()
      .replace(/[^a-záâãàéêíóôõúüçA-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stop.has(w))
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

  const sampleDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((r) => { sampleDist[r.rating] = (sampleDist[r.rating] ?? 0) + 1; });
  const sampleN = reviews.length || 1;
  const ratingDistribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: Math.round((sampleDist[stars] / sampleN) * total),
  }));

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
    unansweredCount: reviews.length,
    ratingHistory,
    topKeywords: extractKeywords(reviews),
  };
}

// ── Vercel Serverless Handler ─────────────────────────────────────────────────
export default async function handler(
  _req: IncomingMessage,
  res: ServerResponse,
) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey  = process.env.GOOGLE_PLACES_API_KEY ?? '';
  const placeId = process.env.GOOGLE_PLACE_ID       ?? '';

  if (!apiKey || !placeId) {
    res.end(JSON.stringify({ configured: false }));
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

    const body = await httpsGet(url);
    const json = JSON.parse(body) as PlaceApiResponse;

    if (json.status !== 'OK') {
      throw new Error(`Places API returned: ${json.status}${json.error_message ? ' — ' + json.error_message : ''}`);
    }

    const data = { configured: true, ...transformPlaceData(json.result) };

    // Cache 1 hour via Vercel CDN
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[google-reviews]', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ configured: true, error: String(err) }));
  }
}
