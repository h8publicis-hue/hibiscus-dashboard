const PT_KEY    = process.env.VITE_PAYTOUR_APP_KEY    ?? '';
const PT_SECRET = process.env.VITE_PAYTOUR_APP_SECRET ?? '';
const PT_BASE   = 'https://api-ha.paytour.com.br';

export default async function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  const d: Record<string, any> = { key: PT_KEY.slice(0, 8) + '...', hasSecret: !!PT_SECRET };

  try {
    const creds = Buffer.from(`${PT_KEY}:${PT_SECRET}`).toString('base64');
    const authRes = await fetch(`${PT_BASE}/v2/lojas/login?grant_type=application`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.paytour.com.br', 'Content-Length': '0' },
      signal: AbortSignal.timeout(10_000),
    });
    const authText = await authRes.text();
    d.auth = { status: authRes.status, isHtml: authText.trim().startsWith('<'), snippet: authText.slice(0, 200) };

    if (!authText.trim().startsWith('<')) {
      const j = JSON.parse(authText);
      const token = j.access_token ?? '';
      d.auth.hasToken = !!token;

      if (token) {
        const ordersRes = await fetch(`${PT_BASE}/v2/pedidos?por_pagina=5&pagina=1`, {
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Mozilla/5.0', Origin: 'https://app.paytour.com.br', Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        const ordersText = await ordersRes.text();
        d.orders = { status: ordersRes.status, isHtml: ordersText.trim().startsWith('<'), snippet: ordersText.slice(0, 300) };
      }
    }
  } catch (e: any) {
    d.error = e.message;
  }

  return res.json(d);
}
