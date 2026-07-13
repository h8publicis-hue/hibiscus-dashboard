// Módulo refeitório — endpoint unificado (armazenamento: Upstash Redis)
// GET  /api/refeicoes                       → lista/contagem refeições do dia
// POST /api/refeicoes                       → registra refeição
// GET  /api/refeicoes?action=lookup&qr=UUID → lookup pessoa por QR
// GET  /api/refeicoes?action=pessoas        → lista pessoas
// POST /api/refeicoes?action=pessoas        → cria pessoa
// PATCH /api/refeicoes?action=pessoas&id=ID → edita pessoa

const KV_URL   = process.env.KV_REST_API_URL   ?? '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? '';

const PESSOAS_KEY = 'refeicoes:pessoas';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function todayBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
}

function nowBRT(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });
}

async function kvGet(key: string): Promise<any> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    const j = await r.json() as any;
    const raw = j?.result;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

async function getPessoas(): Promise<any[]> {
  return (await kvGet(PESSOAS_KEY)) ?? [];
}

async function savePessoas(pessoas: any[]): Promise<void> {
  await kvSet(PESSOAS_KEY, pessoas);
}

async function getRefeicoes(data: string): Promise<any[]> {
  return (await kvGet(`refeicoes:registros:${data}`)) ?? [];
}

async function saveRefeicoes(data: string, refeicoes: any[]): Promise<void> {
  await kvSet(`refeicoes:registros:${data}`, refeicoes);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV não configurado' });

  const action = (req.query?.action as string) ?? '';

  // ── LOOKUP: GET ?action=lookup&qr=UUID ──────────────────────────────────────
  if (action === 'lookup') {
    const qr = (req.query?.qr as string ?? '').trim();
    if (!qr) return res.status(400).json({ error: 'qr obrigatório' });
    try {
      const pessoas = await getPessoas();
      const pessoa = pessoas.find((p: any) => p.qrCode === qr);
      if (!pessoa) return res.json({ found: false });
      return res.json({ found: true, pessoa });
    } catch (err: any) { return res.status(500).json({ error: String(err) }); }
  }

  // ── PESSOAS: GET/POST/PATCH ?action=pessoas ──────────────────────────────────
  if (action === 'pessoas') {
    if (req.method === 'GET') {
      try {
        const pessoas = await getPessoas();
        pessoas.sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR'));
        return res.json({ pessoas });
      } catch (err: any) { return res.status(500).json({ error: String(err) }); }
    }

    if (req.method === 'POST') {
      const id = uuid(); const qrCode = uuid();
      const nova = {
        id, qrCode,
        nome:      String(req.body?.nome      ?? '').slice(0, 100),
        categoria: String(req.body?.categoria ?? 'colaborador'),
        empresa:   String(req.body?.empresa   ?? '').slice(0, 100),
        setor:     String(req.body?.setor     ?? '').slice(0, 100),
        foto:      String(req.body?.foto      ?? '').slice(0, 500),
        ativo:     req.body?.ativo !== false,
      };
      try {
        const pessoas = await getPessoas();
        pessoas.push(nova);
        await savePessoas(pessoas);
        return res.json({ ok: true, pessoa: nova });
      } catch (err: any) { return res.status(500).json({ error: String(err) }); }
    }

    if (req.method === 'PATCH') {
      const id = (req.query?.id as string ?? '').trim();
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      try {
        const pessoas = await getPessoas();
        const idx = pessoas.findIndex((p: any) => p.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Pessoa não encontrada' });
        const allowed = ['nome', 'categoria', 'empresa', 'setor', 'foto', 'ativo'];
        for (const k of allowed) { if (req.body?.[k] !== undefined) pessoas[idx][k] = req.body[k]; }
        await savePessoas(pessoas);
        return res.json({ ok: true, pessoa: pessoas[idx] });
      } catch (err: any) { return res.status(500).json({ error: String(err) }); }
    }

    return res.status(405).end();
  }

  // ── REFEIÇÕES: GET (lista/contagem) ─────────────────────────────────────────
  if (req.method === 'GET') {
    const data = (req.query?.data as string) || todayBRT();
    try {
      const refeicoes = await getRefeicoes(data);
      const registradas = refeicoes.filter((r: any) => r.status === 'registrada');
      return res.json({
        refeicoes, total: registradas.length,
        porTipo: {
          almoco: registradas.filter((r: any) => r.tipoRefeicao === 'almoco').length,
          jantar: registradas.filter((r: any) => r.tipoRefeicao === 'jantar').length,
          cafe:   registradas.filter((r: any) => r.tipoRefeicao === 'cafe').length,
          lanche: registradas.filter((r: any) => r.tipoRefeicao === 'lanche').length,
        },
      });
    } catch (err: any) { return res.status(500).json({ error: String(err) }); }
  }

  // ── REFEIÇÕES: POST (registrar) ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const { pessoaId, nome, categoria, empresa, tipoRefeicao = 'almoco', origemRegistro = 'QRCode' } = req.body ?? {};
    if (!pessoaId || !nome) return res.status(400).json({ error: 'pessoaId e nome obrigatórios' });
    const data = todayBRT(); const hora = nowBRT();
    try {
      const refeicoes = await getRefeicoes(data);
      const duplicada = refeicoes.find((r: any) => r.pessoaId === pessoaId && r.tipoRefeicao === tipoRefeicao && r.status === 'registrada');
      if (duplicada) return res.json({ ok: true, status: 'duplicada', horaAnterior: duplicada.hora });
      const refeicao = {
        id: uuid(), pessoaId, nome: String(nome).slice(0, 100),
        categoria: String(categoria ?? '').slice(0, 50),
        empresa: String(empresa ?? '').slice(0, 100),
        tipoRefeicao: String(tipoRefeicao), data, hora,
        timestamp: Date.now(), origemRegistro: String(origemRegistro), status: 'registrada',
      };
      refeicoes.push(refeicao);
      await saveRefeicoes(data, refeicoes);
      return res.json({ ok: true, status: 'registrada', refeicao });
    } catch (err: any) { return res.status(500).json({ error: String(err) }); }
  }

  return res.status(405).end();
}
