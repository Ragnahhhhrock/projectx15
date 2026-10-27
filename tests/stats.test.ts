// Logbook stats: crash reasons from the sim sort into the right type, and outcomes tally.
import { describe, expect, it } from 'vitest';
import { crashType, emptyStats, record } from '../src/ui/stats';

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

describe('tally', () => {
  it('counts landings, belly landings and crashes by type', () => {
    let s = emptyStats();
    s = record(s, { kind: 'landed' });
    s = record(s, { kind: 'belly' });
    s = record(s, { kind: 'crash', type: 'hard_landing' });
    s = record(s, { kind: 'crash', type: 'hard_landing' });
    s = record(s, { kind: 'crash', type: 'structural' });
    expect(s).toMatchObject({ landings: 1, bellyLandings: 1, crashes: 3, crashTypes: { hard_landing: 2, structural: 1 } });
  });
});
