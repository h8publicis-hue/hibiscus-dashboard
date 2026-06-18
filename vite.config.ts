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
    ],
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
      proxy: {
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
