// Debug: descobre o endpoint e formato de login da loja Paytour
const LOJA_BASE = 'https://loja.hibiscusbeachclub.com.br';
const LOJA_USER = process.env.PAYTOUR_LOJA_USER ?? '';
const LOJA_PASS = process.env.PAYTOUR_LOJA_PASS ?? '';

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');

  const results: Record<string, any> = {};

  // 1. Inspeciona a página de login — pega form action, inputs, qualquer token CSRF
  try {
    const r = await fetch(`${LOJA_BASE}/admin/login`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await r.text();
    results.loginPage = {
      status: r.status,
      // Extrai action do form
      formAction: html.match(/<form[^>]+action=["']([^"']+)["']/i)?.[1] ?? null,
      // Extrai todos os inputs
      inputs: [...html.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]*(?:value=["']([^"']*?)["'])?/gi)]
        .map(m => ({ name: m[1], value: m[2] ?? '' })),
      // Extrai cookies
      cookies: r.headers.get('set-cookie'),
    };
  } catch (e: any) {
    results.loginPage = { error: String(e) };
  }

  // 2. Tenta POST JSON para /admin/login
  try {
    const r = await fetch(`${LOJA_BASE}/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email: LOJA_USER, senha: LOJA_PASS }),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    const text = await r.text();
    results.postJson = {
      status: r.status,
      setCookie: r.headers.get('set-cookie'),
      location: r.headers.get('location'),
      bodySnippet: text.slice(0, 300),
    };
  } catch (e: any) {
    results.postJson = { error: String(e) };
  }

  // 3. Tenta POST form-urlencoded para /admin/login
  try {
    const r = await fetch(`${LOJA_BASE}/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/json',
        Referer: `${LOJA_BASE}/admin/login`,
      },
      body: new URLSearchParams({ email: LOJA_USER, senha: LOJA_PASS }).toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    const text = await r.text();
    results.postForm = {
      status: r.status,
      setCookie: r.headers.get('set-cookie'),
      location: r.headers.get('location'),
      bodySnippet: text.slice(0, 300),
    };
  } catch (e: any) {
    results.postForm = { error: String(e) };
  }

  // 4. Tenta POST para /admin/usuarios/autenticar
  try {
    const r = await fetch(`${LOJA_BASE}/admin/usuarios/autenticar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email: LOJA_USER, senha: LOJA_PASS }),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    const text = await r.text();
    results.postAutenticar = {
      status: r.status,
      setCookie: r.headers.get('set-cookie'),
      location: r.headers.get('location'),
      bodySnippet: text.slice(0, 300),
    };
  } catch (e: any) {
    results.postAutenticar = { error: String(e) };
  }

  return res.json(results);
}
