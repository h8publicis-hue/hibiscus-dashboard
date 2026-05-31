import { GoogleBusinessData } from '../types';

// Simple 5-min client-side cache so switching tabs doesn't re-fetch
let clientCache: { data: GoogleBusinessData | null; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchGoogleReviews(): Promise<GoogleBusinessData | null> {
  if (clientCache && Date.now() - clientCache.ts < CACHE_TTL) {
    return clientCache.data;
  }

  const res = await fetch('/api/google-reviews', {
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // Try to extract real error message from JSON body before throwing
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch { /* ignore parse error */ }
    throw new Error(detail);
  }

  const json = await res.json() as Record<string, unknown>;

  // Backend returns { configured: false } when env vars are missing
  if (json.configured === false) {
    clientCache = { data: null, ts: Date.now() };
    return null;
  }

  // Backend returned an error but is configured
  if (json.error) throw new Error(String(json.error));

  const data = json as unknown as GoogleBusinessData;
  clientCache = { data, ts: Date.now() };
  return data;
}

export function clearGoogleReviewsCache() { clientCache = null; }
