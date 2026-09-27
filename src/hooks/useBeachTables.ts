import { useState, useEffect, useRef, useCallback } from 'react';

export type MesaArea = 'Salão' | 'Deck' | 'Pé na Areia' | 'Piscina' | 'Tenda';

export const AREAS: MesaArea[] = ['Salão', 'Deck', 'Pé na Areia', 'Piscina', 'Tenda'];

export const AREA_COLORS: Record<MesaArea, { bg: string; text: string; dot: string }> = {
  'Salão':      { bg: 'bg-blue-500',   text: 'text-blue-400',   dot: '#3b82f6' },
  'Deck':       { bg: 'bg-orange-500', text: 'text-orange-400', dot: '#f97316' },
  'Pé na Areia':{ bg: 'bg-yellow-500', text: 'text-yellow-400', dot: '#eab308' },
  'Piscina':    { bg: 'bg-cyan-500',   text: 'text-cyan-400',   dot: '#06b6d4' },
  'Tenda':      { bg: 'bg-purple-500', text: 'text-purple-400', dot: '#a855f7' },
};

export interface MesaConfig {
  numero: string;
  x: number;
  y: number;
  area?: MesaArea;
}

export interface MesaEstado {
  status: 'livre' | 'ocupada';
  quantidadeClientes: number;
  horaOcupacao: string | null;
  garcomId: string | null;
}

interface BeachTablesState {
  tables: MesaConfig[];
  estado: Record<string, MesaEstado>;
  markerSize: number;
  loading: boolean;
  error: string | null;
}

const POLL_MS = 30_000;

export function useBeachTables() {
  const [state, setState] = useState<BeachTablesState>({
    tables: [], estado: {}, markerSize: 24, loading: true, error: null,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const r = await fetch('/api/mesas');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setState(s => ({ ...s, tables: data.tables ?? [], estado: data.estado ?? {}, markerSize: data.markerSize ?? 24, loading: false, error: null }));
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetch_]);

  const ocuparMesa = useCallback(async (numero: string, clientes: number) => {
    const horaOcupacao = new Date().toISOString();
    // Atualização otimista
    setState(s => ({
      ...s,
      estado: {
        ...s.estado,
        [numero]: { status: 'ocupada', quantidadeClientes: clientes, horaOcupacao, garcomId: null },
      },
    }));
    await fetch('/api/mesas?action=update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero, update: { status: 'ocupada', quantidadeClientes: clientes, horaOcupacao } }),
    });
  }, []);

  const liberarMesa = useCallback(async (numero: string) => {
    setState(s => ({
      ...s,
      estado: {
        ...s.estado,
        [numero]: { status: 'livre', quantidadeClientes: 0, horaOcupacao: null, garcomId: null },
      },
    }));
    await fetch('/api/mesas?action=update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero, update: { status: 'livre', quantidadeClientes: 0, horaOcupacao: null } }),
    });
  }, []);

  const atualizarClientes = useCallback(async (numero: string, delta: number) => {
    setState(s => {
      const atual = s.estado[numero] ?? { status: 'livre', quantidadeClientes: 0, horaOcupacao: null, garcomId: null };
      const next = Math.max(0, atual.quantidadeClientes + delta);
      return { ...s, estado: { ...s.estado, [numero]: { ...atual, quantidadeClientes: next } } };
    });
    const atual = state.estado[numero]?.quantidadeClientes ?? 0;
    const next = Math.max(0, atual + delta);
    await fetch('/api/mesas?action=update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero, update: { quantidadeClientes: next } }),
    });
  }, [state.estado]);

  const salvarPosicoes = useCallback(async (tables: MesaConfig[]) => {
    setState(s => ({ ...s, tables }));
    await fetch('/api/mesas?action=config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tables }),
    });
  }, []);

  const zerarTudo = useCallback(async () => {
    const estadoVazio: Record<string, MesaEstado> = {};
    state.tables.forEach(t => {
      estadoVazio[t.numero] = { status: 'livre', quantidadeClientes: 0, horaOcupacao: null, garcomId: null };
    });
    setState(s => ({ ...s, estado: estadoVazio }));
    await fetch('/api/mesas?action=reset', { method: 'POST' });
  }, [state.tables]);

  const salvarMarkerSize = useCallback(async (size: number) => {
    setState(s => ({ ...s, markerSize: size }));
    await fetch('/api/mesas?action=config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markerSize: size }),
    });
  }, []);

  return {
    ...state,
    refresh: fetch_,
    ocuparMesa,
    liberarMesa,
    atualizarClientes,
    salvarPosicoes,
    salvarMarkerSize,
    zerarTudo,
  };
}
