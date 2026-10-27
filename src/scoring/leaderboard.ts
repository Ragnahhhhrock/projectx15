// Top-10 leaderboard. The global board lives behind /api/leaderboard (Cloudflare Pages Function + KV).
// If the API is unreachable (dev server, offline) scores are kept in this browser only.
import { computeScore, type Grade, type ScoreInputs, type ScoreResult } from './score';

export interface Entry {
  name: string;
  score: number;
  grade: Grade;
  maxMach: number;
  maxAltFt: number;
  outcome: string;
  at: number;
}

export interface Board {
  entries: Entry[];
  /** 'global' = shared server board, 'local' = this browser only */
  source: 'global' | 'local';
}

const API = '/api/leaderboard';
const LOCAL_KEY = 'x15.leaderboard';
const NAME_KEY = 'x15.name';
export const TOP = 10;

export const cleanName = (s: string): string => s.replace(/[^A-Za-z0-9 _.\-]/g, '').trim().slice(0, 16);

export function savedName(): string {
  try { return cleanName(localStorage.getItem(NAME_KEY) ?? ''); } catch { return ''; }
}
export function saveName(name: string): void {
  try { localStorage.setItem(NAME_KEY, cleanName(name)); } catch { /* storage unavailable */ }
}

function loadLocal(): Entry[] {
  try { return (JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as Entry[]).slice(0, TOP); } catch { return []; }
}
function saveLocal(e: Entry[]): void {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(e.slice(0, TOP))); } catch { /* storage unavailable */ }
}

export const sortEntries = (e: Entry[]): Entry[] => [...e].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, TOP);

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as T;
  } finally { clearTimeout(timer); }
}

export async function fetchBoard(): Promise<Board> {
  try {
    const d = await getJson<{ entries: Entry[] }>(API);
    if (!Array.isArray(d.entries)) throw new Error('bad response');
    return { entries: sortEntries(d.entries), source: 'global' };
  } catch {
    return { entries: sortEntries(loadLocal()), source: 'local' };
  }
}

export interface Submitted {
  /** 1-based rank on the board that took the score, or null if it missed the top 10 */
  rank: number | null;
  board: Board;
}

/** Posts a finished flight. Falls back to the local board when the API can't be reached. */
export async function submitScore(name: string, stats: ScoreInputs, result: ScoreResult): Promise<Submitted> {
  const entry: Entry = {
    name: cleanName(name) || 'PILOT', score: result.total, grade: result.grade,
    maxMach: +stats.maxMach.toFixed(2), maxAltFt: Math.round(stats.maxAltFt), outcome: stats.outcome, at: Date.now(),
  };
  try {
    const d = await getJson<{ entries: Entry[]; rank: number | null }>(API, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: entry.name, stats }),
    });
    return { rank: d.rank, board: { entries: sortEntries(d.entries), source: 'global' } };
  } catch {
    const entries = sortEntries([...loadLocal(), entry]);
    saveLocal(entries);
    const i = entries.findIndex((e) => e.at === entry.at && e.name === entry.name);
    return { rank: i >= 0 ? i + 1 : null, board: { entries, source: 'local' } };
  }
}

/** Server-side: build a stored entry from validated stats, recomputing the score. */
export function entryFromStats(name: string, stats: ScoreInputs, at = Date.now()): Entry {
  const r = computeScore(stats);
  return { name: cleanName(name) || 'PILOT', score: r.total, grade: r.grade, maxMach: +stats.maxMach.toFixed(2), maxAltFt: Math.round(stats.maxAltFt), outcome: stats.outcome, at };
}

export function renderBoard(board: Board, highlightAt?: number): string {
  if (!board.entries.length) return '<p class="lb-empty">No flights logged yet. Be the first.</p>';
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const rows = board.entries.map((e, i) =>
    `<tr${e.at === highlightAt ? ' class="me"' : ''}><td>${i + 1}</td><td>${esc(e.name)}</td><td class="g g-${e.grade}">${e.grade}</td>` +
    `<td>${e.score}</td><td>M${e.maxMach.toFixed(2)}</td><td>${e.maxAltFt.toLocaleString('en-US')} ft</td></tr>`).join('');
  return `<table class="lb"><thead><tr><th>#</th><th>Pilot</th><th>Gr</th><th>Score</th><th>Max</th><th>Peak alt</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<small class="lb-src">${board.source === 'global' ? 'Global top 10' : 'This browser only — global board offline'}</small>`;
}
