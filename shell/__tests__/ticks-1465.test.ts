/**
 * #1465 (ADR-W-094) — the ONE nice-step rule (docs/28 §5c): analytic and complex both grid through
 * `shell/ticks`, and no product tree keeps a copy of its own.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tickStep, tickValues } from '../ticks';

describe('#1465 — the shared nice step', () => {
  it('1, 2 or 5 × 10ⁿ', () => {
    expect(tickStep(10)).toBe(1);
    expect(tickStep(25)).toBe(2);
    expect(tickStep(50)).toBe(5);
    expect(tickStep(0.4)).toBeCloseTo(0.05, 12);
  });

  it('tick values skip zero and carry no binary noise', () => {
    expect(tickValues(-0.35, 0.35, 0.1)).toEqual([-0.3, -0.2, -0.1, 0.1, 0.2, 0.3]);
    expect(tickValues(-2, 2, 1)).toEqual([-2, -1, 1, 2]);
  });

  it('no product tree keeps its own 1/2/5 step rule', () => {
    const root = path.resolve(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = path.join(dir, n);
        if (n === 'node_modules' || n === '__tests__') continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n) && /(?:function|const)\s+(?:tickStep|niceStep)\b/.test(readFileSync(p, 'utf8'))) offenders.push(path.relative(root, p));
      }
    };
    for (const tree of ['src', 'src3d', 'src-complex', 'src-analytic']) walk(path.join(root, tree));
    expect(offenders).toEqual([]);
  });
});
