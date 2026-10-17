/**
 * #2215 ([ADR-723](../../../docs/06-decisions.md#adr-723)) — A TANGENT'S NAMED ENDPOINTS RIDE ITS LINE: a later
 * chord on both of them builds in either entry order, and moves the touch point, not the circles.
 *
 * Measured at 688dfb96 through `decideDeterministic2D` + the store, model mocked (0 calls), prefix «מעגל O» · «מעגל P»:
 *   «AB משיק למעגל P» · «AB מיתר במעגל O»          → refused «…סותר את «AB משיק למעגל P»… |OB| = |OA|»
 *   the same in English, «הקטע AB הוא מיתר…», «A/B על מעגל O», «CD משיק…» + C, D, a tangent at a named C → refused
 *   the reverse order «AB מיתר במעגל O» · «AB משיק למעגל P» → builds, 24/24 seeds
 *
 * Root cause: the drivable-ancestor walker (`step.ts` `ancestors`) dead-ended at an on-line marker (no
 * `pointParents` case), so the second membership could move only the markers' offsets — whose ±5 seeds fix an
 * unstated |AB| = 10 and centre AB on the touch point — and the recruiter found no carrier. Fix: the walk hops a
 * marker to its line's definition (a tangent's touch point), and lists a free on-circle point's own angle before
 * the circle it rides (nearest first), so the touch point turns and both circles stay where the student saw them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { meetsRequirements } from '@/replay/core';
import type { Vec } from '@/engine';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** Every line through the real decide → commit path; returns each line's verdict kind. */
async function submit(lines: string[], locale: 'he' | 'en' = 'he'): Promise<string[]> {
  useGeoStore.getState().clear();
  const kinds: string[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, locale);
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
    }
    kinds.push(v.kind);
  }
  return kinds;
}

const dist = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
/** The distance from `c` to the line through `a`, `b`. */
const lineDist = (c: Vec, a: Vec, b: Vec) => Math.abs((b.x - a.x) * (a.y - c.y) - (a.x - c.x) * (b.y - a.y)) / dist(a, b);

/** The figure at `seed`: both endpoints on O, the line touching P, the chord not collapsed. */
function chordTouchingP(seed: number, [a, b]: [string, string] = ['A', 'B']): boolean {
  const st = useGeoStore.getState();
  const d = replay(st.facts, seed);
  if (d.lastError || d.violations.length) return false;
  const A = d.positions.get(a), B = d.positions.get(b);
  const O = d.circles.get('circle-O'), P = d.circles.get('circle-P');
  if (!A || !B || !O || !P) return false;
  const tol = 1e-4 * Math.max(1, O.r, P.r);
  return (
    Math.abs(dist(A, O.center) - O.r) < tol &&
    Math.abs(dist(B, O.center) - O.r) < tol &&
    Math.abs(lineDist(P.center, A, B) - P.r) < tol &&
    dist(A, B) > 0.05
  );
}

const PRE = ['מעגל O', 'מעגל P'];

describe('#2215 — a chord after a tangent builds as in the reverse order (entry-order independence)', () => {
  // [name, lines, locale, raw-seed floor (measured), pair]. The vetted view (`meetsRequirements`) shows only
  // whole seeds, and every seed it shows must be the figure; the floor is the 24-seed whole rate measured at
  // the fix (docs/17 §9), the reverse order's being 24.
  const members: [string, string[], 'he' | 'en', number, [string, string]?][] = [
    ['the report: «AB משיק» · «AB מיתר»', [...PRE, 'AB משיק למעגל P', 'AB מיתר במעגל O'], 'he', 24],
    ['English', ['circle O', 'circle P', 'AB is tangent to circle P', 'AB is a chord of circle O'], 'en', 24],
    ['«הקטע AB הוא מיתר»', [...PRE, 'AB משיק למעגל P', 'הקטע AB הוא מיתר במעגל O'], 'he', 24],
    ['two memberships', [...PRE, 'AB משיק למעגל P', 'A על מעגל O', 'B על מעגל O'], 'he', 24],
    ['other letters', [...PRE, 'CD משיק למעגל P', 'C על מעגל O', 'D על מעגל O'], 'he', 22, ['C', 'D']],
    ['a tangent at a named touch point', [...PRE, 'AB משיק למעגל P בנקודה C', 'AB מיתר במעגל O'], 'he', 24],
    ['reverse order (the reference)', [...PRE, 'AB מיתר במעגל O', 'AB משיק למעגל P'], 'he', 24],
    ['the chord before the tangent, by memberships', [...PRE, 'A על מעגל O', 'B על מעגל O', 'AB משיק למעגל P'], 'he', 24],
  ];
  for (const [name, lines, locale, floor, pair] of members) {
    it(`${name}: every line commits; every shown seed, and at least ${floor} of 24 raw seeds, draw a chord of O touching P`, async () => {
      expect(await submit(lines, locale)).toEqual(lines.map(() => 'commit'));
      let whole = 0;
      for (let seed = 0; seed < 24; seed++) {
        const ok = chordTouchingP(seed, pair);
        if (ok) whole++;
        if (meetsRequirements(useGeoStore.getState().facts, seed)) expect(ok, `seed ${seed} is shown`).toBe(true);
      }
      expect(whole).toBeGreaterThanOrEqual(floor);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('stability: the chord line leaves both circles where the student saw them (it turns the touch point)', async () => {
    await submit([...PRE, 'AB משיק למעגל P']);
    const before = replay(useGeoStore.getState().facts, 0);
    await submit([...PRE, 'AB משיק למעגל P', 'AB מיתר במעגל O']);
    const after = replay(useGeoStore.getState().facts, 0);
    for (const c of ['circle-O', 'circle-P']) {
      expect(dist(after.circles.get(c)!.center, before.circles.get(c)!.center)).toBeLessThan(1e-6);
    }
    expect(Math.abs(after.circles.get('circle-P')!.r - before.circles.get('circle-P')!.r)).toBeLessThan(1e-6);
    // and the drawn chord is a general one: its touch point is not its midpoint (no unstated symmetry, ADR-052)
    const A = after.positions.get('A')!, B = after.positions.get('B')!, P = after.circles.get('circle-P')!.center;
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const foot = { x: P.x, y: P.y }; // distance from P to the midpoint exceeds the radius iff the midpoint is not the touch point
    expect(dist(foot, mid) - after.circles.get('circle-P')!.r).toBeGreaterThan(0.05);
  });

  it('unchanged: a tangent restated as a chord of the SAME circle stays refused (a tangent meets its circle once)', async () => {
    expect(await submit(['מעגל O', 'AB משיק למעגל O', 'AB מיתר במעגל O'])).toEqual(['commit', 'commit', 'refuse']);
  });

  it('unchanged: a stated length still re-owns the separation («AB=4» between the two lines)', async () => {
    expect(await submit([...PRE, 'AB משיק למעגל P', 'AB=4', 'AB מיתר במעגל O'])).toEqual(['commit', 'commit', 'commit', 'commit', 'commit']);
    const d = replay(useGeoStore.getState().facts, 0);
    expect(dist(d.positions.get('A')!, d.positions.get('B')!)).toBeCloseTo(4, 6);
  });
});

describe('#2215 item 2 — a chord is never SHOWN collapsed (the entry point skips the raw degenerate seed)', () => {
  const cases: [string, string[]][] = [
    ['the common chord', [...PRE, 'AB מיתר במעגל O', 'AB מיתר במעגל P']],
    ['four memberships', [...PRE, 'A על מעגל O', 'B על מעגל O', 'A על מעגל P', 'B על מעגל P']],
    ['a chord tangent at its endpoint', [...PRE, 'AB מיתר במעגל O ומשיק למעגל P בנקודה B']],
  ];
  for (const [name, lines] of cases) {
    it(`${name}: the shown figure and 12 presses of «הציגו תצורה אחרת» keep |AB| > 0.05`, async () => {
      expect(await submit(lines)).toEqual(lines.map(() => 'commit'));
      const shown = () => {
        const st = useGeoStore.getState();
        const d = replay(st.facts, st.seed);
        return dist(d.positions.get('A')!, d.positions.get('B')!);
      };
      expect(shown()).toBeGreaterThan(0.05);
      for (let i = 0; i < 12; i++) {
        useGeoStore.getState().resample();
        const st = useGeoStore.getState();
        expect(meetsRequirements(st.facts, st.seed)).toBe(true);
        expect(shown()).toBeGreaterThan(0.05);
      }
    });
  }
});
