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

    fetchPaytourData(period)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false); } });

    return () => { cancelled = true; };
  }, [period, isMock]);

  return { data, loading, error };
}
