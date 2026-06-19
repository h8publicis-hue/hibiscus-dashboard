import { useState, useEffect, useCallback } from 'react';
import { OccupancyState } from '../types';

const DEFAULT_STATE: OccupancyState = {
  beach: 0,
  lounges: Array(20).fill(0),
  prime: 0,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

async function fetchOcc(): Promise<OccupancyState> {
  try {
    const r = await fetch('/api/ocupacao');
    if (!r.ok) throw new Error();
    const d = await r.json() as Partial<OccupancyState>;
    return {
      beach:   clamp(d.beach ?? 0, 0, 500),
      lounges: Array(20).fill(0).map((_, i) => clamp(d.lounges?.[i] ?? 0, 0, 10)),
      prime:   clamp(d.prime ?? 0, 0, 10),
    };
  } catch {
    return { ...DEFAULT_STATE, lounges: Array(20).fill(0) };
  }
}

async function saveOcc(state: OccupancyState): Promise<void> {
  try {
    await fetch('/api/ocupacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
  } catch { /* ignore */ }
}

export interface OccupancyActions {
  setBeach: (n: number) => void;
  setLounge: (idx: number, n: number) => void;
  setPrime: (n: number) => void;
  reset: () => void;
}

export function useOccupancy(): [OccupancyState, OccupancyActions] {
  const [state, setState] = useState<OccupancyState>({ ...DEFAULT_STATE, lounges: Array(20).fill(0) });

  // Carrega do servidor na montagem e polling a cada 30s
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchOcc().then(d => { if (!cancelled) setState(d); });
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const update = useCallback((next: OccupancyState) => {
    setState(next);
    saveOcc(next);
  }, []);

  const actions: OccupancyActions = {
    setBeach:  (n) => update({ ...state, beach: clamp(n, 0, 500), lounges: state.lounges, prime: state.prime }),
    setLounge: (idx, n) => {
      const lounges = [...state.lounges];
      lounges[idx] = clamp(n, 0, 10);
      update({ ...state, lounges });
    },
    setPrime: (n) => update({ ...state, lounges: state.lounges, beach: state.beach, prime: clamp(n, 0, 10) }),
    reset: () => {
      if (window.confirm('Zerar todos os contadores de ocupação?')) {
        update({ beach: 0, lounges: Array(20).fill(0), prime: 0 });
      }
    },
  };

  return [state, actions];
}
