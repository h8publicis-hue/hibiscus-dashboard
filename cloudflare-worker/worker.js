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

    const headers = new Headers();
    // Copia apenas headers relevantes — exclui headers de proxy/CDN que
    // revelam a origem real (Vercel/AWS) e ativam o Bot Fight Mode do Paytour.
    for (const [k, v] of request.headers.entries()) {
      const lower = k.toLowerCase();
      if (
        lower === 'x-proxy-secret' ||
        lower.startsWith('x-forwarded') ||
        lower.startsWith('x-vercel') ||
        lower.startsWith('cf-') ||
        lower === 'x-real-ip' ||
        lower === 'true-client-ip' ||
        lower === 'forwarded'
      ) continue;
      headers.set(k, v);
    }
    headers.set('host', isLoja ? 'loja.hibiscusbeachclub.com.br' : 'api-ha.paytour.com.br');

    // Para chamadas de login (POST /loja/admin) usamos redirect:'manual' para
    // capturar o Set-Cookie do 302 antes que o redirect o descarte.
    const isLoginPost = isLoja && request.method === 'POST' && path === '/admin';
    const proxied = new Request(targetUrl, {
      method:  request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: isLoginPost ? 'manual' : 'follow',
    });

    const response = await fetch(proxied);

    // Repassa Set-Cookie (necessário para capturar PHPSESSID do login)
    const resHeaders = new Headers();
    resHeaders.set('Content-Type', response.headers.get('Content-Type') || 'text/html');
    resHeaders.set('Access-Control-Allow-Origin', '*');
    for (const [k, v] of response.headers.entries()) {
      if (k.toLowerCase() === 'set-cookie') resHeaders.append('set-cookie', v);
    }
    // Para redirect manual: repassa Location para que o cliente saiba o destino
    const loc = response.headers.get('location');
    if (loc) resHeaders.set('x-redirect-location', loc);

    return new Response(response.body, { status: response.status, headers: resHeaders });
  },
};
