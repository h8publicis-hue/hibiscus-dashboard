// Proxy Worker — encaminha chamadas ao api-ha.paytour.com.br
// Vercel → este Worker (IP Cloudflare) → Paytour (sem bloqueio)

const TARGET = 'https://api-ha.paytour.com.br';

export default {
  async fetch(request, env) {
    // Valida secret para não deixar o Worker público
    const secret = request.headers.get('x-proxy-secret');
    if (secret !== env.PROXY_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const targetUrl = TARGET + url.pathname + url.search;

    // Replica headers originais removendo o secret
    const headers = new Headers(request.headers);
    headers.delete('x-proxy-secret');
    headers.set('host', 'api-ha.paytour.com.br');

    const proxied = new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
    });

    const response = await fetch(proxied);

    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
