import { useState, useEffect, useCallback } from 'react';
import type { EscalaGarcom, ValidacaoDia, ValidacaoGarcom } from '../types';

function todayBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
}
function mesBRT() {
  return todayBRT().slice(0, 7);
}
function diaBRT() {
  return todayBRT().slice(8, 10);
}

export function useEscalaHoje() {
  const [escala,    setEscala]    = useState<EscalaGarcom[]>([]);
  const [validacao, setValidacao] = useState<ValidacaoDia>({ validado: false, garcons: [] });
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rE, rV] = await Promise.all([
        fetch(`/api/ocupacao?action=escala-get&mes=${mesBRT()}`),
        fetch(`/api/ocupacao?action=escala-valida&data=${todayBRT()}`),
      ]);
      const [dE, dV] = await Promise.all([rE.json(), rV.json()]);
      setEscala(Array.isArray(dE.escala) ? dE.escala : []);
      setValidacao(dV ?? { validado: false, garcons: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Garçons com T (trabalha) hoje
  const dia = diaBRT();
  const ativosHoje: EscalaGarcom[] = escala.filter(g => g.dias[dia] === 'T');

  // Após validação: usa dados validados; antes: usa escala como estimativa
  const garconsDia: ValidacaoGarcom[] = validacao.validado
    ? validacao.garcons
    : ativosHoje.map(g => ({ id: g.id, nome: g.nome, area: g.area }));

  const totalHoje  = garconsDia.length;
  const totalLounge = garconsDia.filter(g => g.area === 'lounge').length;
  const totalBeach  = garconsDia.filter(g => g.area === 'beach').length;

  async function salvarEscala(garcons: EscalaGarcom[]) {
    await fetch(`/api/ocupacao?action=escala-save&mes=${mesBRT()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garcons }),
    });
    setEscala(garcons);
  }

  async function validarDia(garcons: ValidacaoGarcom[]) {
    const r = await fetch(`/api/ocupacao?action=escala-valida&data=${todayBRT()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garcons }),
    });
    const d = await r.json();
    setValidacao(d);
  }

  return { escala, validacao, ativosHoje, garconsDia, totalHoje, totalLounge, totalBeach, loading, load, salvarEscala, validarDia };
}
