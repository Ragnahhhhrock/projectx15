// Flight grading: turns a flight's summary stats into a 0–1000 score and a letter grade.
// Pure and dependency-free so the leaderboard API (functions/api/leaderboard.ts) can recompute
// and validate every submitted score with the same rules.

export const ALT_RECORD_FT = 354_200; // Joe Walker, flight 91
export const MACH_RECORD = 6.04; // Bob White, standard X-15

export type Outcome = 'landed' | 'damaged' | 'crashed';

/** Everything the score is built from. Units are the ones pilots read: ft, kt, ft/s, g. */
export interface ScoreInputs {
  maxMach: number;
  maxAltFt: number;
  /** RMS distance from the closer guide profile over its length, m */
  trackingErrM: number;
  trackingProfile: 'altitude' | 'speed';
  /** Peak |load factor| while flying free (not on the pylon or the ground), g */
  maxG: number;
  outcome: Outcome;
  /** Touchdown sink rate, ft/s (landings only) */
  sinkFps?: number;
  /** Touchdown speed, kt (landings only) */
  touchdownKt?: number;
  /** Where it stopped: 0 = middle of Rogers Dry Lake, 1 = lakebed edge */
  lakeDist?: number;
  flightTimeS: number;
}

export interface ScorePart {
  id: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface ScoreResult {
  total: number;
  grade: Grade;
  parts: ScorePart[];
  /** Crash penalty multiplier applied to the subtotal (1 = none) */
  multiplier: number;
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export const MAX_SCORE = 1000;
/** Tracking error at which the tracking score reaches zero, m */
export const TRACK_ZERO_M = 20_000;
export const CRASH_MULTIPLIER = 0.5;

const GRADES: [number, Grade][] = [[900, 'S'], [800, 'A'], [650, 'B'], [500, 'C'], [300, 'D'], [0, 'F']];

export const gradeFor = (total: number): Grade => GRADES.find(([min]) => total >= min)![1];

const clamp01 = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
/** 1 at or better than `good`, 0 at or worse than `bad`, linear between. */
const ramp = (v: number, good: number, bad: number) => clamp01((v - bad) / (good - bad));
const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function computeScore(s: ScoreInputs): ScoreResult {
  const altRatio = s.maxAltFt / ALT_RECORD_FT;
  const machRatio = s.maxMach / MACH_RECORD;
  const parts: ScorePart[] = [];

  // Performance (350): how close the flight came to the better of the two X-15 records.
  const perf = clamp01(Math.max(altRatio, machRatio));
  parts.push({
    id: 'performance', label: 'Performance', max: 350, points: Math.round(350 * perf),
    detail: altRatio >= machRatio ? `${fmt(s.maxAltFt)} ft · ${fmt(altRatio * 100)}% of record` : `Mach ${fmt(s.maxMach, 2)} · ${fmt(machRatio * 100)}% of record`,
  });

  // Records (100): 50 for each real X-15 mark matched.
  const matched = (altRatio >= 1 ? 1 : 0) + (machRatio >= 1 ? 1 : 0);
  parts.push({
    id: 'records', label: 'Records matched', max: 100, points: 50 * matched,
    detail: matched ? [altRatio >= 1 && 'altitude', machRatio >= 1 && 'speed'].filter(Boolean).join(' + ') : 'none',
  });

  // Profile tracking (200): RMS distance from the guide-box path.
  const track = ramp(s.trackingErrM, 0, TRACK_ZERO_M);
  parts.push({
    id: 'tracking', label: 'Profile tracking', max: 200, points: Math.round(200 * track),
    detail: `${s.trackingProfile} profile · ${fmt(s.trackingErrM / 1000, 1)} km RMS`,
  });

  // G discipline (50): full marks up to 5 g, nothing at 8 g.
  parts.push({
    id: 'g', label: 'G limits', max: 50, points: Math.round(50 * ramp(s.maxG, 5, 8)),
    detail: `peak ${fmt(s.maxG, 1)} g`,
  });

  // Landing (300)
  if (s.outcome === 'landed') {
    const sink = s.sinkFps ?? 99, kt = s.touchdownKt ?? 0, lake = s.lakeDist ?? 9;
    const sinkPts = Math.round(70 * ramp(sink, 5, 18));
    const speedPts = Math.round(50 * ramp(Math.abs(kt - 195), 0, 80));
    const spotPts = Math.round(60 * ramp(lake, 0.35, 1));
    parts.push({
      id: 'landing', label: 'Landing', max: 300, points: 120 + sinkPts + speedPts + spotPts,
      detail: `${fmt(sink, 1)} ft/s · ${fmt(kt)} kt · ${lake < 1 ? 'on the lakebed' : 'off the lakebed'}`,
    });
  } else {
    parts.push({ id: 'landing', label: 'Landing', max: 300, points: s.outcome === 'damaged' ? 40 : 0, detail: s.outcome === 'damaged' ? 'belly landing, aircraft damaged' : 'aircraft lost' });
  }

  const subtotal = parts.reduce((a, p) => a + p.points, 0);
  const multiplier = s.outcome === 'crashed' ? CRASH_MULTIPLIER : 1;
  const total = Math.round(subtotal * multiplier);
  return { total, grade: gradeFor(total), parts, multiplier };
}

/** Rejects stats no real flight in the sim can produce. Returns an error message or null. */
export function validateInputs(s: unknown): string | null {
  if (!s || typeof s !== 'object') return 'missing stats';
  const v = s as Record<string, unknown>;
  const num = (k: string, lo: number, hi: number, optional = false) => {
    const x = v[k];
    if (x === undefined && optional) return null;
    return typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? null : `bad ${k}`;
  };
  if (!['landed', 'damaged', 'crashed'].includes(v.outcome as string)) return 'bad outcome';
  if (!['altitude', 'speed'].includes(v.trackingProfile as string)) return 'bad trackingProfile';
  const landing = v.outcome === 'landed';
  return num('maxMach', 0, 7.5) ?? num('maxAltFt', 0, 460_000) ?? num('trackingErrM', 0, 1e7) ?? num('maxG', 0, 20) ??
    num('flightTimeS', 30, 7200) ?? num('sinkFps', 0, 100, !landing) ?? num('touchdownKt', 0, 600, !landing) ?? num('lakeDist', 0, 1000, !landing);
}
