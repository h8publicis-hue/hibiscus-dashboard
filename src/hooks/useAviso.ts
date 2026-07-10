import { useState, useEffect } from 'react';

export interface Aviso { text: string; active: boolean }

const LS_KEY = 'hibiscus_aviso_v1';

export function useAviso(): {
  aviso: Aviso | null;
  saving: boolean;
  save: (aviso: Aviso) => Promise<void>;
} {
  const [aviso, setAviso]   = useState<Aviso | null>(() => {
    try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/goals?type=aviso')
      .then(r => r.json())
      .then((j: any) => {
        if (j?.aviso) {
          setAviso(j.aviso);
          try { localStorage.setItem(LS_KEY, JSON.stringify(j.aviso)); } catch { /* */ }
        }
      })
      .catch(() => { /* usa localStorage */ });
  }, []);

  const save = async (next: Aviso) => {
    setSaving(true);
    setAviso(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* */ }
    try {
      await fetch('/api/goals?type=aviso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch { /* */ } finally { setSaving(false); }
  };

  return { aviso, saving, save };
}
