import { useState, useEffect } from 'react';
import { GoogleBusinessData } from '../types';
import { mockGoogleBusinessData } from '../mocks/mockData';
import { useMockMode } from './useMockMode';
import { fetchGoogleReviews } from '../services/googleReviews';

interface UseGoogleBusinessResult {
  data:          GoogleBusinessData | null;
  loading:       boolean;
  error:         string | null;
  notConfigured: boolean; // true = env vars missing, show "Configuração pendente"
}

export function useGoogleBusiness(period: string): UseGoogleBusinessResult {
  const [data,          setData]          = useState<GoogleBusinessData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const isMock = useMockMode();

  useEffect(() => {
    void period; // period is kept as dependency for future filtering support
    setLoading(true);
    setError(null);
    setNotConfigured(false);

    if (isMock) {
      const timer = setTimeout(() => {
        setData(mockGoogleBusinessData);
        setLoading(false);
      }, 300 + Math.random() * 500);
      return () => clearTimeout(timer);
    }

    let cancelled = false;

    fetchGoogleReviews()
      .then((d) => {
        if (cancelled) return;
        if (d === null) {
          // Env vars not set — not an error, just show setup message
          setNotConfigured(true);
          setData(null);
        } else {
          setData(d);
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [period, isMock]);

  return { data, loading, error, notConfigured };
}
