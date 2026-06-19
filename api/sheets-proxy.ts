import { get } from 'node:https';

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(url, { timeout: 20000 }, (res) => {
      if ((res.statusCode ?? 0) >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

export default async function handler(req: any, res: any) {
  const suffix = req.url.replace(/^\/sheets-api/, '');
  const url    = `https://docs.google.com${suffix}`;
  try {
    const body = await httpsGet(url);
    res.setHeader('Content-Type', 'application/json');
    return res.send(body);
  } catch (err: any) {
    return res.status(500).send(String(err));
  }
}
