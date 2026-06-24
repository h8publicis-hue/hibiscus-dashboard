// Faturamento do mês — scraping do Resumo Financeiro do admin Magento.
// Autentica em loja.hibiscusbeachclub.com.br/admin, faz POST do relatório
// e extrai o "Total Movimentado" do HTML retornado.
// Cache Redis 1h — apenas 1 requisição real por hora.

const ADMIN_BASE  = 'https://loja.hibiscusbeachclub.com.br/admin';
const ADMIN_EMAIL = process.env.MAGENTO_ADMIN_EMAIL ?? '';
const ADMIN_PASS  = process.env.MAGENTO_ADMIN_PASS  ?? '';
const KV_URL      = process.env.KV_REST_API_URL     ?? '';
const KV_TOKEN    = process.env.KV_REST_API_TOKEN   ?? '';
const TTL         = 60 * 60 * 1000; // 1 hora

let memCache: { revenue: number; ts: number } | null = null;

async function kvGet(key: string) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    const j = await r.json() as any;
    const raw = j?.result;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}
async function kvSet(key: string, value: unknown) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${Math.floor(TTL/1000)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

// Extrai form_key do HTML da página de login
function extractFormKey(html: string): string {
  const m = html.match(/name="form_key"\s+value="([^"]+)"/)
            ?? html.match(/form_key['"]\s*:\s*['"]([^'"]+)['"]/);
  return m?.[1] ?? '';
}

// Extrai o valor total do HTML do relatório.
// Tenta vários padrões para robustez.
function extractRevenue(html: string): number {
  // Padrão: "Total Movimentado" seguido do valor em algum elemento
  const patterns = [
    /[Tt]otal\s+[Mm]ovimentado[^0-9R$]*R?\$?\s*([\d.,]+)/,
    /[Tt]otal\s+[Mm]ovimentado[^<]*<[^>]+>\s*R?\$?\s*([\d.,]+)/,
    /[Tt]otal[^<]*<\/[^>]+>\s*<[^>]+>\s*R?\$?\s*([\d.,]+)/,
    /R\$\s*([\d.,]+)/g,
  ];

  for (const pattern of patterns) {
    if (pattern.global) continue; // ignora o catch-all por ora
    const m = html.match(pattern);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (val > 1000) return val; // valor plausível de faturamento
    }
  }

  // Fallback: pega todos os valores R$ do HTML e retorna o maior
  const all = [...html.matchAll(/R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?)/g)]
    .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
    .filter(v => v > 1000);
  if (all.length) {
    all.sort((a, b) => b - a);
    console.log('[fat-mag] valores R$ encontrados no HTML:', all.slice(0, 10));
    return all[0];
  }

  return 0;
}

async function fetchResumoFinanceiro(since: string, until: string): Promise<number> {
  // Formata período no formato esperado pelo Magento: DD/MM/AAAA - DD/MM/AAAA
  const fmt = (s: string) => s.split('-').reverse().join('/');
  const periodo = `${fmt(since)} - ${fmt(until)}`;

  // Passo 1: GET página de login → extrai form_key
  const loginPageRes = await fetch(`${ADMIN_BASE}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  const loginHtml = await loginPageRes.text();
  const formKey1  = extractFormKey(loginHtml);
  const cookies1  = loginPageRes.headers.get('set-cookie') ?? '';
  console.log(`[fat-mag] login page status=${loginPageRes.status} form_key=${formKey1.slice(0,8)}...`);

  if (!formKey1) throw new Error('Não foi possível obter form_key da página de login');

  // Passo 2: POST login → obtém sessão autenticada
  const loginBody = new URLSearchParams({
    'login[username]': ADMIN_EMAIL,
    'login[password]': ADMIN_PASS,
    'form_key': formKey1,
  });
  const loginRes = await fetch(`${ADMIN_BASE}/index/index/`, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies1,
    },
    body: loginBody.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  const cookies2 = [cookies1, loginRes.headers.get('set-cookie') ?? ''].filter(Boolean).join('; ');
  console.log(`[fat-mag] login POST status=${loginRes.status}`);

  // Passo 3: GET página do relatório → novo form_key autenticado
  const reportPageRes = await fetch(`${ADMIN_BASE}/custom-report/resumo_financeiro`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookies2 },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  const reportPageHtml = await reportPageRes.text();
  const formKey2 = extractFormKey(reportPageHtml);
  const cookies3 = [cookies2, reportPageRes.headers.get('set-cookie') ?? ''].filter(Boolean).join('; ');
  console.log(`[fat-mag] report page status=${reportPageRes.status} form_key2=${formKey2.slice(0,8)}...`);

  // Passo 4: POST relatório com o período
  const reportBody = new URLSearchParams({
    'periodo': periodo,
    'tipo_item': '',
    'form_key': formKey2 || formKey1,
  });
  const reportRes = await fetch(`${ADMIN_BASE}/custom-report/resumo_financeiro`, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies3,
      Referer: `${ADMIN_BASE}/custom-report/resumo_financeiro`,
    },
    body: reportBody.toString(),
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  const reportHtml = await reportRes.text();
  console.log(`[fat-mag] report POST status=${reportRes.status} html_len=${reportHtml.length}`);

  // Log trecho do HTML para diagnóstico
  const snippet = reportHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
  console.log('[fat-mag] html snippet:', snippet);

  const revenue = extractRevenue(reportHtml);
  console.log(`[fat-mag] revenue extraído: R$ ${revenue}`);
  return revenue;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  if (!ADMIN_EMAIL || !ADMIN_PASS) return res.json({ revenue: 0, error: 'sem credenciais' });

  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const since = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  const key   = `ptf-mag1:${since}_${until}`;

  if (memCache && Date.now() - memCache.ts < TTL) return res.json({ revenue: memCache.revenue, since, until });
  const kv = await kvGet(key);
  if (kv && Date.now() - kv.ts < TTL) { memCache = kv; return res.json({ revenue: kv.revenue, since, until }); }

  try {
    const revenue = await fetchResumoFinanceiro(since, until);
    const entry   = { revenue, ts: Date.now() };
    memCache = entry;
    kvSet(key, entry);
    return res.json({ revenue, since, until });
  } catch (err: any) {
    console.error('[fat-mag]', err.message);
    if (memCache) return res.json({ revenue: memCache.revenue, since, until, stale: true });
    return res.status(500).json({ error: String(err) });
  }
}
