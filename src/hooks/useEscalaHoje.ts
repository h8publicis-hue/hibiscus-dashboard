import { useState, useEffect, useCallback } from 'react';
import type { EscalaGarcom, ValidacaoDia, ValidacaoGarcom } from '../types';

export function todayBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
}
function mesBRT() {
  return todayBRT().slice(0, 7);
}
function diaDe(data: string) {
  return data.slice(8, 10);
}

export function useEscalaHoje(data?: string) {
  const dataAlvo = data ?? todayBRT();
  const mes      = dataAlvo.slice(0, 7);

  const [escala,    setEscala]    = useState<EscalaGarcom[]>([]);
  const [validacao, setValidacao] = useState<ValidacaoDia>({ validado: false, garcons: [] });
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rE, rV] = await Promise.all([
        fetch(`/api/ocupacao?action=escala-get&mes=${mes}`),
        fetch(`/api/ocupacao?action=escala-valida&data=${dataAlvo}`),
      ]);
      const [dE, dV] = await Promise.all([rE.json(), rV.json()]);
      setEscala(Array.isArray(dE.escala) ? dE.escala : []);
      setValidacao(dV ?? { validado: false, garcons: [] });
    } finally {
      setLoading(false);
    }
  }, [dataAlvo, mes]);

  useEffect(() => { load(); }, [load]);

  const dia = diaDe(dataAlvo);
  const ativosHoje: EscalaGarcom[] = escala.filter(g => (g.dias[dia] ?? 'T') === 'T');

  const garconsDia: ValidacaoGarcom[] = validacao.validado
    ? validacao.garcons.filter(g => !g.faltou)
    : ativosHoje.map(g => ({ id: g.id, nome: g.nome, area: g.area, setor: g.setor_padrao }));

  const totalHoje   = garconsDia.length;
  const totalLounge = garconsDia.filter(g => g.area === 'lounge').length;
  const totalBeach  = garconsDia.filter(g => g.area === 'beach').length;

  async function salvarEscala(garcons: EscalaGarcom[]) {
    await fetch(`/api/ocupacao?action=escala-save&mes=${mes}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garcons }),
    });
    setEscala(garcons);
  }

  async function validarDia(garcons: ValidacaoGarcom[]) {
    const r = await fetch(`/api/ocupacao?action=escala-valida&data=${dataAlvo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garcons }),
    });
    const d = await r.json();
    setValidacao(d);
  }

  return { escala, validacao, ativosHoje, garconsDia, totalHoje, totalLounge, totalBeach, loading, load, salvarEscala, validarDia };
}
