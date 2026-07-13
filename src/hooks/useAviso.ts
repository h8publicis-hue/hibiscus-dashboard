import { useState, useEffect } from 'react';

export interface Aviso { text: string; active: boolean }
export type AvisoList = Aviso[]; // até 5 itens

const LS_KEY = 'hibiscus_avisos_v2';
const MAX    = 5;

export function useAviso(): {
  avisos: AvisoList;
  saving: boolean;
  save: (avisos: AvisoList) => Promise<void>;
} {
  const [avisos, setAvisos] = useState<AvisoList>(() => {
    try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchAvisos = () =>
      fetch('/api/goals?type=aviso')
        .then(r => r.json())
        .then((j: any) => {
          if (!Array.isArray(j?.avisos)) return;
          setAvisos(j.avisos);
          try { localStorage.setItem(LS_KEY, JSON.stringify(j.avisos)); } catch { /* */ }
        })
        .catch(() => { /* usa localStorage */ });

    fetchAvisos();
    const id = setInterval(fetchAvisos, 30_000);
    return () => clearInterval(id);
  }, []);

  const save = async (next: AvisoList) => {
    const clamped = next.slice(0, MAX);
    setSaving(true);
    setAvisos(clamped);
    try { localStorage.setItem(LS_KEY, JSON.stringify(clamped)); } catch { /* */ }
    try {
      await fetch('/api/goals?type=aviso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avisos: clamped }),
      });
    } catch { /* */ } finally { setSaving(false); }
  };

  return { avisos, saving, save };
}
