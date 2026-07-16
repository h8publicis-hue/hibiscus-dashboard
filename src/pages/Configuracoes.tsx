import { useState } from 'react';
import { Key, Link2, LogOut, Check, X, Copy, ExternalLink } from 'lucide-react';

const DEFAULT_PASSWORD = 'Admin@!$';

async function fetchSenhaAtual(): Promise<string> {
  try {
    const r = await fetch('/api/goals?type=config');
    const { config } = await r.json();
    return config?.adminPassword ?? DEFAULT_PASSWORD;
  } catch { return DEFAULT_PASSWORD; }
}

async function salvarSenha(nova: string): Promise<void> {
  await fetch('/api/goals?type=config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword: nova }),
  });
}

const LINKS_OPERACIONAIS = [
  { label: 'App / Entrada',  path: '/entrada',  desc: 'Controle de ocupação dos lounges' },
  { label: 'App / Portaria', path: '/portaria', desc: 'Registro de entrada de pessoas' },
  { label: 'App / Cozinha',  path: '/cozinha',  desc: 'Painel da cozinha' },
  { label: 'App / Refeitório', path: '/refeicao', desc: 'Scanner de QR code' },
  { label: 'App / RH',       path: '/rh',       desc: 'Painel de RH' },
];

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2.5">
        <span className="text-brand-600 dark:text-brand-400">{icon}</span>
        <h2 className="font-bold text-gray-900 dark:text-white text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function TrocaSenha() {
  const [atual,    setAtual]    = useState('');
  const [nova,     setNova]     = useState('');
  const [confirma, setConfirma] = useState('');
  const [msg,      setMsg]      = useState<{ ok: boolean; text: string } | null>(null);
  const [loading,  setLoading]  = useState(false);

  const input = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500';

  const handleSalvar = async () => {
    if (!atual || !nova || !confirma) return;
    if (nova !== confirma) { setMsg({ ok: false, text: 'Nova senha e confirmação não conferem.' }); return; }
    if (nova.length < 6)   { setMsg({ ok: false, text: 'A nova senha deve ter ao menos 6 caracteres.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const senhaArmazenada = await fetchSenhaAtual();
      if (atual !== senhaArmazenada) { setMsg({ ok: false, text: 'Senha atual incorreta.' }); return; }
      await salvarSenha(nova);
      setMsg({ ok: true, text: 'Senha alterada com sucesso!' });
      setAtual(''); setNova(''); setConfirma('');
    } catch { setMsg({ ok: false, text: 'Erro ao salvar. Tente novamente.' }); }
    finally  { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-3 max-w-sm">
      {[
        { label: 'Senha atual',          val: atual,    set: setAtual },
        { label: 'Nova senha',           val: nova,     set: setNova },
        { label: 'Confirmar nova senha', val: confirma, set: setConfirma },
      ].map(({ label, val, set }) => (
        <div key={label}>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{label}</label>
          <input type="password" value={val} onChange={e => set(e.target.value)}
            placeholder="••••••••" className={input} />
        </div>
      ))}

      {msg && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
          {msg.ok ? <Check size={14} /> : <X size={14} />} {msg.text}
        </div>
      )}

      <button onClick={handleSalvar} disabled={loading || !atual || !nova || !confirma}
        className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors disabled:opacity-40">
        {loading ? 'Salvando…' : 'Alterar senha'}
      </button>
    </div>
  );
}

function LinksAcesso() {
  const [copiado, setCopiado] = useState('');
  const base = window.location.origin;

  const copiar = (path: string) => {
    navigator.clipboard.writeText(base + path);
    setCopiado(path);
    setTimeout(() => setCopiado(''), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      {LINKS_OPERACIONAIS.map(({ label, path, desc }) => (
        <div key={path} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
            <p className="text-xs text-gray-400">{desc}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => copiar(path)} title="Copiar link"
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-brand-600 transition-colors">
              {copiado === path ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
            <a href={path} target="_blank" rel="noreferrer" title="Abrir em nova aba"
              className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-brand-600 transition-colors">
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Configuracoes() {
  const handleLogout = () => {
    localStorage.removeItem('hibiscus-admin-auth');
    window.location.href = '/';
  };

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-black text-gray-900 dark:text-white">Configurações</h1>
        <p className="text-xs text-gray-400 mt-0.5">Gerencie senha e acessos do Dashboard</p>
      </div>

      <SectionCard title="Alterar Senha" icon={<Key size={16} />}>
        <TrocaSenha />
      </SectionCard>

      <SectionCard title="Links de Acesso Operacional" icon={<Link2 size={16} />}>
        <LinksAcesso />
      </SectionCard>

      <SectionCard title="Sessão" icon={<LogOut size={16} />}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">Encerra sua sessão neste dispositivo. Você precisará digitar a senha novamente.</p>
          <button onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 w-fit rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <LogOut size={14} /> Sair do Dashboard
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
