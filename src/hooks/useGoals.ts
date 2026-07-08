import { useState, useEffect } from 'react';
import { Goals, DEFAULT_GOALS } from '../types';

const LS_KEY = 'hibiscus_goals_v1';

export function useGoals(): [Goals, (next: Goals) => void] {
  const [goals, setGoals] = useState<Goals>(() => {
    // Lê localStorage como fallback enquanto o fetch não volta
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return { ...DEFAULT_GOALS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return DEFAULT_GOALS;
  });

  // Carrega do KV na montagem — sobrescreve o localStorage se houver valor compartilhado
  useEffect(() => {
    fetch('/api/goals')
      .then(r => r.json())
      .then((j: any) => {
        if (j?.goals) {
          const merged = { ...DEFAULT_GOALS, ...j.goals };
          setGoals(merged);
          try { localStorage.setItem(LS_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* sem internet — usa localStorage */ });
  }, []);

  const updateGoals = async (next: Goals) => {
    setGoals(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    // Salva no KV para todos os PCs
    fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => { /* ignore network error */ });
  };

  return [goals, updateGoals];
}
