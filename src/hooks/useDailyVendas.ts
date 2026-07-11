import { useState, useEffect, useCallback } from 'react';
import { DailyVendasEntry } from '../types';

const LS_KEY = 'hibiscus_vendas_v1';
const TTL    = 2 * 365 * 24 * 3600 * 1000; // 2 anos em ms (irrelevante no KV, mas guarda no LS)

function lsLoad(): Record<string, DailyVendasEntry> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function lsSave(data: Record<string, DailyVendasEntry>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* */ }
}

async function kvLoad(): Promise<Record<string, DailyVendasEntry>> {
  try {
    const r = await fetch('/api/goals?type=vendas&months=2');
    if (!r.ok) throw new Error();
    const j = await r.json() as { vendas?: Record<string, DailyVendasEntry> };
    return j.vendas ?? {};
  } catch { return {}; }
}

async function kvSaveEntry(entry: DailyVendasEntry) {
  await fetch('/api/goals?type=vendas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry }),
  });
}

export function useDailyVendas() {
  const [entries, setEntries] = useState<Record<string, DailyVendasEntry>>(lsLoad);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    kvLoad().then(remote => {
      if (Object.keys(remote).length > 0) {
        const merged = { ...lsLoad(), ...remote };
        setEntries(merged);
        lsSave(merged);
      }
      setLoading(false);
    });
  }, []);

  const saveEntry = useCallback(async (entry: DailyVendasEntry) => {
    const next = { ...entries, [entry.date]: entry };
    setEntries(next);
    lsSave(next);
    await kvSaveEntry(entry).catch(() => { /* silently fail */ });
  }, [entries]);

  // Lista ordenada do mais recente ao mais antigo (últimos 60 dias)
  const list = Object.values(entries)
    .filter(e => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);
      return new Date(e.date) >= cutoff;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return { entries, list, saveEntry, loading };
}

export { TTL };
