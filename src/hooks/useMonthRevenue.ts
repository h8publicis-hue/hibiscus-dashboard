import { useState, useEffect } from 'react';

const TTL = 10 * 60 * 1000; // 10 min

interface MonthRevenueCache {
  revenue: number;
  ts: number;
  atualizadoEm: string | null; // quando foi salvo manualmente no KV
  fonte: string;
}

let cache: MonthRevenueCache | null = null;

export function useMonthRevenue() {
  const [revenue,      setRevenue]      = useState<number | null>(cache?.revenue ?? null);
  const [loading,      setLoading]      = useState(!cache);
  const [ts,           setTs]           = useState<number | null>(cache?.ts ?? null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(cache?.atualizadoEm ?? null);
  const [fonte,        setFonte]        = useState<string>(cache?.fonte ?? '');

  const load = async () => {
    try {
      const r = await fetch('/api/paytour-faturamento', { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { revenue: number; atualizado_em?: string; fonte?: string };
      cache = { revenue: j.revenue, ts: Date.now(), atualizadoEm: j.atualizado_em ?? null, fonte: j.fonte ?? '' };
      setRevenue(j.revenue);
      setTs(cache.ts);
      setAtualizadoEm(cache.atualizadoEm);
      setFonte(cache.fonte);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cache && Date.now() - cache.ts < TTL) {
      setRevenue(cache.revenue);
      setTs(cache.ts);
      setAtualizadoEm(cache.atualizadoEm);
      setFonte(cache.fonte);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(load, 8_000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = async (receita: number) => {
    const now = new Date();
    const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await fetch('/api/paytour-faturamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes, receita }),
    });
    cache = null; // invalida cache para forçar reload
    setLoading(true);
    await load();
  };

  return { revenue, loading, ts, atualizadoEm, fonte, update };
}
