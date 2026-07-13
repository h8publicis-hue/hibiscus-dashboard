import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CheckCircle, XCircle, AlertCircle, UtensilsCrossed } from 'lucide-react';
import { Pessoa, TipoRefeicao } from '../types';

const TIPOS: { key: TipoRefeicao; label: string; emoji: string }[] = [
  { key: 'cafe',   label: 'Café',   emoji: '☕' },
  { key: 'almoco', label: 'Almoço', emoji: '🍽️' },
  { key: 'jantar', label: 'Jantar', emoji: '🌙' },
  { key: 'lanche', label: 'Lanche', emoji: '🥪' },
];

type FeedbackState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'loading' }
  | { kind: 'sucesso';    pessoa: Pessoa; hora: string }
  | { kind: 'duplicada';  nome: string;  horaAnterior: string; tipo: string }
  | { kind: 'invalido' };

export function Refeicao() {
  const [tipo, setTipo]       = useState<TipoRefeicao>('almoco');
  const [fb, setFb]           = useState<FeedbackState>({ kind: 'idle' });
  const scannerRef            = useRef<Html5Qrcode | null>(null);
  const scanningRef           = useRef(false);
  const tipoRef               = useRef<TipoRefeicao>('almoco');

  useEffect(() => { tipoRef.current = tipo; }, [tipo]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    scanningRef.current = false;
  }, []);

  const startScanner = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setFb({ kind: 'scanning' });

    await new Promise(r => setTimeout(r, 100));

    const el = document.getElementById('qr-reader');
    if (!el) { scanningRef.current = false; return; }

    const qr = new Html5Qrcode('qr-reader');
    scannerRef.current = qr;

    try {
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        async (decodedText) => {
          if (!scanningRef.current) return;
          scanningRef.current = false;
          setFb({ kind: 'loading' });

          try { await qr.stop(); } catch { /* ignore */ }
          scannerRef.current = null;

          await processarQR(decodedText.trim(), tipoRef.current);
        },
        () => { /* erros de leitura ignorados */ },
      );
    } catch {
      scanningRef.current = false;
      setFb({ kind: 'idle' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const processarQR = async (qr: string, tipoRefeicao: TipoRefeicao) => {
    try {
      const lookupRes = await fetch(`/api/refeicoes?action=lookup&qr=${encodeURIComponent(qr)}`);
      const lookup    = await lookupRes.json();

      if (!lookup.found || !lookup.pessoa?.ativo) {
        setFb({ kind: 'invalido' });
        setTimeout(() => voltarAoScanner(), 3000);
        return;
      }

      const pessoa: Pessoa = lookup.pessoa;
      const regRes = await fetch('/api/refeicoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pessoaId:       pessoa.id,
          nome:           pessoa.nome,
          categoria:      pessoa.categoria,
          empresa:        pessoa.empresa,
          tipoRefeicao,
          origemRegistro: 'QRCode',
        }),
      });
      const reg = await regRes.json();

      if (reg.status === 'duplicada') {
        const tipoLabel = TIPOS.find(t => t.key === tipoRefeicao)?.label ?? tipoRefeicao;
        setFb({ kind: 'duplicada', nome: pessoa.nome, horaAnterior: reg.horaAnterior, tipo: tipoLabel });
      } else {
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });
        setFb({ kind: 'sucesso', pessoa, hora });
      }
    } catch {
      setFb({ kind: 'invalido' });
    }
    setTimeout(() => voltarAoScanner(), 3000);
  };

  const voltarAoScanner = useCallback(() => {
    setFb({ kind: 'idle' });
    startScanner();
  }, [startScanner]);

  useEffect(() => {
    startScanner();
    return () => { stopScanner(); };
  }, [startScanner, stopScanner]);

  const tipoAtual = TIPOS.find(t => t.key === tipo)!;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col select-none">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UtensilsCrossed size={18} className="text-brand-400" />
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Hibiscus Beach Club</p>
            <h1 className="text-sm font-bold text-white leading-tight">Refeitório</h1>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {TIPOS.map(t => (
            <button
              key={t.key}
              onClick={async () => {
                setTipo(t.key);
                await stopScanner();
                setTimeout(() => startScanner(), 200);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tipo === t.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Área principal */}
      <div className="flex-1 relative flex items-center justify-center">

        {/* Scanner — sempre montado no DOM, visível quando scanning */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ display: (fb.kind === 'idle' || fb.kind === 'scanning') ? 'flex' : 'none' }}
        >
          <p className="text-gray-400 text-sm mb-4">Aproxime o QR Code da câmera</p>
          <div className="relative">
            <div id="qr-reader" className="rounded-2xl overflow-hidden" style={{ width: 300, height: 300 }} />
            {/* Guia visual */}
            <div className="absolute inset-0 pointer-events-none rounded-2xl border-2 border-brand-400 opacity-60" />
          </div>
          <p className="text-gray-500 text-xs mt-4">{tipoAtual.emoji} Leitura para: <span className="text-gray-300 font-semibold">{tipoAtual.label}</span></p>
        </div>

        {/* Loading */}
        {fb.kind === 'loading' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
            <p className="text-gray-300 text-sm">Verificando...</p>
          </div>
        )}

        {/* Sucesso */}
        {fb.kind === 'sucesso' && (
          <div className="w-full h-full bg-green-600 flex flex-col items-center justify-center gap-4 px-6 animate-in fade-in duration-300">
            {fb.pessoa.foto ? (
              <img src={fb.pessoa.foto} alt={fb.pessoa.nome} className="w-24 h-24 rounded-full object-cover border-4 border-white/30" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center text-4xl font-black text-white">
                {fb.pessoa.nome.charAt(0).toUpperCase()}
              </div>
            )}
            <CheckCircle size={48} className="text-white" />
            <div className="text-center">
              <p className="text-3xl font-black text-white">{fb.pessoa.nome}</p>
              {fb.pessoa.empresa && <p className="text-green-200 text-sm mt-1">{fb.pessoa.empresa}</p>}
              {fb.pessoa.setor   && <p className="text-green-300 text-xs">{fb.pessoa.setor}</p>}
            </div>
            <p className="text-white text-lg font-semibold">Bom {tipoAtual.label.toLowerCase()}! 🎉</p>
            <p className="text-green-200 text-sm">{fb.hora}</p>
          </div>
        )}

        {/* Duplicada */}
        {fb.kind === 'duplicada' && (
          <div className="w-full h-full bg-amber-500 flex flex-col items-center justify-center gap-4 px-6">
            <AlertCircle size={56} className="text-white" />
            <div className="text-center">
              <p className="text-2xl font-black text-white">{fb.nome}</p>
              <p className="text-amber-100 text-base mt-2">
                {fb.tipo} já registrado hoje às <span className="font-bold">{fb.horaAnterior}</span>
              </p>
            </div>
          </div>
        )}

        {/* Inválido */}
        {fb.kind === 'invalido' && (
          <div className="w-full h-full bg-red-600 flex flex-col items-center justify-center gap-4 px-6">
            <XCircle size={56} className="text-white" />
            <div className="text-center">
              <p className="text-2xl font-black text-white">QR Code não encontrado</p>
              <p className="text-red-200 text-sm mt-2">Cartão não cadastrado no sistema</p>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="text-center py-3 border-t border-gray-700">
        <p className="text-[9px] text-gray-600 leading-tight">Desenvolvido por H8 Publicis</p>
      </div>
    </div>
  );
}
