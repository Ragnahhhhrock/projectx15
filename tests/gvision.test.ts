import { describe, expect, it } from 'vitest';
import { GTolerance } from '../src/ui/gvision';

const hold = (g: number, secs: number, m = new GTolerance()) => {
  for (let i = 0; i < secs * 20; i++) m.update(g, 0.05);
  return m;
};

describe('g tolerance', () => {
  it('is clear at normal loads', () => {
    const m = hold(3, 30);
    expect(m.greyout).toBe(0);
    expect(m.label).toBeNull();
  });
  it('tolerates a brief spike', () => {
    expect(hold(8, 0.5).blackout).toBe(0);
  });
  it('greys out under sustained high g', () => {
    const m = hold(6, 10);
    expect(m.greyout).toBeGreaterThan(0.8);
    expect(m.label).toBe('GREYOUT');
  });
  it('blacks out under extreme sustained g and recovers', () => {
    const m = hold(9, 12);
    expect(m.label).toBe('BLACKOUT');
    hold(1, 10, m);
    expect(m.greyout).toBe(0);
  });
});
