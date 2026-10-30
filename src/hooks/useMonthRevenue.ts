import { useState, useEffect } from 'react';

const TTL    = 10 * 60 * 1000; // 10 min
let cache: { revenue: number; bruto: number; descontos: number; ts: number } | null = null;

export function useMonthRevenue() {
  const [revenue, setRevenue] = useState<number | null>(cache?.revenue ?? null);
  const [loading, setLoading] = useState(!cache);
  const [ts, setTs]           = useState<number | null>(cache?.ts ?? null);
  const [bruto, setBruto]     = useState<number | null>(cache?.bruto ?? null);
  const [descontos, setDescontos] = useState<number | null>(cache?.descontos ?? null);

  useEffect(() => {
    if (cache && Date.now() - cache.ts < TTL) { setRevenue(cache.revenue); setTs(cache.ts); setBruto(cache.bruto); setDescontos(cache.descontos); setLoading(false); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/paytour-faturamento', { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json() as { revenue: number; bruto?: number; descontos?: number };
        cache = { revenue: j.revenue, bruto: j.bruto ?? j.revenue, descontos: j.descontos ?? 0, ts: Date.now() };
        if (!cancelled) { setRevenue(j.revenue); setTs(cache.ts); setBruto(cache.bruto); setDescontos(cache.descontos); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }, 8_000);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  return { revenue, bruto, descontos, loading, ts };
}
