// Cloudflare Pages Function: collective flight stats for every player.
// GET  /api/stats                    -> Totals
// POST /api/stats {"event": Counter} -> adds one, returns Totals
// Needs a D1 database bound to the Pages project as DB (see README).
import { isCounter, totalsFrom } from '../../src/stats-shared';

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
}
interface D1 {
  prepare(sql: string): D1Statement;
}
interface Ctx {
  request: Request;
  env: { DB?: D1 };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function totals(db: D1) {
  const { results } = await db.prepare('SELECT key, n FROM stats').all<{ key: string; n: number }>();
  return totalsFrom(results);
}

async function ensureTable(db: D1) {
  await db.prepare('CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)').run();
}

export async function onRequestGet({ env }: Ctx): Promise<Response> {
  if (!env.DB) return json({ error: 'stats database not configured' }, 503);
  await ensureTable(env.DB);
  return json(await totals(env.DB));
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  if (!env.DB) return json({ error: 'stats database not configured' }, 503);
  // Only the site itself may count flights.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'forbidden' }, 403);

  let event: unknown;
  try { event = ((await request.json()) as { event?: unknown }).event; } catch { /* bad body */ }
  if (!isCounter(event)) return json({ error: 'unknown event' }, 400);

  await ensureTable(env.DB);
  await env.DB.prepare('INSERT INTO stats (key, n) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1').bind(event).run();
  return json(await totals(env.DB));
}
