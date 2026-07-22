import { useState, useCallback } from 'react';

const LS_KEY = 'hibiscus-sectors-v1';

const DEFAULT_SECTORS = [
  'ESTRUTURA', 'ACESSIBILIDADE', 'MANUTENÇÃO', 'A&B', 'ATENDIMENTO',
  'PREÇO', 'RECEPÇÃO', 'RECREAÇÃO', 'BRINDES', 'SERVIÇOS GERAIS',
  'ATRAÇÕES', 'SOM', 'PISCINA', 'SINALIZAÇÃO', 'PRAIA', 'PASSEIO',
  'FILA', 'ANIMAIS',
];

function load(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return DEFAULT_SECTORS;
}

export function useSectors(): [string[], (sectors: string[]) => void] {
  const [sectors, setSectorsState] = useState<string[]>(load);

  const setSectors = useCallback((next: string[]) => {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setSectorsState(next);
  }, []);

  return [sectors, setSectors];
}
