/**
 * #2486 (ADR-AG-331) — analytic reads an arc's three letters with 2-D's ONE reader (`shell/arcRun.ts`): the MIDDLE
 * letter is the centre (operator ruling 2026-10-24, e8 A), or an O-family letter written first. Before, analytic's
 * quarter read the FIRST letter and its sector read the middle with no O-family exception («גזרה OAB» had centre A,
 * where 2-D draws O) — a divergence under R163 ("analytic's arcs build as 2-D's").
 *
 * Calls the real path: `decideSubmit` for the verdict, `derive` for the figure; asserts the arc's circle centre, the
 * equal radii and the quarter's 90° at several seeds.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { arcRunRoles } from '../../shell/arcRun';

const SEEDS = [0, 1, 2];

function centreOf(lines: readonly string[]): string {
  const kept: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, kept, 0);
    expect(v.kind, `«${line}»: ${JSON.stringify(v)}`).toBe('record');
    if (v.kind === 'record') kept.push(v.line);
  }
  const d = derive(kept, 0);
  const objs = d.construction.objects as unknown as readonly { kind: string; id: string; centre?: string; def?: { circle?: string } }[];
  const arc = objs.find((o) => o.kind === 'arc');
  expect(arc, 'an arc is drawn').toBeDefined();
  const circle = objs.find((o) => o.id === arc!.def?.circle);
  expect(circle?.centre, 'the arc is cut from a circle with a named centre').toBeDefined();
  return circle!.centre!;
}

describe('#2486 — analytic: the centre is arcRunRoles(run).centre, as in 2-D', () => {
  const RUNS = ['AOB', 'OAB', 'ABO', 'ABC', 'DCE', 'APB', 'POA'];
  for (const run of RUNS)
    for (const noun of ['רבע מעגל', 'גזרה', 'quarter circle', 'sector'])
      it(`«${noun} ${run}» → centre ${arcRunRoles(run.split('')).centre}`, () => {
        expect(centreOf([`${noun} ${run}`])).toBe(arcRunRoles(run.split('')).centre);
      });

  it('«גזרה OAB» has centre O (it was A before #2486), as 2-D draws it', () => {
    expect(centreOf(['גזרה OAB'])).toBe('O');
  });

  it('points placed first do not change the reading: A(0,0) · B(4,0) · «רבע מעגל AOB» → centre O', () => {
    expect(centreOf(['A(0,0)', 'B(4,0)', 'רבע מעגל AOB'])).toBe('O');
  });

  it('«רבע מעגל AOB» is a quarter about O: |OA| = |OB| and ∠AOB = 90° at every seed', () => {
    for (const seed of SEEDS) {
      const d = derive(['רבע מעגל AOB'], seed);
      expect(d.faults).toEqual([]);
      const at = (id: string) => d.figure.points.find((p) => p.id === id)!;
      const [O, A, B] = [at('O'), at('A'), at('B')];
      expect(Math.hypot(A.x - O.x, A.y - O.y)).toBeCloseTo(Math.hypot(B.x - O.x, B.y - O.y), 6);
      const dot = (A.x - O.x) * (B.x - O.x) + (A.y - O.y) * (B.y - O.y);
      expect(Math.abs(dot)).toBeLessThan(1e-6);
    }
  });
});
