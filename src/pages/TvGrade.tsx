import { useEffect, useMemo, useState } from 'react';
import { fetchGradeTv, ItemGrade, TELAS_TV } from '../hooks/useTvGrade';

// Player do Modo TV: alterna as telas ativas da grade, cada uma pelo tempo configurado
export function TvGrade() {
  const [grade, setGrade] = useState<ItemGrade[] | null>(null);
  const [pos, setPos] = useState(0);

  // Carrega e atualiza a configuração a cada 5 min (mudanças entram sem mexer na TV)
  useEffect(() => {
    let off = false;
    const load = () => fetchGradeTv().then(g => { if (!off) setGrade(g); });
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { off = true; clearInterval(id); };
  }, []);

  const telas = useMemo(
    () => (grade ?? []).filter(g => g.ativo).map(g => ({ ...g, tela: TELAS_TV.find(t => t.id === g.id)! })).filter(g => g.tela),
    [grade],
  );
  const chave = telas.map(t => `${t.id}:${t.segundos}`).join('|');
  const atual = telas.length ? telas[pos % telas.length] : null;

  useEffect(() => {
    if (!atual || telas.length < 2) return;
    const id = setTimeout(() => setPos(p => (p + 1) % telas.length), atual.segundos * 1000);
    return () => clearTimeout(id);
  }, [pos, chave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recarrega a página a cada 30 min (evita aba travada e pega versões novas)
  useEffect(() => {
    const id = setTimeout(() => window.location.reload(), 30 * 60_000);
    return () => clearTimeout(id);
  }, []);

  if (!grade) return <div className="min-h-screen bg-gray-900" />;
  if (!atual) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-sm">
        Nenhuma tela ativa na grade. Ative telas em Configurações → Modo TV.
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-gray-900">
      <iframe key={atual.id + pos} src={atual.tela.src} title={atual.tela.nome} className="w-full h-full border-0" />
    </div>
  );
}
