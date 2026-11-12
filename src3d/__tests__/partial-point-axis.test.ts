/**
 * #276 (ADR-3D-094) — a NEW point stated on a coordinate axis becomes a free 1-DOF axis rider.
 *
 * Prod log (triage 2026-07-22): «הקודקוד D נמצא על החלק החיובי של ציר ה-x» refused
 * `symbolic-new-point` when D was NEW, while the identical statement about an EXISTING vertex
 * builds (partial pins + sign-given). The M1 dual (ADR-3D-015 on-plane / ADR-3D-031 on-line):
 * a NEW id stated with partially-known NUMERIC coordinates (nulls, no symbols) is CREATED as a
 * `partial` point — each null component a free sampled DOF, Lane-A absolute; a stated sign
 * selects the sample's sign so the requirement holds in every seed by construction.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { freeDofCount3 } from '../engine/evaluate';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);

beforeEach(reset);

describe('#276 — NEW point on a coordinate axis (partial point)', () => {
  it('the exact prod utterance builds: D rides the +x axis in EVERY seed', () => {
    submit('הקודקוד D נמצא על החלק החיובי של ציר ה-x');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2, 3, 5, 8]) {
      const d = derive3(state().facts, seed);
      for (const f of state().facts) expect(d.status[f.id], `seed ${seed}`).toBe('ok');
      const D = d.positions.get('D')!;
      expect(D.x, `seed ${seed}: strictly positive x`).toBeGreaterThan(1e-6);
      expect(Math.abs(D.y) + Math.abs(D.z), `seed ${seed}: on the axis`).toBeLessThan(1e-9);
    }
  });

  it('the negative side + another axis: «החלק השלילי של ציר ה-y»', () => {
    submit('הקודקוד E נמצא על החלק השלילי של ציר ה-y');
    for (const seed of [0, 1, 4]) {
      const d = derive3(state().facts, seed);
      const E = d.positions.get('E')!;
      expect(E.y, `seed ${seed}`).toBeLessThan(-1e-6);
      expect(Math.abs(E.x) + Math.abs(E.z)).toBeLessThan(1e-9);
    }
  });

  it('the English mirror parses and builds', () => {
    submit('D is on the positive part of the x-axis');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.positions.get('D')!.x).toBeGreaterThan(1e-6);
  });

  it('a SIGN-LESS axis membership stays a genuinely two-sided free DOF (both sides appear across seeds)', () => {
    submit('D על ציר ה-z');
    const signs = new Set<number>();
    for (let seed = 0; seed < 14; seed++) {
      const d = derive3(state().facts, seed);
      const D = d.positions.get('D')!;
      expect(Math.abs(D.x) + Math.abs(D.y)).toBeLessThan(1e-9);
      signs.add(Math.sign(D.z));
    }
    expect(signs.has(1) && signs.has(-1), 'an unstated side varies (ADR-052)').toBe(true);
  });

  it('the free axis coordinate is DOF-counted', () => {
    submit('הקודקוד D נמצא על החלק החיובי של ציר ה-x');
    const d = derived();
    expect(freeDofCount3(d.construction, d.resolved)).toBe(1);
  });

  it('the EXISTING-point lane is unchanged: a cube vertex on the +x axis drives the pivot pin', () => {
    submit("קובייה ABCDA'B'C'D'");
    submit('הקודקוד B נמצא על החלק החיובי של ציר ה-x');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const B = d.positions.get('B')!;
    expect(B.x).toBeGreaterThan(1e-6);
    expect(Math.abs(B.y) + Math.abs(B.z)).toBeLessThan(1e-6);
  });

  it('a partial point coexists with a solid figure (mixed lanes, no pivot degradation)', () => {
    submit("קובייה ABCDA'B'C'D'");
    submit('הקודקוד M נמצא על החלק החיובי של ציר ה-z');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.positions.get('M')!.z).toBeGreaterThan(1e-6);
  });

  it('a NEW point with SYMBOLIC components takes the coord-sym lane (one letter) or the letter pool (#2563, two letters)', () => {
    expect(parse3('M(k,1,3)').ok).toBe(true); // the ADR-3D-032 coord-sym lane
    submit('M(k,1,3)');
    expect(state().lastError).toBeNull();
    reset();
    submit('N(k,p,3)'); // #2563 (ADR-3D-489): two distinct letters build a sym-coord point (was the symbolic-new-point refusal)
    expect(state().lastError).toBeNull();
    expect(derive3(state().facts, 0).construction.points.get('N')?.kind).toBe('sym-coord');
  });
});

/**
 * #2798 (ADR-3D-456) — «M אמצע AP» beside an axis point is the midpoint at every seed. It is today only because the cube's
 * placement is not sampled here; #2789 samples it, and a mixed point (a vertex and an axis point) must then be re-derived
 * wherever the cube lands. These rows tie the two items together.
 */
describe('#2798 — a midpoint of a vertex and an axis point', () => {
  it.each([
    ['the positive half-axis, a cube', ["קובייה ABCDA'B'C'D'", 'P נמצא על החלק החיובי של ציר ה-x']],
    ['the whole axis, a cube', ["קובייה ABCDA'B'C'D'", 'P נמצא על ציר ה-x']],
    ['the whole axis, a box', ["תיבה ABCDA'B'C'D'", 'P נמצא על ציר ה-x']],
  ])('%s', (_n, lines) => {
    for (const l of [...lines, 'M אמצע AP']) {
      submit(l);
      expect(state().lastError, l).toBeNull();
    }
    for (let seed = 0; seed < 8; seed++) {
      const d = derive3(state().facts, seed);
      for (const f of state().facts) expect(d.status[f.id], `${f.utterance} @${seed}`).toBe('ok');
      const [A, P, M] = ['A', 'P', 'M'].map((id) => d.positions.get(id)!);
      expect(Math.hypot(M.x - (A.x + P.x) / 2, M.y - (A.y + P.y) / 2, M.z - (A.z + P.z) / 2), `seed ${seed}`).toBeLessThan(1e-9);
      expect(Math.abs(P.y) + Math.abs(P.z), `seed ${seed}: P on the x-axis`).toBeLessThan(1e-9);
    }
  });
});
