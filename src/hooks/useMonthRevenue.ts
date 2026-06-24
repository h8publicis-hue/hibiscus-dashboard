import { useState, useEffect } from 'react';

const TTL    = 60 * 60 * 1000; // 1 hora
let cache: { revenue: number; ts: number } | null = null;

export function useMonthRevenue() {
  const [revenue, setRevenue] = useState<number | null>(cache?.revenue ?? null);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache && Date.now() - cache.ts < TTL) { setRevenue(cache.revenue); setLoading(false); return; }
    let cancelled = false;
    // Delay de 8s para não competir com fetches principais
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/paytour-faturamento', { signal: AbortSignal.timeout(20_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json() as { revenue: number };
        cache = { revenue: j.revenue, ts: Date.now() };
        if (!cancelled) { setRevenue(j.revenue); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }, 8_000);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  return { revenue, loading };
}
