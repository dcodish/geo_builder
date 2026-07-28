/**
 * Issue #304 (ADR-3D-084): a stated pyramid/prism BASE shape noun must never be silently DROPPED and
 * replaced by a contradicting default base. `פירמידה שבסיסה מעוין ABCDS` (rhombus base) parsed to
 * `pyramid4gr` — a free-apex RECTANGLE base (types.ts) — losing the equal-sides given and asserting an
 * unstated right angle. Class: a base-shape noun the parser can't build falls to the wrong quad kind.
 *
 * Fix: (a) the parser builds the rhombus base as `pyramidPar` + `length-rel(|AB|=|AD|)` (the ADR-3D-078
 * prism macro, pyramid edition); the right+rhombus / kite / trapezoid cases DEFER rather than drop. (b)
 * the `droppedShapeNoun3` honesty gate on the LLM commit seam refuses any decomposition that lowers a
 * stated base shape to a contradicting kind.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { droppedShapeNoun3 } from '../parser/honesty3';
import { derive3, useGeo3 } from '../store/store3';
import { dist3 } from '../engine/vec3';
import type { Command3 } from '../engine/types';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const cmds = (u: string): Command3[] => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};

describe('#304 — rhombus-base pyramid builds correctly (parser)', () => {
  beforeEach(reset);

  for (const u of [
    'פירמידה שבסיסה מעוין ABCDS',
    'פירמידה מעוין ABCDS',
    'pyramid with a rhombus base ABCDS',
    'פירמידה שבסיסה מעוין', // label-less
  ]) {
    // LOCK MOVED DELIBERATELY (#305, ADR-3D-090): the rhombus base is now its OWN registry base
    // (`pyramidRhomb`), not "a parallelogram kind plus a constraint". The SEMANTIC assertion — a
    // rhombus is built, never the rectangle default, and the equal-adjacent-sides relation is
    // present — is unchanged, and the geometry test below still proves four equal sides.
    it(`"${u}" → a rhombus base + equal adjacent sides (never the rectangle default)`, () => {
      const c = cmds(u);
      expect(c.some((x) => x.type === 'solid' && x.kind === 'pyramidRhomb')).toBe(true);
      expect(c.some((x) => x.type === 'solid' && (x.kind === 'pyramid4gr' || x.kind === 'pyramid4r'))).toBe(false);
      expect(c.some((x) => x.type === 'length-rel' && x.c === 1)).toBe(true);
    });
  }

  it('the built base is a genuine rhombus (all four sides equal), verified at several seeds', () => {
    submit('פירמידה שבסיסה מעוין ABCDS');
    for (let i = 0; i < 4; i++) {
      const d = derive3(state().facts, i);
      expect(d.status[state().facts[0].id], `seed ${i}`).toBe('ok');
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((p) => d.positions.get(p)!);
      const ab = dist3(A, B), bc = dist3(B, C), cd = dist3(C, D), da = dist3(D, A);
      expect(ab).toBeGreaterThan(1e-3);
      expect(bc).toBeCloseTo(ab, 4);
      expect(cd).toBeCloseTo(ab, 4);
      expect(da).toBeCloseTo(ab, 4);
    }
  });

  // LOCK INVERTED DELIBERATELY (#305, ADR-3D-090). This assertion recorded a MISSING CAPABILITY,
  // not a desired behaviour: #304 had to defer right+rhombus because no right-parallelogram-base
  // template existed. Rightness is a modifier of any base now, and the operator's 2026-07-27 ruling
  // says a right pyramid over a non-cyclic base is CONSTRAINED into its family's cyclic member
  // (rhombus → square) with a notice, never refused. The honesty requirement the old test protected
  // — the stated shape is never silently dropped — is now met by building it, and asserted here.
  it('right + rhombus BUILDS, constrained to the cyclic member (a square), with a notice', () => {
    submit('פירמידה ישרה שבסיסה מעוין ABCDS');
    expect(state().facts.length).toBe(1);
    const d = derive3(state().facts, 0);
    expect(d.status[state().facts[0].id]).toBe('ok');
    // all four lateral edges equal ⇔ the apex sits over the base's circumcentre ⇔ the base is cyclic
    const apex = d.positions.get('S')!;
    const lat = ['A', 'B', 'C', 'D'].map((p) => dist3(apex, d.positions.get(p)!));
    for (const l of lat) expect(l).toBeCloseTo(lat[0], 4);
    expect(d.notices.some((n) => n.kind === 'base-constrained' && n.from === 'rhombus')).toBe(true);
  });
});

describe('#304 — droppedShapeNoun3 honesty gate (LLM seam)', () => {
  it('flags a rhombus utterance whose decomposition emits a rectangle-kind pyramid', () => {
    const rectKind: Command3[] = [{ type: 'solid', kind: 'pyramid4gr', ids: ['A', 'B', 'C', 'D', 'S'] }];
    expect(droppedShapeNoun3('פירמידה שבסיסה מעוין ABCDS', rectKind)).toEqual(['מעוין']);
  });

  it('passes the correct rhombus decomposition (pyramidPar + length-rel)', () => {
    expect(droppedShapeNoun3('פירמידה שבסיסה מעוין ABCDS', cmds('פירמידה שבסיסה מעוין ABCDS'))).toEqual([]);
  });

  it('flags an unsupported base template (kite / trapezoid) — refuse, never silently substitute', () => {
    const quad: Command3[] = [{ type: 'solid', kind: 'pyramid4gr', ids: ['A', 'B', 'C', 'D', 'S'] }];
    expect(droppedShapeNoun3('פירמידה שבסיסה דלתון ABCDS', quad)).toEqual(['דלתון']);
    expect(droppedShapeNoun3('pyramid with a trapezoid base ABCDS', quad)).toEqual(['trapezoid']);
  });

  it('the prism sibling: a rhombus prism lowered to a plain parallelogram is flagged', () => {
    const par: Command3[] = [{ type: 'solid', kind: 'parallelepiped', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }];
    expect(droppedShapeNoun3('מנסרה שבסיסה מעוין', par)).toEqual(['מעוין']);
    // …and the correct rhombus-prism decomposition passes
    expect(droppedShapeNoun3('מנסרה שבסיסה מעוין', cmds('מנסרה שבסיסה מעוין'))).toEqual([]);
  });

  it('a shape word OUTSIDE a solid context is not a base noun (no false flag)', () => {
    // the rectangle-completion claim `ABEC מלבן` — no prism/pyramid word, so the gate does not fire
    expect(droppedShapeNoun3('ABEC מלבן', cmds('ABEC מלבן'))).toEqual([]);
  });
});

describe('#304 — wiring lock (store3.submitSteps refuses a dropped base shape)', () => {
  beforeEach(reset);
  it('an LLM decomposition that lowers a stated rhombus base to a rectangle is refused, keep-prior', () => {
    useGeo3.getState().submitSteps('פירמידה שבסיסה מעוין ABCDS', ['פירמידה ABCDS שבסיסה מלבן']);
    expect(state().lastError?.code).toBe('dropped-given');
    expect(state().facts).toHaveLength(0); // nothing committed
  });
});
