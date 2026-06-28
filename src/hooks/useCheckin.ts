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

async function fetchAndUpdate(
  setData: (d: CheckinData) => void,
  setLoading: (b: boolean) => void,
  setExpired: (b: boolean) => void,
) {
  try {
    const r = await fetch('/api/checkin');
    const j = await r.json() as any;
    if (!r.ok || j?.sessionExpired) {
      setExpired(true);
      setLoading(false);
      return false;
    }
    cache = { ...j, fetchedAt: Date.now() };
    setData(j);
    setLoading(false);
    setExpired(false);
    return true;
  } catch {
    setLoading(false);
    return false;
  }
}

export function useCheckin() {
  const [data, setData]               = useState<CheckinData | null>(cache ?? null);
  const [loading, setLoading]         = useState(!cache);
  const [sessionExpired, setExpired]  = useState(false);

  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAt < TTL) { setData(cache); setLoading(false); return; }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    const run = async () => {
      if (cancelled) return;
      const ok = await fetchAndUpdate(
        (d) => { if (!cancelled) setData(d); },
        (b) => { if (!cancelled) setLoading(b); },
        (b) => { if (!cancelled) setExpired(b); },
      );
      // Se expirou, tenta auto-login novamente em 60s
      if (!ok && !cancelled) {
        retryTimer = setTimeout(run, 60_000);
      }
    };

    run();
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, []);

  return { data, loading, sessionExpired };
}
