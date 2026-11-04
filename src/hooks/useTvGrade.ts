import { useEffect, useState } from 'react';

export interface TelaTv { id: string; nome: string; desc: string; src: string; }
export interface ItemGrade { id: string; ativo: boolean; segundos: number; }

// Telas disponíveis para a grade do Modo TV
export const TELAS_TV: TelaTv[] = [
  { id: 'overview', nome: 'Visão Geral',     desc: 'Painel completo (quiosque)',      src: '/?kiosk' },
  { id: 'mapa',     nome: 'Mapa Beach · KDS', desc: 'Mapa de mesas em tela cheia',     src: '/mapa-kds' },
  { id: 'cozinha',  nome: 'Painel Cozinha',   desc: 'Ocupação para a cozinha',         src: '/cozinha' },
  { id: 'ocupacao', nome: 'Mapa de Ocupação', desc: 'Mesas e lounges (somente leitura)', src: '/mapa-ocupacao?t=@Hibiscus' },
];

export const GRADE_PADRAO: ItemGrade[] = TELAS_TV.map(t => ({ id: t.id, ativo: t.id === 'overview', segundos: 60 }));

// Completa/ordena a grade salva com as telas conhecidas (telas novas entram desativadas no fim)
export function normalizarGrade(salva: ItemGrade[] | null | undefined): ItemGrade[] {
  if (!salva || salva.length === 0) return GRADE_PADRAO;
  const conhecidas = salva.filter(g => TELAS_TV.some(t => t.id === g.id));
  const faltantes = TELAS_TV.filter(t => !conhecidas.some(g => g.id === t.id)).map(t => ({ id: t.id, ativo: false, segundos: 30 }));
  return [...conhecidas, ...faltantes];
}

export async function fetchGradeTv(): Promise<ItemGrade[]> {
  try {
    const r = await fetch('/api/goals?type=tvgrade', { cache: 'no-store' });
    const { grade } = await r.json();
    return normalizarGrade(grade);
  } catch { return GRADE_PADRAO; }
}

export async function saveGradeTv(grade: ItemGrade[]): Promise<boolean> {
  try {
    const r = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'tvgrade', grade }),
    });
    return r.ok;
  } catch { return false; }
}

export function useGradeTv() {
  const [grade, setGrade] = useState<ItemGrade[] | null>(null);
  useEffect(() => { fetchGradeTv().then(setGrade); }, []);
  return [grade, setGrade] as const;
}
