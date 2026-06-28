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

async function fetchOnce(
  setData: (d: CheckinData) => void,
  setLoading: (b: boolean) => void,
  setExpired: (b: boolean) => void,
): Promise<boolean> {
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

export async function checkinManualLogin(login: string, senha: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, senha }),
    });
    const j = await r.json() as any;
    if (j.ok) cache = null; // força refetch
    return j;
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}

export function useCheckin() {
  const [data, setData]              = useState<CheckinData | null>(cache ?? null);
  const [loading, setLoading]        = useState(!cache);
  const [sessionExpired, setExpired] = useState(false);

  const refresh = () => {
    setLoading(true);
    setExpired(false);
    cache = null;
  };

  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAt < TTL) { setData(cache); setLoading(false); return; }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    const run = async () => {
      if (cancelled) return;
      const ok = await fetchOnce(
        (d) => { if (!cancelled) setData(d); },
        (b) => { if (!cancelled) setLoading(b); },
        (b) => { if (!cancelled) setExpired(b); },
      );
      if (!ok && !cancelled) {
        retryTimer = setTimeout(run, 60_000);
      }
    };

    run();
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, [loading]);

  return { data, loading, sessionExpired, refresh };
}
