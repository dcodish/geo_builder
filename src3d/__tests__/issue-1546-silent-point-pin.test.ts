/**
 * #1546 (ADR-3D-282) — a coordinate restated on an EXISTING point is a given the tool must honour or
 * refuse, never a green row over a figure that contradicts it.
 *
 * The creation spelling «B(3,7,8)» on an existing id lowers to a pivot PIN. A pin acts only where the
 * pivot owns something that moves the point (a solid's gauge and dims, a pin symbol); on a coordinate,
 * coord-sym or derived point nothing moves, and no claim was recorded — so the false statement read
 * green and B stayed where it was. The fix records a `coords-eq` claim beside the pin (the ADR-3D-030
 * "pin drives, claim arbitrates" pattern); a component left unstated or symbolic is `null` and unchecked.
 *
 * Every assertion goes through `decideSubmit3`, the real submit decision.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { claimSeeds } from '../engine/claims';

type St = { facts: Fact3[]; seed: number };

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`setup line «${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}

const pos = (st: St, id: string, seed: number) => {
  const p = derive3(st.facts, seed).positions.get(id);
  if (!p) throw new Error(`no ${id}`);
  return [p.x, p.y, p.z];
};

const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

describe('#1546 — the reported table, through the real submit decision', () => {
  const refuses: [string, string[], string, string][] = [
    ['a coordinate point restated with a different x', ['B(0,7,8)'], 'B(3,7,8)', 'B'],
    ['a coordinate point, x stated and y/z symbolic', ['B(0,7,8)'], 'B(3, n, p)', 'B'],
    ['a coord-sym point, x stated', ['B(1, t, 2)'], 'B(3, n, p)', 'B'],
    ['a midpoint restated off its place', ['A(0,0,0)', 'C(2,0,0)', 'M אמצע AC'], 'M(3, n, p)', 'M'],
  ];
  for (const [title, setup, line, id] of refuses) {
    it(`${title}: «${line}» is refused (claim-refuted) and the figure is unchanged`, () => {
      const st = build(setup);
      const before = claimSeeds(0).map((s) => pos(st, id, s));
      const v = decideSubmit3(st, line);
      expect(v.kind).toBe('refused');
      if (v.kind === 'refused') expect(v.error.code).toBe('claim-refuted');
      // keep-prior: the refusal commits nothing, so the figure the student sees is the one before
      expect(claimSeeds(0).map((s) => pos(st, id, s))).toEqual(before);
    });
  }

  it('the claim spelling «B = (3,7,8)» still refuses the same way (unchanged)', () => {
    const v = decideSubmit3(build(['B(0,7,8)']), 'B = (3, 7, 8)');
    expect(v.kind === 'refused' && v.error.code).toBe('claim-refuted');
  });

  it('a TRUE restatement stays green: «B(0, n, p)» on B(0,7,8)', () => {
    const v = decideSubmit3(build(['B(0,7,8)']), 'B(0, n, p)');
    expect(v.kind).toBe('record');
    if (v.kind === 'record') expect(derive3(v.facts, v.seed).status[v.fact.id]).toBe('ok');
  });

  it('a TRUE full restatement stays green: «B(0,7,8)» twice reads as already stated or ok, never refused', () => {
    const v = decideSubmit3(build(['B(0,7,8)']), 'B(0,7,8)');
    expect(v.kind).not.toBe('refused');
  });

  it('the solid lane is unchanged: on a cube «B(3, n, p)» MOVES the cube so B.x = 3', () => {
    const v = decideSubmit3(build(["קובייה ABCDA'B'C'D'"]), 'B(3, n, p)');
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    expect(derive3(v.facts, v.seed).status[v.fact.id]).toBe('ok');
    for (const s of claimSeeds(v.seed)) expect(pos({ facts: v.facts, seed: s }, 'B', s)[0]).toBeCloseTo(3, 6);
  });

  it('the solid lane is unchanged: a cube pinned by A and B refuses «B(3, n, p)» as injection-unsatisfiable', () => {
    const v = decideSubmit3(build(["קובייה ABCDA'B'C'D'", 'A(0,0,0)', 'B(2,0,0)']), 'B(3, n, p)');
    expect(v.kind === 'refused' && v.error.code).toBe('injection-unsatisfiable');
  });
});

/**
 * The CLASS walk: for every point kind the construction can hold, a false numeric restatement is
 * either refused, or moves the point onto the stated value. It is never green-and-unmoved.
 */
describe('#1546 — class walk over point kinds: refused or moved, never green-and-unmoved', () => {
  const kinds: { kind: string; setup: string[]; id: string; line: string; axis: 0 | 1 | 2; value: number }[] = [
    { kind: 'coord', setup: ['B(0,7,8)'], id: 'B', line: 'B(3,7,8)', axis: 0, value: 3 },
    { kind: 'coord-sym', setup: ['B(1, t, 2)'], id: 'B', line: 'B(n, p, 5)', axis: 2, value: 5 },
    { kind: 'partial (on an axis)', setup: ['הקודקוד D נמצא על החלק החיובי של ציר ה-x'], id: 'D', line: 'D(n, 5, p)', axis: 1, value: 5 },
    { kind: 'derived (midpoint)', setup: ['A(0,0,0)', 'C(2,0,0)', 'M אמצע AC'], id: 'M', line: 'M(n, p, 4)', axis: 2, value: 4 },
    { kind: 'solid vertex', setup: ["קובייה ABCDA'B'C'D'"], id: 'B', line: 'B(3, n, p)', axis: 0, value: 3 },
    { kind: 'plane rider', setup: ['המישור π1: z - 3 = 0', 'P על המישור π1'], id: 'P', line: 'P(n, p, 5)', axis: 2, value: 5 },
    { kind: 'line rider', setup: ['הישר l1: x = (0,0,0) + t(1,0,0)', 'P על הישר l1'], id: 'P', line: 'P(n, 5, p)', axis: 1, value: 5 },
    // SATISFIABLE restatements on a free carrier DOF: the drive may honour them or the claim refuse them —
    // never green over a figure that ignores them (a solid-free drive is a separate capability, ADR-3D-282)
    { kind: 'partial, satisfiable', setup: ['הקודקוד D נמצא על החלק החיובי של ציר ה-x'], id: 'D', line: 'D(3, 0, 0)', axis: 0, value: 3 },
    { kind: 'line rider, satisfiable', setup: ['הישר l1: x = (0,0,0) + t(1,0,0)', 'P על הישר l1'], id: 'P', line: 'P(3, n, p)', axis: 0, value: 3 },
    { kind: 'segment rider, satisfiable', setup: ['A(0,0,0)', 'B(4,0,0)', 'K על AB'], id: 'K', line: 'K(1, 0, 0)', axis: 0, value: 1 },
    { kind: 'segment rider on a solid', setup: ["קובייה ABCDA'B'C'D'", 'K על AB'], id: 'K', line: 'K(n, p, 0.5)', axis: 2, value: 0.5 },
    { kind: 'coord-sym, satisfiable', setup: ['B(1, t, 2)'], id: 'B', line: 'B(n, 4, p)', axis: 1, value: 4 },
  ];
  for (const k of kinds) {
    it(`${k.kind}: «${k.line}»`, () => {
      const st = build(k.setup);
      const v = decideSubmit3(st, k.line);
      expect(v.kind).not.toBe('not-understood');
      if (v.kind === 'refused') return; // honest
      expect(v.kind).toBe('record');
      if (v.kind !== 'record') return;
      const d = derive3(v.facts, v.seed);
      if (d.status[v.fact.id] !== 'ok') return; // a red row is honest too
      // green ⇒ the point sits on the stated value at every verification seed
      for (const s of claimSeeds(v.seed)) {
        const p = pos({ facts: v.facts, seed: s }, k.id, s);
        expect(close([p[k.axis]], [k.value]), `${k.kind} green but ${k.id}=${p}`).toBe(true);
      }
    });
  }
});

