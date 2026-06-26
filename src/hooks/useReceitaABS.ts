import { useState, useEffect } from 'react';

interface ReceitaABSData {
  mes: string;
  receita_abs: number | null;
  atualizado_em: string | null;
}

let cache: (ReceitaABSData & { ts: number }) | null = null;
const TTL = 60 * 60 * 1000; // 1h

export function useReceitaABS() {
  const [data, setData]       = useState<ReceitaABSData | null>(cache ?? null);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache && Date.now() - cache.ts < TTL) { setData(cache); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/receita-abs');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json() as ReceitaABSData;
        cache = { ...j, ts: Date.now() };
        if (!cancelled) { setData(j); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
