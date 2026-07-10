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
    fetch('/api/goals?type=aviso')
      .then(r => r.json())
      .then((j: any) => {
        const data: AvisoList = Array.isArray(j?.avisos) ? j.avisos : [];
        if (data.length) {
          setAvisos(data);
          try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* */ }
        }
      })
      .catch(() => { /* usa localStorage */ });
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
