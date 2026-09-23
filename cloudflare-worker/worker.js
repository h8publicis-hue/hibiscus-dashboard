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

    // Login especial: POST /loja/admin — faz login na loja, extrai PHPSESSID e
    // devolve JSON { ok, phpsessid } para que o Vercel não precise lidar com
    // redirect/Set-Cookie (que podem ser perdidos em fetch do Node.js).
    const isLoginPost = isLoja && request.method === 'POST' && path === '/admin';
    if (isLoginPost) {
      const loginRes = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: request.body,
        redirect: 'manual', // captura o 302 com Set-Cookie sem seguir
      });
      const setCookie = loginRes.headers.get('set-cookie') ?? '';
      const match = setCookie.match(/PHPSESSID=([^;,\s]+)/i);
      if (match?.[1]) {
        return new Response(JSON.stringify({ ok: true, phpsessid: match[1] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      // Login falhou: retorna body/status original para diagnóstico
      const body = await loginRes.text().catch(() => '');
      return new Response(JSON.stringify({ ok: false, status: loginRes.status, setCookie, body: body.slice(0, 200) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const proxied = new Request(targetUrl, {
      method:  request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'follow',
    });

    const response = await fetch(proxied);

    // Repassa Content-Type e Set-Cookie
    const resHeaders = new Headers();
    resHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/json');
    resHeaders.set('Access-Control-Allow-Origin', '*');
    for (const [k, v] of response.headers.entries()) {
      if (k.toLowerCase() === 'set-cookie') resHeaders.append('set-cookie', v);
    }

    return new Response(response.body, { status: response.status, headers: resHeaders });
  },
};
