import { useState, useEffect } from 'react';
import { SurveyMonkeyData } from '../types';
import { mockSurveyMonkeyData } from '../mocks/mockData';
import { useMockMode } from './useMockMode';
import { fetchSatisfactionData } from '../services/googleSheets';

interface UseSurveyMonkeyResult {
  data: SurveyMonkeyData | null;
  loading: boolean;
  error: string | null;
}

export function useSurveyMonkey(period: string): UseSurveyMonkeyResult {
  const [data, setData]       = useState<SurveyMonkeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const isMock = useMockMode();

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (isMock) {
      const timer = setTimeout(() => {
        setData(mockSurveyMonkeyData);
        setLoading(false);
      }, 300 + Math.random() * 500);
      return () => clearTimeout(timer);
    }

    let cancelled = false;

    fetchSatisfactionData(period)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false); } });

    return () => { cancelled = true; };
  }, [period, isMock]);

  return { data, loading, error };
}
