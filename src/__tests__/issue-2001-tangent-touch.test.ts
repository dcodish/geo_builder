/**
 * #2001 arm 2 ([ADR-724](../../docs/06-decisions.md#adr-724)) — A NAMED TOUCH POINT ON A DRAWN INCIRCLE BUILDS: the
 * vacuity gate judges collapsed measured TERMS, not coincident references.
 *
 * Measured on the #2215 tip (8df1965c) through `decideDeterministic2D` + the store, model mocked (0 calls):
 *   «משולש ABC» · «מעגל חסום במשולש ABC» · «AB משיק למעגל בנקודה D»   → refused «משהו השתבש בבניית השורה הזאת…»
 *   … · «המעגל משיק ל-AB בנקודה D»                                    → the same
 *   … · «BC משיק למעגל בנקודה E» / «CA … F»                            → build
 *
 * Root cause: the incircle's radius is witnessed by its hidden touch foot `@f-AB`; «D» is the foot from the centre
 * to AB, i.e. exactly `@f-AB`, so the membership lowers to |OD| = |O·@f-AB| — which HOLDS. `newConstraintsNonVacuous`
 * rejected any solution where two of a new constraint's references coincide, so D ≡ @f-AB read as "satisfied by
 * collapse". Only the side carrying the radius witness failed. Fix: the gate reads `collapsibleTermPairs` — a pair
 * whose meeting collapses a measured term (a length's ends, an angle's vertex and arm; any two points of an
 * incidence row) — so #7 / B13 («GA = AC» with A driven onto C: |AC| = 0) stays refused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { collapsibleTermPairs } from '@/engine/solve';
import type { Constraint } from '@/engine';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function submit(lines: string[]): Promise<{ kind: string; said: string | null }[]> {
  useGeoStore.getState().clear();
  const out: { kind: string; said: string | null }[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
    if (v.kind === 'commit') for (const c of v.commands) useGeoStore.getState().execute(c, line, `g${st.facts.length}`);
    const note = v.kind === 'refuse' ? (v.note as { explain?: string; key?: string; params?: Record<string, unknown> } | undefined) : undefined;
    const said = note?.explain ? humanizeError(note.explain, he, line, otherUtteranceForError(st.facts, note.explain)) : note?.key ? he(note.key, note.params) : null;
    out.push({ kind: v.kind, said });
  }
  return out;
}

const INCIRCLE = ['משולש ABC', 'מעגל חסום במשולש ABC'];
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

describe('#2001 arm 2 — a named touch point on a drawn incircle builds', () => {
  const rows: [string, string, string, string][] = [
    ['the report: the side that carries the radius witness', 'AB משיק למעגל בנקודה D', 'D', '@f-AB'],
    ['the circle as subject', 'המעגל משיק ל-AB בנקודה D', 'D', '@f-AB'],
    ['unchanged: BC', 'BC משיק למעגל בנקודה E', 'E', '@f-BC'],
    ['unchanged: CA', 'CA משיק למעגל בנקודה F', 'F', '@f-CA'],
  ];
  for (const [name, line, P, foot] of rows) {
    it(`${name}: commits, ${P} sits on the incircle's touch point, and the circle does not move (seeds 0–5)`, async () => {
      await submit(INCIRCLE);
      const before = [0, 1, 2, 3, 4, 5].map((s) => replay(useGeoStore.getState().facts, s).circles.get('circle-O')!);
      const verdicts = await submit([...INCIRCLE, line]);
      expect(verdicts.map((v) => v.kind)).toEqual(['commit', 'commit', 'commit']);
      for (const s of [0, 1, 2, 3, 4, 5]) {
        const d = replay(useGeoStore.getState().facts, s);
        expect(d.lastError).toBeNull();
        expect(d.violations).toEqual([]);
        const c = d.circles.get('circle-O')!;
        expect(dist(c.center, before[s].center)).toBeLessThan(1e-9);
        expect(Math.abs(c.r - before[s].r)).toBeLessThan(1e-9);
        const p = d.positions.get(P)!, f = d.positions.get(foot)!;
        expect(dist(p, f)).toBeLessThan(1e-6);
        expect(Math.abs(dist(p, c.center) - c.r)).toBeLessThan(1e-6);
      }
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }
});

describe('#2001 — the gate still refuses a COLLAPSED term (#7 / B13 keep their own locks)', () => {
  it('collapsibleTermPairs: lengths pair their own ends, angles their vertex and arms, incidence rows every pair', () => {
    const eq = { type: 'equal', a: 'O', b: 'D', c: 'O', d: 'W' } as Constraint;
    expect(collapsibleTermPairs(eq)).toEqual([['O', 'D'], ['O', 'W']]); // D ≡ W collapses no term
    const ang = { type: 'angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 40 } as Constraint;
    expect(collapsibleTermPairs(ang)).toEqual([['B', 'A'], ['B', 'C']]);
    const col = { type: 'collinear', a: 'A', b: 'B', c: 'C' } as Constraint;
    expect(collapsibleTermPairs(col)).toEqual([['A', 'B'], ['A', 'C'], ['B', 'C']]);
    expect(collapsibleTermPairs({ type: 'coincide', p: 'P', q: 'Q' } as Constraint)).toEqual([]);
  });

});
