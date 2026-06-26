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

let cache: { data: unknown; ts: number } | null = null;
const TTL = 6 * 60 * 60 * 1000;  // 6h — avaliações Google mudam raramente

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  const apiKey  = process.env.GOOGLE_PLACES_API_KEY ?? '';
  const placeId = process.env.GOOGLE_PLACE_ID ?? '';
  if (!apiKey || !placeId) return res.json({ configured: false });
  if (cache && Date.now() - cache.ts < TTL) return res.json(cache.data);

  try {
    const url  = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,user_ratings_total,reviews&language=pt-BR&reviews_sort=newest&key=${apiKey}`;
    const body = await httpsGet(url);
    const json = JSON.parse(body) as any;
    if (json.status !== 'OK') throw new Error(`Places: ${json.status}`);

    const place     = json.result;
    const reviews   = place.reviews ?? [];
    const total     = place.user_ratings_total ?? 0;
    const avgRating = place.rating ?? 0;
    const stop = new Set(['a','o','e','de','do','da','em','para','com','um','uma','que','foi','mas','muito','mais','não','por','se','no','na']);
    const counts: Record<string, number> = {};
    reviews.forEach((r: any) => {
      r.text?.toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/)
        .filter((w: string) => w.length > 3 && !stop.has(w))
        .forEach((w: string) => { counts[w] = (counts[w] ?? 0) + 1; });
    });
    const topKeywords = Object.entries(counts).sort(([,a],[,b]) => (b as number) - (a as number)).slice(0,10).map(([word,count]) => ({ word, count }));
    const sampleDist: Record<number,number> = {1:0,2:0,3:0,4:0,5:0};
    reviews.forEach((r: any) => { sampleDist[r.rating] = (sampleDist[r.rating] ?? 0) + 1; });
    const sN = reviews.length || 1;
    const ratingDistribution = [5,4,3,2,1].map((s) => ({ stars: s, count: Math.round((sampleDist[s]/sN)*total) }));
    const byMonth: Record<string, number[]> = {};
    reviews.forEach((r: any) => {
      const d = new Date(r.time * 1000);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      (byMonth[k] = byMonth[k] ?? []).push(r.rating);
    });
    const now = new Date();
    const ratingHistory = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth()-(5-i), 1);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.','');
      const arr = byMonth[k];
      const rating = arr?.length ? Math.round((arr.reduce((s,v) => s+v, 0)/arr.length)*10)/10 : Math.round(avgRating*10)/10;
      return { month, rating };
    });

    const data = {
      configured: true, averageRating: avgRating, totalReviews: total,
      ratingDistribution, ratingHistory, topKeywords,
      recentReviews: reviews.map((r: any, i: number) => ({
        id: String(i+1), author: r.author_name, rating: r.rating,
        text: r.text, date: new Date(r.time*1000).toISOString().slice(0,10), replied: false,
      })),
      unansweredCount: reviews.filter((r: any) => r.text?.trim()).length,
    };
    cache = { data, ts: Date.now() };
    return res.json(data);
  } catch (err: any) {
    console.error('[google]', err.message);
    return res.status(500).json({ configured: true, error: String(err) });
  }
}
