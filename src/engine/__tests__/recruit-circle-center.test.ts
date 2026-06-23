import { describe, it, expect } from 'vitest';
import { applyStep, evaluate, emptyConstruction } from '@/engine';
import type { Command, Construction } from '@/engine';

/**
 * A constraint may need to move a circle's CENTRE, not only resize it (ADR-103).
 *
 * Operator session (bagrut Q4): two circles meet at A,B; C on circle P; D = CA extended onto circle O;
 * then a distance/relation that needs the figure to GROW (|CD| = 36, and ultimately CE⟂AB with CD=36,
 * DE=18). It failed "over-constrained: |CD| = 36 cannot hold". Root cause: recruitFreeDofs surfaced a
 * circle's free RADIUS (ADR-051) but NOT its free CENTRE — and `ancestors` doesn't traverse a
 * circle∩circle point, so the centres O,P were unreachable. With the centres pinned a fixed gap apart,
 * growing the radii alone CAPS |CD| (≈8 here — the circle∩circle geometry is bounded by the centre gap),
 * so |CD| = 36 was genuinely unreachable for the solver though a real configuration exists (the centres
 * just need to spread). Fix: surface a circle's free, non-pinned centre as a drivable DOF alongside its
 * radius, so a constraint on a point that rides the circle can drive the centre too.
 */
function build(cmds: Command[]): Construction {
  let c = emptyConstruction();
  for (const cmd of cmds) {
    const r = applyStep(c, cmd);
    expect(r.ok, `build step ${cmd.type}: ${r.ok ? '' : (r as { error: string }).error}`).toBe(true);
    if (r.ok) c = r.construction;
  }
  return c;
}

const twoCirclesCD: Command[] = [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
  { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, autoCenter: true },
  { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
  { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1, avoid: 'A' },
  { type: 'point-on-circle', id: 'C', circle: 'circle-P' },
  { type: 'extend-onto-circle', id: 'D', a: 'C', b: 'A', circle: 'circle-O' },
] as Command[];

describe('a constraint drives a circle CENTRE, not only its radius (ADR-103)', () => {
  it('|CD| = 36 across two intersecting circles spreads the centres so it holds (was over-constrained)', () => {
    const c = build(twoCirclesCD);
    // Sanity: at the default the figure is small — |CD| ≈ 8, far below 36 (radii alone can't reach it).
    const before = evaluate(c);
    expect(before.ok).toBe(true);
    const r = applyStep(c, { type: 'set-distance', a: 'C', b: 'D', value: 36 } as Command);
    expect(r.ok, r.ok ? '' : (r as { error: string }).error).toBe(true);
    if (!r.ok) return;
    const e = evaluate(r.construction);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const C = e.positions.get('C')!, D = e.positions.get('D')!;
    expect(Math.hypot(C.x - D.x, C.y - D.y)).toBeCloseTo(36, 1);
    // The centres actually moved apart (the DOF that made it possible) — gap grew well beyond the seed 4.
    const O = e.positions.get('O')!, P = e.positions.get('P')!;
    expect(Math.hypot(O.x - P.x, O.y - P.y)).toBeGreaterThan(8);
  });

  it('the full bagrut-Q4 given set builds: ∠GEC=∠CHA, CD=36, DE=18, CE⟂AB (sizes before ⟂)', () => {
    const figure = build([
      ...twoCirclesCD,
      { type: 'extend-onto-circle', id: 'E', a: 'C', b: 'B', circle: 'circle-O' },
      { type: 'point-on-segment', id: 'G', a: 'D', b: 'E', t: 1.3, extension: true },
      { type: 'line-through', id: 'chord-CG', a: 'C', b: 'G' },
      { type: 'line-circle-intersection', id: 'F', line: 'chord-CG', circle: 'circle-P', avoid: 'C' },
      { type: 'line-line-intersection', id: 'H', a: 'A', b: 'F', c: 'B', d: 'C' },
      { type: 'set-angle-ratio', v1: 'E', a1: 'G', b1: 'C', v2: 'H', a2: 'C', b2: 'A', k: 1 },
      { type: 'set-distance', a: 'C', b: 'D', value: 36 },
      { type: 'set-distance', a: 'D', b: 'E', value: 18 },
      { type: 'set-perpendicular', a: 'C', b: 'E', c: 'A', d: 'B' },
    ] as Command[]);
    const e = evaluate(figure);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const C = e.positions.get('C')!, D = e.positions.get('D')!, E = e.positions.get('E')!, A = e.positions.get('A')!, B = e.positions.get('B')!;
    expect(Math.hypot(C.x - D.x, C.y - D.y)).toBeCloseTo(36, 0); // |CD| = 36
    expect(Math.hypot(D.x - E.x, D.y - E.y)).toBeCloseTo(18, 0); // |DE| = 18
    const dot = (E.x - C.x) * (B.x - A.x) + (E.y - C.y) * (B.y - A.y);
    expect(Math.abs(dot) / (Math.hypot(E.x - C.x, E.y - C.y) * Math.hypot(B.x - A.x, B.y - A.y))).toBeLessThan(0.02); // CE ⟂ AB
  });
});
