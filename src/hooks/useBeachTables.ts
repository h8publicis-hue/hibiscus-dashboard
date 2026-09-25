import { useState, useEffect, useRef, useCallback } from 'react';

export interface MesaConfig {
  numero: string;
  x: number;
  y: number;
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
  loading: boolean;
  error: string | null;
}

const POLL_MS = 30_000;

export function useBeachTables() {
  const [state, setState] = useState<BeachTablesState>({
    tables: [], estado: {}, loading: true, error: null,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const r = await fetch('/api/mesas');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setState(s => ({ ...s, tables: data.tables ?? [], estado: data.estado ?? {}, loading: false, error: null }));
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

  return {
    ...state,
    refresh: fetch_,
    ocuparMesa,
    liberarMesa,
    atualizarClientes,
    salvarPosicoes,
  };
}
