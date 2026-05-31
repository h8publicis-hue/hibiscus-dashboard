import { useState } from 'react';
import { OccupancyState } from '../types';

const STORAGE_KEY = 'hibiscus_occupancy_v1';

const DEFAULT_STATE: OccupancyState = {
  beach: 0,
  lounges: Array(14).fill(0),
  prime: 0,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function save(state: OccupancyState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export interface OccupancyActions {
  setBeach: (n: number) => void;
  setLounge: (idx: number, n: number) => void;
  setPrime: (n: number) => void;
  reset: () => void;
}

export function useOccupancy(): [OccupancyState, OccupancyActions] {
  const [state, setState] = useState<OccupancyState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<OccupancyState>;
        return {
          beach:   clamp(parsed.beach ?? 0, 0, 500),
          lounges: Array(14).fill(0).map((_, i) => clamp(parsed.lounges?.[i] ?? 0, 0, 10)),
          prime:   clamp(parsed.prime ?? 0, 0, 10),
        };
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_STATE, lounges: Array(14).fill(0) };
  });

  const update = (next: OccupancyState) => {
    setState(next);
    save(next);
  };

  const actions: OccupancyActions = {
    setBeach: (n) => update({ ...state, beach: clamp(n, 0, 500) }),
    setLounge: (idx, n) => {
      const lounges = [...state.lounges];
      lounges[idx] = clamp(n, 0, 10);
      update({ ...state, lounges });
    },
    setPrime: (n) => update({ ...state, prime: clamp(n, 0, 10) }),
    reset: () => {
      if (window.confirm('Zerar todos os contadores de ocupação?')) {
        const zero = { beach: 0, lounges: Array(14).fill(0), prime: 0 };
        update(zero);
      }
    },
  };

  return [state, actions];
}
