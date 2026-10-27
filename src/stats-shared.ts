// Shared by the homepage and the /api/stats Pages Function: the counters every
// player's flights add to, and how they roll up into the displayed totals.

export const CRASH_TYPES = [
  'structural',
  'hard_landing',
  'sideways',
  'off_lakebed',
  'gear_up',
  'ventral',
  'ground_impact',
] as const;
export type CrashType = (typeof CRASH_TYPES)[number];

export const CRASH_LABEL: Record<CrashType, string> = {
  structural: 'Airframe overload',
  hard_landing: 'Hard landing',
  sideways: 'Sideways touchdown',
  off_lakebed: 'Off the lakebed',
  gear_up: 'Gear-up impact',
  ventral: 'Ventral fin strike',
  ground_impact: 'Flown into the ground',
};

/** Every counter the server accepts. */
export const COUNTERS = ['flights', 'landings', 'belly_landings', ...CRASH_TYPES.map((c) => `crash:${c}` as const)] as const;
export type Counter = (typeof COUNTERS)[number];
export const isCounter = (k: unknown): k is Counter => typeof k === 'string' && (COUNTERS as readonly string[]).includes(k);

export interface Totals {
  flights: number;
  landings: number;
  bellyLandings: number;
  crashes: number;
  crashTypes: Partial<Record<CrashType, number>>;
}

/** Roll raw counter rows up into the totals shown on the homepage. */
export function totalsFrom(rows: { key: string; n: number }[]): Totals {
  const t: Totals = { flights: 0, landings: 0, bellyLandings: 0, crashes: 0, crashTypes: {} };
  for (const { key, n } of rows) {
    if (!isCounter(key)) continue;
    if (key === 'flights') t.flights = n;
    else if (key === 'landings') t.landings = n;
    else if (key === 'belly_landings') t.bellyLandings = n;
    else {
      const c = key.slice(6) as CrashType;
      t.crashTypes[c] = n;
      t.crashes += n;
    }
  }
  return t;
}
