// Cloudflare Pages Function: global top-10 leaderboard.
// Needs a KV namespace bound as LEADERBOARD (Pages project > Settings > Bindings).
// The server recomputes every score from the submitted flight stats; the client's total is ignored.
import { entryFromStats, sortEntries, type Entry } from '../../src/scoring/leaderboard';
import { validateInputs, type ScoreInputs } from '../../src/scoring/score';

interface KV { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> }
interface Env { LEADERBOARD?: KV }
interface Ctx { request: Request; env: Env }

const KEY = 'top';
const KEEP = 100;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function load(kv: KV): Promise<Entry[]> {
  try { return JSON.parse((await kv.get(KEY)) ?? '[]') as Entry[]; } catch { return []; }
}

export const onRequestGet = async ({ env }: Ctx): Promise<Response> => {
  if (!env.LEADERBOARD) return json({ error: 'leaderboard not configured' }, 503);
  return json({ entries: sortEntries(await load(env.LEADERBOARD)) });
};

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  if (!env.LEADERBOARD) return json({ error: 'leaderboard not configured' }, 503);
  let body: { name?: unknown; stats?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return json({ error: 'bad json' }, 400); }
  const bad = validateInputs(body.stats);
  if (bad) return json({ error: bad }, 400);
  const entry = entryFromStats(typeof body.name === 'string' ? body.name : '', body.stats as ScoreInputs);

  const all = [...(await load(env.LEADERBOARD)), entry];
  const kept = sortEntries(all);
  // Keep a deeper list than we show so a displaced score isn't lost, trimmed to KEEP.
  const deep = [...all].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, KEEP);
  await env.LEADERBOARD.put(KEY, JSON.stringify(deep));
  const i = kept.findIndex((e) => e.at === entry.at && e.name === entry.name && e.score === entry.score);
  return json({ entries: kept, rank: i >= 0 ? i + 1 : null });
};
