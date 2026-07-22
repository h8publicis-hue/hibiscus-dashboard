import { useState, useEffect, useRef } from 'react';
import { Key, Link2, LogOut, Check, X, Copy, ExternalLink, QrCode, Tags, Plus, RotateCcw } from 'lucide-react';
import QRCode from 'qrcode';
import { useSectors } from '../hooks/useSectors';

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
  { label: 'App / Entrada',    path: '/entrada',   desc: 'Controle de ocupação dos lounges' },
  { label: 'App / Portaria',   path: '/portaria',  desc: 'Registro de entrada de pessoas' },
  { label: 'App / RH',         path: '/rh',        desc: 'Contador de colaboradores' },
  { label: 'App / Cozinha',    path: '/cozinha',   desc: 'Painel da cozinha' },
  { label: 'App / Refeitório', path: '/refeicao',  desc: 'Scanner de QR code' },
  { label: 'Quiosque TV',      path: '/?kiosk',    desc: 'Visão geral em modo tela cheia' },
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

function QrModal({ path, label, onClose }: { path: string; label: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState('');
  const url = window.location.origin + path;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 240, margin: 2 }).then(setDataUrl).catch(() => {});
  }, [url]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl flex flex-col items-center gap-4 max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">{label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={16} /></button>
        </div>
        {dataUrl
          ? <img src={dataUrl} alt="QR Code" className="rounded-lg w-[240px] h-[240px]" />
          : <div className="w-[240px] h-[240px] bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
        }
        <p className="text-xs text-gray-400 text-center break-all">{url}</p>
      </div>
    </div>
  );
}

function LinksAcesso() {
  const [copiado, setCopiado] = useState('');
  const [qrPath,  setQrPath]  = useState<string | null>(null);
  const base = window.location.origin;

  const copiar = (path: string) => {
    navigator.clipboard.writeText(base + path);
    setCopiado(path);
    setTimeout(() => setCopiado(''), 2000);
  };

  return (
    <>
      {qrPath && (
        <QrModal
          path={qrPath}
          label={LINKS_OPERACIONAIS.find(l => l.path === qrPath)?.label ?? ''}
          onClose={() => setQrPath(null)}
        />
      )}
      <div className="flex flex-col gap-2">
        {LINKS_OPERACIONAIS.map(({ label, path, desc }) => (
          <div key={path} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setQrPath(path)} title="Ver QR Code"
                className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-brand-600 transition-colors">
                <QrCode size={14} />
              </button>
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
    </>
  );
}

const DEFAULT_SECTORS = [
  'ESTRUTURA', 'ACESSIBILIDADE', 'MANUTENÇÃO', 'A&B', 'ATENDIMENTO',
  'PREÇO', 'RECEPÇÃO', 'RECREAÇÃO', 'BRINDES', 'SERVIÇOS GERAIS',
  'ATRAÇÕES', 'SOM', 'PISCINA', 'SINALIZAÇÃO', 'PRAIA', 'PASSEIO',
  'FILA', 'ANIMAIS',
];

function SetoresEditor() {
  const [sectors, setSectors] = useSectors();
  const [input, setInput]     = useState('');
  const inputRef              = useRef<HTMLInputElement>(null);

  const add = () => {
    const val = input.trim().toUpperCase();
    if (!val || sectors.includes(val)) { setInput(''); return; }
    setSectors([...sectors, val]);
    setInput('');
    inputRef.current?.focus();
  };

  const remove = (s: string) => setSectors(sectors.filter(x => x !== s));

  const reset = () => {
    if (window.confirm('Restaurar a lista padrão de setores? Os setores personalizados serão removidos.'))
      setSectors(DEFAULT_SECTORS);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Setores usados para classificar avaliações do Survey. Clique no <span className="font-semibold">×</span> para remover.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {sectors.map(s => (
          <span key={s} className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-700">
            {s}
            <button onClick={() => remove(s)} className="ml-0.5 text-brand-400 hover:text-red-500 transition-colors leading-none">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Novo setor (ex: ESTACIONAMENTO)"
          className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button onClick={add} disabled={!input.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors disabled:opacity-40">
          <Plus size={14} /> Adicionar
        </button>
      </div>

      <button onClick={reset} className="flex items-center gap-1.5 w-fit text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
        <RotateCcw size={11} /> Restaurar padrão
      </button>
    </div>
  );
}

export function Configuracoes() {
  const handleLogout = () => {
    localStorage.removeItem('hibiscus-admin-auth-v2');
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

      <SectionCard title="Setores de Avaliação" icon={<Tags size={16} />}>
        <SetoresEditor />
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
