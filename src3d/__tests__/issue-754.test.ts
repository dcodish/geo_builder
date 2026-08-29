/**
 * #754 (ADR-3D-171) — a stated MAGNITUDE on a gauge-frozen solid pins the figure's SCALE.
 *
 * Operator (2026-08-19, playing round #752): «for |AB|=4 it refuses which is weird» — every
 * spelling of "this edge is 4" on a cube refused `size-on-solid`, while the same given on a
 * prism (through declared vectors) worked. Ruling (2026-08-26): *"I dont see any reason to
 * refuse this case… the shape might not change at all since the proportion of 1 or 4 are the
 * same."* And the sibling that surfaced playing round #799: «נפח הפירמידה ABCD = 11» — parsed,
 * resolved to the right solid, and still refused `claim-refuted`, i.e. a true given told the
 * student their arithmetic was wrong, judged against a size the tool itself invented.
 *
 * The mechanism under test: the magnitude acts on the SCALE, uniformly — one factor k per
 * configuration (length k, area k², volume k³) — and never on the shape DOFs, which stay free,
 * sampled, and cycling. The acceptance property a naive scalar-pin implementation silently
 * fails: the pyramid's volume holds EXACTLY at every seed while its proportions keep varying.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { scaleKnown3 } from '../engine/evaluate';
import { scaleGivenMagnitude } from '../engine/scaleGiven';
import { dist3 } from '../engine/vec3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const err = () => state().lastError;

const CUBE = "קובייה ABCDA'B'C'D'";

describe('#754 — a stated size on a cube builds and pins the scale', () => {
  beforeEach(reset);

  it('the operator sequence: «|AB| = 4» builds, and the edge IS 4 at every seed', () => {
    submit(CUBE);
    submit('|AB| = 4');
    expect(err()).toBeNull();
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      expect(Object.values(d.status).every((s) => s === 'ok'), `seed ${seed}: all facts ok`).toBe(true);
      const A = d.positions.get('A')!;
      const B = d.positions.get('B')!;
      expect(dist3(A, B), `seed ${seed}`).toBeCloseTo(4, 6);
      // the whole cube scaled uniformly — the space diagonal is 4√3, not a needle's
      const Cp = d.positions.get("C'")!;
      expect(dist3(A, Cp), `seed ${seed}`).toBeCloseTo(4 * Math.sqrt(3), 6);
    }
  });

  it('the four spellings agree: «AB = 4», «אורך AB = 4», and the vector route land the same edge', () => {
    for (const magnitude of ['AB = 4', 'אורך AB = 4']) {
      reset();
      submit(CUBE);
      submit(magnitude);
      expect(err(), magnitude).toBeNull();
      const d = derive3(state().facts, 0);
      expect(dist3(d.positions.get('A')!, d.positions.get('B')!), magnitude).toBeCloseTo(4, 6);
    }
    reset();
    submit(CUBE);
    submit('AB=u');
    submit('|u| = 4');
    expect(err(), 'the vector route').toBeNull();
    const d = derive3(state().facts, 0);
    expect(dist3(d.positions.get('A')!, d.positions.get('B')!), 'the vector route').toBeCloseTo(4, 6);
  });

  it('the scale becomes KNOWLEDGE: the data-panel gate opens with the given and not before (ADR-052)', () => {
    submit(CUBE);
    expect(scaleKnown3(derive3(state().facts, 0).construction), 'no stated size — unitless gauge').toBe(false);
    submit('|AB| = 4');
    expect(scaleKnown3(derive3(state().facts, 0).construction), 'stated size — real numbers may print').toBe(true);
  });

  it('a SECOND magnitude is checked, never silently accepted: «|AC| = 10» refuses, «|CD| = 4» agrees', () => {
    submit(CUBE);
    submit('|AB| = 4');
    submit('|AC| = 10'); // the face diagonal is 4√2 ≈ 5.657 — a contradiction
    expect(err()).toEqual({ code: 'claim-refuted' });
    expect(state().facts).toHaveLength(2); // keep-prior: the contradiction never lands on the figure
    submit('|CD| = 4'); // another edge of the same cube — consistent, verifies
    expect(err()).toBeNull();
    expect(state().facts).toHaveLength(3);
  });
});

describe('#754 — the volume sibling: «נפח הפירמידה» is a GIVEN, not an answer to grade', () => {
  beforeEach(reset);

  it('the operator sequence builds; the volume is EXACTLY 11 at every seed while proportions vary', () => {
    submit('פירמידה ישרה מרובעת ABCDS');
    submit('נפח הפירמידה ABCD = 11');
    expect(err()).toBeNull();
    const edges: number[] = [];
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      expect(Object.values(d.status).every((s) => s === 'ok'), `seed ${seed}: all facts ok`).toBe(true);
      const g = d.construction.scaleGivens[0];
      expect(g, `seed ${seed}: the magnitude was recorded as the scale given`).toBeDefined();
      expect(scaleGivenMagnitude(g, d.construction, d.positions), `seed ${seed}: drawn volume`).toBeCloseTo(11, 6);
      edges.push(dist3(d.positions.get('A')!, d.positions.get('B')!));
    }
    // the shape DOFs stayed FREE: the base edge varies across configurations (a scalar-pin
    // implementation that reshapes the pyramid to meet the volume fails exactly this)
    expect(Math.max(...edges) - Math.min(...edges)).toBeGreaterThan(1e-3);
    // and the size is knowledge now
    expect(scaleKnown3(derive3(state().facts, 0).construction)).toBe(true);
  });

  it('a later size against still-free dims refuses honestly instead of accusing the student', () => {
    submit('פירמידה ישרה מרובעת ABCDS');
    submit('נפח הפירמידה ABCD = 11');
    submit('|AB| = 4'); // satisfiable, but pinning a shape dim is not built — refuse, never refute
    expect(err()).toEqual({ code: 'size-on-solid' });
  });
});

describe('#754 — the prism vector route stays byte-identical', () => {
  beforeEach(reset);

  it('declared-vector magnitudes still drive through the pivot, not the rescale', () => {
    for (const u of ['מנסרה ישרה משולשת ABC', 'זוית CAB=90', 'AB=u', 'AC=v', "AA'=w", '|u|=3', '|v|=4']) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    const d = derive3(state().facts, 0);
    expect(d.construction.scaleGivens, 'the pivot owns this figure — no scale given minted').toHaveLength(0);
    expect(dist3(d.positions.get('A')!, d.positions.get('B')!)).toBeCloseTo(3, 4);
    expect(dist3(d.positions.get('A')!, d.positions.get('C')!)).toBeCloseTo(4, 4);
  });
});
