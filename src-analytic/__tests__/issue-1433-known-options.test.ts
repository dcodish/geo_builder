/**
 * #1433 — EVERY ASK ARM CONSULTS THE OPTION SET (ADR-AG-175).
 *
 * External review of prod: with two valid configurations, asking «C» said «cannot be computed»
 * while the panel beside it listed both options — a false sentence. #1227 fixed this false absence
 * for the locus question only; the point arm and every value arm still gated on `isKnowledge`
 * alone. The class fix: the panel's point decision is EXTRACTED (`app/pointText.ts`) and the ask
 * arm CALLS it (the #1102 rule — a lock that reproduces the decision tests only itself), and the
 * scalar/equation arms share one option gate (`scalarText` / the deduped equation set).
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { pointText } from '../app/pointText';
import { isKnowledge } from '../engine/evaluate';
import { derive } from '../engine/derive';

const fmt = (v: number) => `${Math.round(v * 100) / 100}`;
/** The reported figure (#1036's): C on a line with a stated triangle area — two valid positions. */
const FIGURE = ['A(4,0)', 'B(0,-2)', 'C נמצאת על הישר 4x-y-9=0', 'שטח המשולש ABC הוא 7'];

describe('#1433 — the reported figure answers its options', () => {
  const d = derive(FIGURE, 0);

  it('«C» answers BOTH positions, the drawn one marked — never «cannot be computed»', () => {
    const a = ask(d, 'C', fmt);
    expect(a.value).toBe('[(1, -5)] או (3, 3)');
  });

  it('the ask CALLS the panel’s decision — the two surfaces answer the same text', () => {
    const kx = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === 'C')?.x ?? null);
    const ky = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === 'C')?.y ?? null);
    expect(ask(d, 'C', fmt).value).toBe(pointText(d, 'C', kx, ky, fmt));
  });

  it('«AC» answers both lengths', () => {
    expect(ask(d, 'AC', fmt).value).toBe('3.16 או 5.83');
  });

  it('«משוואת הישר AC» answers both equations', () => {
    const v = ask(d, 'משוואת הישר AC', fmt).value;
    expect(v).toContain(' או ');
    expect(v).toContain('= 0');
  });
});

describe('#1433 — the gates that must NOT loosen', () => {
  it('an OPEN figure still answers open — a free point offers no invented set', () => {
    const d = derive(['A(4,0)', 'נקודה M'], 0);
    const a = ask(d, 'M', fmt);
    expect(a.value).toBeNull();
    expect(a.unreadable).toBeFalsy();
  });

  it('a determined figure still answers its single value with no «או»', () => {
    const d = derive(['A(0,0)', 'B(3,4)'], 0);
    expect(ask(d, 'AB', fmt).value).toBe('5');
    expect(ask(d, 'B', fmt).value).toBe('(3, 4)');
  });
});
