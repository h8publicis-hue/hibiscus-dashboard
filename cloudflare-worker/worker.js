// Proxy Worker — roteia para Paytour API ou Loja conforme prefixo
// Vercel (AWS) → este Worker (IP Cloudflare) → destino (sem bloqueio Bot Fight Mode)
//
// /loja/*  → https://loja.hibiscusbeachclub.com.br/*  (check-in, calendário)
// /*       → https://api-ha.paytour.com.br/*           (API Paytour)

const PAYTOUR_TARGET = 'https://api-ha.paytour.com.br';
const LOJA_TARGET    = 'https://loja.hibiscusbeachclub.com.br';

export default {
  async fetch(request, env) {
    // Valida secret para não deixar o Worker público
    const secret = request.headers.get('x-proxy-secret');
    if (secret !== env.PROXY_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);

    // Roteia /loja/* → loja.hibiscusbeachclub.com.br
    const isLoja = url.pathname.startsWith('/loja/') || url.pathname === '/loja';
    const target  = isLoja ? LOJA_TARGET : PAYTOUR_TARGET;
    const path    = isLoja ? url.pathname.replace(/^\/loja/, '') || '/' : url.pathname;
    const targetUrl = target + path + url.search;

    const headers = new Headers(request.headers);
    headers.delete('x-proxy-secret');
    headers.set('host', isLoja ? 'loja.hibiscusbeachclub.com.br' : 'api-ha.paytour.com.br');

    const proxied = new Request(targetUrl, {
      method:  request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'follow',
    });

    const response = await fetch(proxied);

    // Preserva Content-Type original (a loja pode retornar JSON ou HTML)
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
