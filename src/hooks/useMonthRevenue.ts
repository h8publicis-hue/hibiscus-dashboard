import { useState, useEffect } from 'react';

const TTL = 5 * 60 * 1000; // 5 min
type Cache = { revenue: number; bruto: number; descontos: number; ts: number };
let cache: Cache | null = null;

export function useMonthRevenue() {
  const [data, setData]       = useState<Cache | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cache && Date.now() - cache.ts < TTL) { if (!cancelled) { setData(cache); setLoading(false); } return; }
      try {
        const r = await fetch('/api/paytour-faturamento', { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json() as { revenue: number; bruto?: number; descontos?: number };
        cache = { revenue: j.revenue, bruto: j.bruto ?? j.revenue, descontos: j.descontos ?? 0, ts: Date.now() };
        if (!cancelled) { setData(cache); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    const first = setTimeout(load, cache ? 0 : 8_000);
    const timer = setInterval(load, TTL);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return {
    revenue: data?.revenue ?? null,
    bruto: data?.bruto ?? null,
    descontos: data?.descontos ?? null,
    loading,
    ts: data?.ts ?? null,
  };
}
