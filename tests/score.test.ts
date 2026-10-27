import { describe, expect, it } from 'vitest';
import { computeScore, gradeFor, validateInputs, type ScoreInputs } from '../src/scoring/score';
import { FlightTracker } from '../src/scoring/tracker';
import { sortEntries, entryFromStats, cleanName } from '../src/scoring/leaderboard';
import { fly } from './fly';
import { controls, holdGamma, holdPitch } from '../src/physics/autopilot';

const deg = Math.PI / 180;
const base: ScoreInputs = {
  maxMach: 6.1, maxAltFt: 355_000, trackingErrM: 0, trackingProfile: 'altitude', maxG: 4, outcome: 'landed',
  sinkFps: 4, touchdownKt: 195, lakeDist: 0.1, flightTimeS: 600,
};

describe('scoring', () => {
  it('a perfect flight scores 1000 (S)', () => {
    const r = computeScore(base);
    expect(r.total).toBe(1000);
    expect(r.grade).toBe('S');
  });
  it('parts add up to the total', () => {
    const r = computeScore({ ...base, maxAltFt: 200_000, maxMach: 3, trackingErrM: 8000, maxG: 6.5, sinkFps: 12, touchdownKt: 230, lakeDist: 0.8 });
    expect(r.parts.reduce((a, p) => a + p.points, 0)).toBe(r.total);
    expect(r.total).toBeLessThan(800);
  });
  it('a crash halves the score and a belly landing loses most landing points', () => {
    const landed = computeScore({ ...base, maxAltFt: 300_000 }).total;
    expect(computeScore({ ...base, maxAltFt: 300_000, outcome: 'crashed' }).total).toBeLessThan(landed * 0.6);
    expect(computeScore({ ...base, maxAltFt: 300_000, outcome: 'damaged' }).total).toBeLessThan(landed - 200);
  });
  it('grades by threshold', () => {
    expect([950, 850, 700, 520, 350, 10].map(gradeFor)).toEqual(['S', 'A', 'B', 'C', 'D', 'F']);
  });
  it('rejects impossible stats', () => {
    expect(validateInputs(base)).toBeNull();
    expect(validateInputs({ ...base, maxMach: 12 })).toBe('bad maxMach');
    expect(validateInputs({ ...base, outcome: 'won' })).toBe('bad outcome');
    expect(validateInputs({ ...base, sinkFps: undefined })).toBe('bad sinkFps');
    expect(validateInputs(null)).toBe('missing stats');
  });
});

describe('leaderboard', () => {
  it('keeps the best ten, highest first', () => {
    const e = Array.from({ length: 14 }, (_, i) => entryFromStats(`p${i}`, { ...base, maxMach: 1, maxAltFt: 20_000 * (i + 1) }, i));
    const top = sortEntries(e);
    expect(top).toHaveLength(10);
    expect(top[0].score).toBeGreaterThanOrEqual(top[9].score);
    expect(top[0].name).toBe('p13');
  });
  it('cleans names', () => {
    expect(cleanName('  <b>Chuck Yeager</b>!! ')).toBe('bChuck Yeagerb');
    expect(cleanName('')).toBe('');
  });
});

describe('flight tracker (full headless flights)', () => {
  it('speed profile flight tracks the speed guide closely', () => {
    let level = false;
    const stop = (t: { engine: string; t: number }) => t.engine === 'burnout' && t.t > 90;
    const tr = new FlightTracker();
    const log = fly((t) => { if (t.altitude > 25000) level = true; return controls(level ? holdGamma(t, 3 * deg) : holdPitch(t, 25 * deg), t); }, stop);
    for (const s of log.samples) tr.update(s);
    // Force an end frame to read the stats
    const last = { ...log.sim.telemetry(), landed: true, damaged: false, touchdown: { t: 0, speed: 100, sink: 1, position: log.sim.telemetry().position } } as never;
    const r = tr.update(last)!;
    expect(r).not.toBeNull();
    expect(r.trackingProfile).toBe('speed');
    expect(r.trackingErrM).toBeLessThan(3000);
    expect(r.maxMach).toBeGreaterThan(5);
  });
});
