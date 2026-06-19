import { GoogleBusinessData } from '../types';

let clientCache: { data: GoogleBusinessData | null; ts: number } | null = null;
let inflight: Promise<GoogleBusinessData | null> | null = null;
const CACHE_TTL = 60 * 60 * 1000;  // 60 min — avaliações Google raramente mudam

export async function fetchGoogleReviews(): Promise<GoogleBusinessData | null> {
  if (clientCache && Date.now() - clientCache.ts < CACHE_TTL) {
    return clientCache.data;
  }

  // Deduplication: se já tem uma request em voo retorna a mesma promise
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch('/api/google-reviews', { signal: AbortSignal.timeout(15_000) });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const b = await res.json() as { error?: string }; if (b.error) detail = b.error; } catch { /* ignore */ }
        throw new Error(detail);
      }

      const json = await res.json() as Record<string, unknown>;

      if (json.configured === false) {
        clientCache = { data: null, ts: Date.now() };
        return null;
      }

      if (json.error) throw new Error(String(json.error));

      const data = json as unknown as GoogleBusinessData;
      clientCache = { data, ts: Date.now() };
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function clearGoogleReviewsCache() {
  clientCache = null;
  inflight    = null;
}
