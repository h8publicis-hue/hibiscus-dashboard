import { useState } from 'react';
import { Goals, DEFAULT_GOALS } from '../types';

const STORAGE_KEY = 'hibiscus_goals_v1';

export function useGoals(): [Goals, (next: Goals) => void] {
  const [goals, setGoals] = useState<Goals>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_GOALS, ...JSON.parse(raw) };
    } catch { /* ignore corrupt data */ }
    return DEFAULT_GOALS;
  });

  const updateGoals = (next: Goals) => {
    setGoals(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return [goals, updateGoals];
}
