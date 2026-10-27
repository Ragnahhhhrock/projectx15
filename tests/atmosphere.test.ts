import { describe, expect, it } from 'vitest';
import { atmosphere, gravity } from '../src/physics/atmosphere';

describe('US Standard Atmosphere 1976', () => {
  it('matches sea-level values', () => {
    const a = atmosphere(0);
    expect(a.T).toBeCloseTo(288.15, 2);
    expect(a.p).toBeCloseTo(101325, 0);
    expect(a.rho).toBeCloseTo(1.225, 3);
    expect(a.a).toBeCloseTo(340.29, 1);
  });

  it('matches published values at altitude', () => {
    // Geometric altitude, published T (K) and rho (kg/m³)
    const table: [number, number, number][] = [
      [11000, 216.77, 0.36480],
      [13716, 216.65, 0.2383], // 45,000 ft drop altitude
      [20000, 216.65, 0.08891],
      [32000, 228.49, 0.013555],
      [50000, 270.65, 0.0010269],
      [80000, 198.64, 1.846e-5],
    ];
    for (const [z, T, rho] of table) {
      const a = atmosphere(z);
      expect(a.T).toBeCloseTo(T, 0);
      expect(a.rho / rho).toBeGreaterThan(0.99);
      expect(a.rho / rho).toBeLessThan(1.01);
    }
  });

  it('decays smoothly above 86 km', () => {
    expect(atmosphere(86001).rho / atmosphere(85999).rho).toBeGreaterThan(0.99);
    const r100 = atmosphere(100000).rho;
    expect(r100).toBeGreaterThan(4e-7);
    expect(r100).toBeLessThan(7e-7);
  });

  it('weakens gravity with altitude', () => {
    expect(gravity(0)).toBeCloseTo(9.80665, 5);
    expect(gravity(100000)).toBeCloseTo(9.505, 2);
  });
});
