import { useState, useEffect } from 'react';

export interface CheckinData {
  reservados: number;
  disponiveis: number;
  checkins: number;
  pendentes: number;
  total: number;
  ts: number;
}

let cache: (CheckinData & { fetchedAt: number }) | null = null;
const TTL = 5 * 60 * 1000;

export function useCheckin() {
  const [data, setData]       = useState<CheckinData | null>(cache ?? null);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAt < TTL) { setData(cache); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/checkin');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json() as CheckinData;
        cache = { ...j, fetchedAt: Date.now() };
        if (!cancelled) { setData(j); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
