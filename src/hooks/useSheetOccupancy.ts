import { useState, useEffect } from 'react';
import { SheetOccupancyData } from '../types';

const POLL_MS = 2 * 60 * 1000;  // atualiza a cada 2 minutos

export function useSheetOccupancy() {
  const [data,    setData]    = useState<SheetOccupancyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/ocupacao-sheets', { signal: AbortSignal.timeout(12_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as SheetOccupancyData;
        if (!cancelled) { setData(json); setError(null); }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { data, loading, error };
}
