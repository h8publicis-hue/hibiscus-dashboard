import { useState, useEffect, useCallback } from 'react';

export interface Chamada {
  id: string;
  mesa: number | null;
  pulseira: string;
  status: string;
  garcom: string;
  tipo: string;
  setor: string;
  mensagem: string;
  data_hora: string;
  aceitoEm: string;
  finalizadoEm: string;
  tempoEspera: string;
  tempoAtendimento: string;
}

export function parseTempoSec(tempo: string): number {
  const m = tempo.match(/(\d+)m\s*(\d+)s/);
  if (!m) return 0;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function todayBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function useChamadas(start?: string, end?: string) {
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const fetchData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/chamadas?start=${s}&end=${e}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setChamadas(j.chamadas ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const s = start || todayBRT();
    const e = end   || s;
    fetchData(s, e);
    const id = setInterval(() => fetchData(s, e), 60_000);
    return () => clearInterval(id);
  }, [start, end, fetchData]);

  const refresh = useCallback(() => {
    const s = start || todayBRT();
    fetchData(s, end || s);
  }, [start, end, fetchData]);

  return { chamadas, loading, error, refresh };
}
