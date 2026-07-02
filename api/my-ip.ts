export default async function handler(_req: any, res: any) {
  const r = await fetch('https://api.ipify.org?format=json');
  const j = await r.json() as { ip: string };
  res.setHeader('Content-Type', 'application/json');
  return res.json({ ip: j.ip });
}
