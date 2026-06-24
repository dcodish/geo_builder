/**
 * Coordinate-validation campaign tests (ADR-109).
 *
 * Three things are proven here:
 *  1. The harness PASSES a correct figure (oracle ≈ engine to ~machine precision).
 *  2. The harness CATCHES a wrong coordinate — perturbing the engine output is flagged. This is the
 *     load-bearing test: a differential checker that can't detect a discrepancy is worthless.
 *  3. The committed default corpus is the regression GATE — every generated figure must match the
 *     independent closed-form oracle. A failure here is a real engine bug (or an oracle bug), printed
 *     with the worst-diverging point so it can be localised.
 */
import { describe, it, expect } from 'vitest';
import { build, evaluate } from '@/engine';
import { generateCases, compareToConfigs, runCoordCampaign } from '../coordCampaign';

describe('coordinate-validation harness', () => {
  it('passes a correct figure (engine matches the oracle to machine precision)', () => {
    const tc = generateCases(1).find((c) => c.name.startsWith('midpoint'))!;
    const built = build(tc.commands);
    const e = evaluate(built.construction);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(compareToConfigs(e.positions, tc.configs).residual).toBeLessThan(1e-9);
  });

  it('CATCHES a wrong coordinate — a perturbed engine output is flagged', () => {
    const tc = generateCases(1).find((c) => c.name.startsWith('midpoint'))!;
    const built = build(tc.commands);
    const e = evaluate(built.construction);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    // pristine output matches…
    expect(compareToConfigs(e.positions, tc.configs).residual).toBeLessThan(1e-9);
    // …but nudging the derived point by 5 units is detected.
    const bad = new Map(e.positions);
    const m = bad.get('M')!;
    bad.set('M', { x: m.x + 5, y: m.y });
    const cmp = compareToConfigs(bad, tc.configs);
    expect(cmp.worstId).toBe('M');
    expect(cmp.residual).toBeGreaterThan(4.9);
  });

  it('CATCHES a missing point (engine never produced it)', () => {
    const tc = generateCases(1).find((c) => c.name.startsWith('midpoint'))!;
    const built = build(tc.commands);
    const e = evaluate(built.construction);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const bad = new Map(e.positions);
    bad.delete('M');
    expect(compareToConfigs(bad, tc.configs).residual).toBe(Infinity);
  });
});

describe('coordinate-validation campaign — every figure matches the closed-form oracle', () => {
  it('runs the committed corpus with zero coordinate mismatches', () => {
    const report = runCoordCampaign();
    expect(report.total).toBeGreaterThanOrEqual(150);
    if (report.failed > 0) {
      const lines = report.failures.slice(0, 25).map((f) => {
        const where = f.expected && f.got ? ` expected(${f.expected.x.toFixed(4)}, ${f.expected.y.toFixed(4)}) got(${f.got.x.toFixed(4)}, ${f.got.y.toFixed(4)})` : '';
        return `  ${f.name}: ${f.reason} residual=${Number.isFinite(f.residual) ? f.residual.toExponential(2) : '∞'} @${f.worstId}${where}${f.error ? ` error=${f.error}` : ''}`;
      });
      throw new Error(`${report.failed}/${report.total} coordinate mismatches (worst non-∞ residual ${report.worstResidual.toExponential(2)}):\n${lines.join('\n')}`);
    }
    expect(report.failed).toBe(0);
  });
});
