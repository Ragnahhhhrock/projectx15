// Collective stats: crash reasons sort into types, and counter rows roll up into totals.
import { describe, expect, it } from 'vitest';
import { counterFor, crashType } from '../src/ui/stats';
import { isCounter, totalsFrom } from '../src/stats-shared';

const c = (crashReason: string, brokeUp = false) => crashType({ crashReason, brokeUp });

describe('crash types', () => {
  it('sort the sim crash reasons', () => {
    expect(c('structural failure: 8.2 g', true)).toBe('structural');
    expect(c('structural failure: dynamic pressure 2600 psf', true)).toBe('structural');
    expect(c('nose gear collapsed: hard landing at 3.1 m/s sink')).toBe('hard_landing');
    expect(c('left skid sheared off: touched down sideways')).toBe('sideways');
    expect(c('nose gear hit sloping terrain')).toBe('off_lakebed');
    expect(c('ventral fin strike: jettison it before landing')).toBe('ventral');
    expect(c('forward belly impact with the gear up')).toBe('gear_up');
    expect(c('left wing struck the ground')).toBe('ground_impact');
  });
});

describe('counters', () => {
  it('map outcomes to server counters the API accepts', () => {
    expect(counterFor({ kind: 'landed' })).toBe('landings');
    expect(counterFor({ kind: 'belly' })).toBe('belly_landings');
    expect(counterFor({ kind: 'crash', type: 'hard_landing' })).toBe('crash:hard_landing');
    expect(isCounter(counterFor({ kind: 'crash', type: 'off_lakebed' }))).toBe(true);
    expect(isCounter('crash:made_up')).toBe(false);
    expect(isCounter('DROP TABLE stats')).toBe(false);
  });

  it('roll up rows into totals', () => {
    const t = totalsFrom([
      { key: 'flights', n: 10 },
      { key: 'landings', n: 4 },
      { key: 'belly_landings', n: 1 },
      { key: 'crash:hard_landing', n: 3 },
      { key: 'crash:structural', n: 2 },
      { key: 'junk', n: 99 },
    ]);
    expect(t).toEqual({ flights: 10, landings: 4, bellyLandings: 1, crashes: 5, crashTypes: { hard_landing: 3, structural: 2 } });
  });
});
