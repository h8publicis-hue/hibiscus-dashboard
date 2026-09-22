import { useState, useEffect } from 'react';
import { PaytourData } from '../types';
import { fetchPaytourData } from '../services/paytour';
import { useMockMode } from './useMockMode';
import { mockPaytourData } from '../mocks/mockData';

interface UsePaytourResult {
  data: PaytourData | null;
  loading: boolean;
  error: string | null;
}

export function usePaytour(period: string): UsePaytourResult {
  const [data, setData]       = useState<PaytourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const isMock = useMockMode();

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (isMock) {
      const timer = setTimeout(() => {
        setData(mockPaytourData);
        setLoading(false);
      }, 300 + Math.random() * 500);
      return () => clearTimeout(timer);
    }

    let cancelled = false;

    const doFetch = () =>
      fetchPaytourData(period)
        .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
        .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false); } });

    doFetch();

    // Ao Vivo (today): re-busca a cada 5 min para capturar novos pedidos
    const interval = period === 'today'
      ? setInterval(() => { if (!cancelled) doFetch(); }, 5 * 60 * 1000)
      : null;

    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [period, isMock]);

  return { data, loading, error };
}
