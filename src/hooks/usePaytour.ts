import { useState, useEffect, useRef, useCallback } from 'react';
import { PaytourData } from '../types';
import { mockPaytourData } from '../mocks/mockData';
import { useMockMode } from './useMockMode';
import { usePaytourMockMode } from './usePaytourMockMode';
import { fetchPaytourData, PaytourProgress } from '../services/paytour';

interface UsePaytourResult {
  data:     PaytourData | null;
  loading:  boolean;
  stale:    boolean;
  error:    string | null;
  progress: PaytourProgress | null;
}

export function usePaytour(period: string): UsePaytourResult {
  const [data,     setData]     = useState<PaytourData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [stale,    setStale]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [progress, setProgress] = useState<PaytourProgress | null>(null);
  const isMock = useMockMode();
  const [paytourMock] = usePaytourMockMode();

  const lastGoodData = useRef<PaytourData | null>(null);
  const onProgress   = useCallback((p: PaytourProgress | null) => setProgress(p), []);

  useEffect(() => {
    setError(null);

    if (isMock || paytourMock) {
      setLoading(true);
      setStale(false);
      const timer = setTimeout(() => {
        lastGoodData.current = mockPaytourData;
        setData(mockPaytourData);
        setLoading(false);
        setStale(false);
      }, 300 + Math.random() * 500);
      return () => clearTimeout(timer);
    }

    // WHY debounce: rapid period changes (clicking Hoje → 7d → Mês quickly)
    // previously fired separate full fetches for each click. 300 ms debounce
    // waits for the user to settle before dispatching a request.
    const debounce = setTimeout(() => {
      const hasPrev = lastGoodData.current !== null;

      if (hasPrev) {
        // Show old data with a "reloading" overlay — no blank flash
        setStale(true);
        setLoading(false);
      } else {
        // First load — show skeletons
        setLoading(true);
        setStale(false);
      }

      let cancelled = false;

      fetchPaytourData(period, (p) => { if (!cancelled) onProgress(p); })
        .then((d) => {
          if (cancelled) return;
          lastGoodData.current = d;
          setData(d);
          setLoading(false);
          setStale(false);
          setProgress(null);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setError(err.message);
          setLoading(false);
          setStale(false);
          setProgress(null);
        });

      return () => { cancelled = true; };
    }, 300);

    return () => clearTimeout(debounce);
  }, [period, isMock, paytourMock]);

  const displayData = data ?? lastGoodData.current;

  return { data: displayData, loading, stale, error, progress };
}
