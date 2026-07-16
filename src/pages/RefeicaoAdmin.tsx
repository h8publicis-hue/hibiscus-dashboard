import { useState, useEffect, useRef } from 'react';
import { Plus, RefreshCw, QrCode, Download, Pencil, Check, X, Upload, Trash2, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { Pessoa } from '../types';

function todayBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
}

async function fetchPessoas(): Promise<Pessoa[]> {
  try {
    const r = await fetch('/api/refeicoes?action=pessoas');
    const j = await r.json();
    return j.pessoas ?? [];
  } catch { return []; }
}

async function fetchContagem(data: string) {
  try {
    const r = await fetch(`/api/refeicoes?data=${data}`);
    return await r.json();
  } catch { return { total: 0, porTipo: {} }; }
}

function QrModal({ pessoa, onClose }: { pessoa: Pessoa; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, pessoa.qrCode, { width: 240, margin: 2 }, () => {
      setDataUrl(canvasRef.current!.toDataURL('image/png'));
    });
  }, [pessoa.qrCode]);

  const baixar = () => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${pessoa.nome.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full">
          <div>
            <p className="font-bold text-gray-900 dark:text-white text-sm">{pessoa.nome}</p>
            <p className="text-xs text-gray-400">{pessoa.empresa} · {pessoa.setor}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <canvas ref={canvasRef} className="rounded-xl border border-gray-200 dark:border-gray-600" />
        <p className="text-[10px] text-gray-400 font-mono break-all text-center">{pessoa.qrCode}</p>
        <button
          onClick={baixar}
          disabled={!dataUrl}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
        >
          <Download size={14} /> Baixar PNG
        </button>
      </div>
    </div>
  );
}

function PessoaForm({ initial, onSave, onCancel }: {
  initial?: Partial<Pessoa>;
  onSave: (data: Partial<Pessoa>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    nome:           initial?.nome           ?? '',
    categoria:      initial?.categoria      ?? 'colaborador',
    empresa:        initial?.empresa        ?? '',
    setor:          initial?.setor          ?? '',
    cargo:          initial?.cargo          ?? '',
    dataNascimento: initial?.dataNascimento ?? '',
    dataAdmissao:   initial?.dataAdmissao   ?? '',
    ativo:          initial?.ativo          ?? true,
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Nome *</label>
          <input value={form.nome} onChange={e => set('nome', e.target.value)}
            className="w-full mt-0.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Nome completo" />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Categoria</label>
          <select value={form.categoria} onChange={e => set('categoria', e.target.value)}
            className="w-full mt-0.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="colaborador">Colaborador</option>
            <option value="parceiro">Parceiro</option>
            <option value="visitante">Visitante</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Cargo</label>
          <input value={form.cargo} onChange={e => set('cargo', e.target.value)}
            className="w-full mt-0.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Ex: Garçom" />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Empresa</label>
          <input value={form.empresa} onChange={e => set('empresa', e.target.value)}
            className="w-full mt-0.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Empresa" />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Setor</label>
          <input value={form.setor} onChange={e => set('setor', e.target.value)}
            className="w-full mt-0.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Setor" />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Data de Nascimento</label>
          <input value={form.dataNascimento} onChange={e => set('dataNascimento', e.target.value)}
            className="w-full mt-0.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="DD/MM/AAAA" />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Data de Admissão</label>
          <input value={form.dataAdmissao} onChange={e => set('dataAdmissao', e.target.value)}
            className="w-full mt-0.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="DD/MM/AAAA" />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input type="checkbox" id="ativo" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} className="rounded" />
          <label htmlFor="ativo" className="text-sm text-gray-600 dark:text-gray-300">Ativo</label>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
          <X size={13} /> Cancelar
        </button>
        <button
          onClick={() => { if (form.nome.trim()) onSave(form); }}
          disabled={!form.nome.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
        >
          <Check size={13} /> Salvar
        </button>
      </div>
    </div>
  );
}

export function RefeicaoAdmin() {
  const [pessoas,    setPessoas]    = useState<Pessoa[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [qrPessoa,   setQrPessoa]   = useState<Pessoa | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [editando,   setEditando]   = useState<Pessoa | null>(null);
  const [contagem,   setContagem]   = useState<any>(null);
  const [search,     setSearch]     = useState('');
  const [importMsg,  setImportMsg]  = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const fileInputRef                = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const [ps, c] = await Promise.all([fetchPessoas(), fetchContagem(todayBRT())]);
    setPessoas(ps);
    setContagem(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const criarPessoa = async (data: Partial<Pessoa>) => {
    setSaving(true);
    try {
      await fetch('/api/refeicoes?action=pessoas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  };

  const zerarTudo = async () => {
    if (!confirm('Zerar TODAS as pessoas cadastradas? Esta ação não pode ser desfeita.')) return;
    setSaving(true);
    try {
      await fetch('/api/refeicoes?action=pessoas', { method: 'DELETE' });
      await load();
    } finally { setSaving(false); }
  };

  const importarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setImportMsg('');
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });

      const pessoas = rows.map((r: any) => ({
        nome:           String(r['Nome *'] ?? r['nome'] ?? r['Nome'] ?? r['NOME'] ?? '').trim(),
        categoria:      String(r['categoria'] ?? r['Categoria'] ?? r['CATEGORIA'] ?? 'colaborador').trim().toLowerCase(),
        empresa:        String(r['empresa']   ?? r['Empresa']   ?? r['EMPRESA']   ?? '').trim(),
        setor:          String(r['setor']     ?? r['Setor']     ?? r['SETOR']     ?? '').trim(),
        cargo:          String(r['Cargo'] ?? r['cargo'] ?? r['CARGO'] ?? '').trim(),
        dataNascimento: String(r['Data Nascimento (DD/MM/AAAA)'] ?? r['dataNascimento'] ?? r['Data Nascimento'] ?? '').trim(),
        dataAdmissao:   String(r['Data Admissão (DD/MM/AAAA)'] ?? r['Data Admissao (DD/MM/AAAA)'] ?? r['dataAdmissao'] ?? r['Data Admissão'] ?? '').trim(),
      })).filter((p: any) => p.nome);

      if (pessoas.length === 0) { setImportMsg('Nenhuma linha válida encontrada. Verifique as colunas: Nome *, Cargo, Data Nascimento (DD/MM/AAAA), Data Admissão (DD/MM/AAAA)'); setSaving(false); return; }

      const substituir = confirm(`Importar ${pessoas.length} pessoa(s)?\n\nOK = substituir cadastro atual\nCancelar = adicionar ao existente`);
      const res = await fetch('/api/refeicoes?action=pessoas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pessoas, substituir }),
      });
      const j = await res.json();
      setImportMsg(`✅ ${j.importadas} pessoa(s) importada(s) com sucesso`);
      await load();
    } catch (err) {
      setImportMsg('Erro ao processar o arquivo');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const editarPessoa = async (data: Partial<Pessoa>) => {
    if (!editando) return;
    setSaving(true);
    try {
      await fetch(`/api/refeicoes?action=pessoas&id=${editando.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setEditando(null);
      await load();
    } finally { setSaving(false); }
  };

  const pessoasFiltradas = pessoas.filter(p =>
    !search || p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.empresa.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === pessoasFiltradas.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(pessoasFiltradas.map(p => p.id)));
    }
  };

  const imprimirQrCodes = async () => {
    const lista = pessoas.filter(p => selecionados.has(p.id));
    if (lista.length === 0) return;

    const qrDataUrls: { pessoa: Pessoa; dataUrl: string }[] = await Promise.all(
      lista.map(p => new Promise<{ pessoa: Pessoa; dataUrl: string }>(resolve => {
        const canvas = document.createElement('canvas');
        QRCode.toCanvas(canvas, p.qrCode, { width: 200, margin: 2 }, () => {
          resolve({ pessoa: p, dataUrl: canvas.toDataURL('image/png') });
        });
      }))
    );

    const cards = qrDataUrls.map(({ pessoa, dataUrl }) => `
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px;border:1px solid #e5e7eb;border-radius:12px;break-inside:avoid;">
        <img src="${dataUrl}" style="width:160px;height:160px;" />
        <div style="text-align:center;">
          <div style="font-weight:700;font-size:13px;color:#111;">${pessoa.nome}</div>
          ${pessoa.cargo ? `<div style="font-size:11px;color:#6b7280;">${pessoa.cargo}</div>` : ''}
        </div>
      </div>`).join('');

    const html = `<!DOCTYPE html><html><head><title>QR Codes — Hibiscus Beach Club</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h2 { text-align:center; font-size:16px; color:#111; margin-bottom:16px; }
        .grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; }
        @media print { @page { size: A4; margin: 15mm; } }
      </style></head><body>
      <h2>QR Codes — Hibiscus Beach Club (${lista.length} colaborador${lista.length !== 1 ? 'es' : ''})</h2>
      <div class="grid">${cards}</div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">Refeitório</h1>
          <p className="text-xs text-gray-400">Cadastro de pessoas e QR Codes</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Upload size={14} /> Importar Excel/CSV
          </button>
          <button onClick={zerarTudo} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <Trash2 size={14} /> Zerar Tudo
          </button>
          {selecionados.size > 0 && (
            <button onClick={imprimirQrCodes} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
              <Printer size={14} /> Imprimir QR ({selecionados.size})
            </button>
          )}
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors">
            <Plus size={14} /> Nova Pessoa
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importarArquivo} />
      {importMsg && <p className="text-sm text-center text-green-600 dark:text-green-400 font-medium">{importMsg}</p>}

      {/* KPIs do dia */}
      {contagem && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total hoje', value: contagem.total, emoji: '🍽️' },
            { label: 'Almoços',   value: contagem.porTipo?.almoco ?? 0, emoji: '☀️' },
            { label: 'Jantares',  value: contagem.porTipo?.jantar ?? 0, emoji: '🌙' },
            { label: 'Cafés',     value: contagem.porTipo?.cafe   ?? 0, emoji: '☕' },
          ].map(k => (
            <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 flex items-center gap-3">
              <span className="text-2xl">{k.emoji}</span>
              <div>
                <p className="text-2xl font-black text-gray-900 dark:text-white leading-none">{k.value}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{k.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulário de nova pessoa */}
      {showForm && (
        <PessoaForm onSave={criarPessoa} onCancel={() => setShowForm(false)} />
      )}

      {/* Busca */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nome ou empresa..."
        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {/* Tabela */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm animate-pulse">Carregando...</div>
      ) : pessoasFiltradas.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          {search ? 'Nenhum resultado encontrado.' : 'Nenhuma pessoa cadastrada ainda.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox"
                    checked={pessoasFiltradas.length > 0 && selecionados.size === pessoasFiltradas.length}
                    ref={el => { if (el) el.indeterminate = selecionados.size > 0 && selecionados.size < pessoasFiltradas.length; }}
                    onChange={toggleTodos}
                    className="rounded cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Categoria</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Empresa</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {pessoasFiltradas.map(p => (
                <>
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 w-8">
                      <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggleSelecionado(p.id)} className="rounded cursor-pointer" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.foto
                          ? <img src={p.foto} alt={p.nome} className="w-7 h-7 rounded-full object-cover" />
                          : <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xs font-bold text-brand-600 dark:text-brand-400">{p.nome.charAt(0)}</div>
                        }
                        <span className="font-medium text-gray-900 dark:text-white">{p.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 capitalize hidden sm:table-cell">{p.categoria}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">{p.empresa || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${p.ativo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setQrPessoa(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-brand-600 transition-colors" title="Ver QR Code">
                          <QrCode size={15} />
                        </button>
                        <button onClick={() => setEditando(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-brand-600 transition-colors" title="Editar">
                          <Pencil size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editando?.id === p.id && (
                    <tr key={`edit-${p.id}`}>
                      <td colSpan={6} className="px-4 py-3">
                        <PessoaForm initial={p} onSave={editarPessoa} onCancel={() => setEditando(null)} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saving && (
        <div className="fixed bottom-4 right-4 bg-brand-600 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg">
          Salvando...
        </div>
      )}

      {qrPessoa && <QrModal pessoa={qrPessoa} onClose={() => setQrPessoa(null)} />}
    </div>
  );
}
