import { useState, useEffect } from 'react';

export interface CheckinData {
  reservados: number;
  sessionActive: boolean;
  disponiveis?: number;
  checkins?: number;
  pendentes?: number;
  total?: number;
  ts: number;
  stale?: boolean;
}

let cache: (CheckinData & { fetchedAt: number }) | null = null;
const TTL = 5 * 60 * 1000;

async function fetchOnce(
  setData: (d: CheckinData) => void,
  setLoading: (b: boolean) => void,
): Promise<boolean> {
  try {
    const r = await fetch('/api/checkin');
    const j = await r.json() as any;
    if (!r.ok) {
      setLoading(false);
      return false;
    }
    cache = { ...j, fetchedAt: Date.now() };
    setData(j);
    setLoading(false);
    return true;
  } catch {
    setLoading(false);
    return false;
  }
}

export async function checkinManualLogin(
  login: string,
  senha: string,
): Promise<{ ok: boolean; error?: string; data?: CheckinData }> {
  try {
    const r = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, senha }),
    });
    const j = await r.json() as any;
    if (j.ok && j.data) {
      // Usa os dados frescos que o POST já trouxe — sem segundo round-trip
      cache = { ...j.data, fetchedAt: Date.now() };
    } else if (j.ok) {
      cache = null;
    }
    return j;
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}

export async function checkinClearSession(): Promise<void> {
  await fetch('/api/checkin', { method: 'DELETE' });
  cache = null;
}

export function useCheckin() {
  const [data, setData]      = useState<CheckinData | null>(cache ?? null);
  const [loading, setLoading] = useState(!cache);

  const refresh = () => {
    setLoading(true);
    cache = null;
  };

  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAt < TTL) { setData(cache); setLoading(false); return; }
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await fetchOnce(
        (d) => { if (!cancelled) setData(d); },
        (b) => { if (!cancelled) setLoading(b); },
      );
    };

    run();
    return () => { cancelled = true; };
  }, [loading]);

  return { data, loading, refresh, setData };
}
