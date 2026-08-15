/**
 * Issue #587 (ADR-3D-152): a stated FLAT quad SHAPE builds.
 *
 * The flat-quad lane had no shape semantics: `planarPolygon` detected its kind from `משולש/מרובע/מחומש`
 * alone, so `ריבוע ABCD` / `ABCD ריבוע` / `ABCD הוא ריבוע` were all `not-handled` (an LLM burn on a
 * construct the engine already has), while the ONE form that did parse — `המרובע ABCD הוא ריבוע` — read
 * the ring and DISCARDED the qualifier, drawing an arbitrary quadrilateral with a green ✓ (the
 * #424/ADR-3D-084 silent-drop class, quad edition). ADR-3D-149 closed the silent half by refusing; this
 * is the capability half, built per the operator's option-(a) ruling (2026-08-15).
 *
 * The mechanism is ONE engine command, `quad-shape`, applied in three arms dispatched on how many
 * corners already exist — the dispatch lives at apply because `parse3` is context-free. `rect-complete`
 * is absorbed as its rectangle instance, so all six nouns behave alike instead of `מלבן` alone having
 * corner completion.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { droppedShapeNoun3 } from '../parser/honesty3';
import { derive3, useGeo3 } from '../store/store3';
import { dist3, sub3, dot3, norm3 } from '../engine/vec3';
import { QUAD_BASE_DIMS, quadShapeConstraints, type QuadBase } from '../engine/baseShapes';
import { applyCommand3 } from '../engine/apply';
import type { Command3, Id } from '../engine/types';

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

/** Every fact green at seed `s`, with the resolved positions. */
function build(seed: number) {
  const d = derive3(state().facts, seed);
  for (const f of state().facts) expect(d.status[f.id], `fact "${f.utterance}" @seed ${seed}`).toBe('ok');
  return d;
}
const P = (d: ReturnType<typeof derive3>, id: Id) => d.positions.get(id)!;
const len = (d: ReturnType<typeof derive3>, a: Id, b: Id) => dist3(P(d, a), P(d, b));
/** cos of the angle at `v` between arms to `p` and `q`. */
function cosAt(d: ReturnType<typeof derive3>, v: Id, p: Id, q: Id) {
  const u = sub3(P(d, p), P(d, v));
  const w = sub3(P(d, q), P(d, v));
  return dot3(u, w) / (norm3(u) * norm3(w));
}
/** |cos| of the angle between segments ab and cd — 1 when parallel. */
function cosBetween(d: ReturnType<typeof derive3>, a: Id, b: Id, c: Id, e: Id) {
  const u = sub3(P(d, b), P(d, a));
  const w = sub3(P(d, e), P(d, c));
  return Math.abs(dot3(u, w) / (norm3(u) * norm3(w)));
}

describe('#587 — the operator\'s reported case: a quad noun as a STATEMENT about an existing base', () => {
  beforeEach(reset);

  it('«פירמידה ABCDS שבסיסה ריבוע» then «ABCD ריבוע» commits GREEN, re-creating nothing', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    const before = build(0);
    const posBefore = ['A', 'B', 'C', 'D', 'S'].map((p) => P(before, p));

    submit('ABCD ריבוע');
    expect(state().lastError, 'the statement about the existing square base must not error').toBe(null);
    expect(state().facts).toHaveLength(2);

    const after = build(0);
    // nothing re-created: the same five points, no new ones
    expect([...after.positions.keys()].sort()).toEqual([...before.positions.keys()].sort());
    // and nothing MOVED — a statement about what is already true is inert (the stability invariant)
    ['A', 'B', 'C', 'D', 'S'].forEach((p, i) => {
      expect(dist3(P(after, p), posBefore[i]), `${p} moved`).toBeLessThan(1e-9);
    });
  });

  it('a FALSE statement about a DETERMINED ring is refused via claim verification, never drawn', () => {
    // coordinates pin the ring completely, so nothing is free to be driven: ∠BCD ≠ 90°, so this
    // quadrilateral is provably not a rectangle and the noun must be refused rather than absorbed.
    submit('A(0,0,0)');
    submit('B(4,0,0)');
    submit('C(4,1,0)');
    submit('D(0,3,0)');
    expect(state().lastError, 'precondition: the four corners pinned').toBe(null);
    const n = state().facts.length;
    submit('ABCD מלבן');
    const last = state().facts[state().facts.length - 1];
    const refused = state().lastError !== null || state().facts.length === n || derive3(state().facts, 0).status[last.id] !== 'ok';
    expect(refused, 'a non-right-angled quadrilateral is not a rectangle').toBe(true);
  });

  it('a TRUE statement about the same determined ring verifies green', () => {
    submit('A(0,0,0)');
    submit('B(4,0,0)');
    submit('C(4,3,0)');
    submit('D(0,3,0)');
    submit('ABCD מלבן');
    expect(state().lastError).toBe(null);
    build(0);
  });
});

describe('#587 — every framing parses, and to the same commands', () => {
  const framings = [
    'ריבוע ABCD',
    'ABCD ריבוע',
    'ABCD הוא ריבוע',
    'המרובע ABCD הוא ריבוע',
    'square ABCD',
    'ABCD is a square',
  ];
  for (const u of framings) {
    it(`"${u}" parses to a square quad-shape`, () => {
      const c = cmds(u);
      expect(c.some((x) => x.type === 'quad-shape' && x.base === 'square')).toBe(true);
    });
  }

  it('the noun-first and labels-first framings are byte-identical', () => {
    expect(cmds('ABCD ריבוע')).toEqual(cmds('ריבוע ABCD'));
  });

  it('#587\'s silent-drop half stays closed: the qualifier is never discarded', () => {
    // the form that USED to commit a bare arbitrary quadrilateral with a green ✓
    const c = cmds('המרובע ABCD הוא ריבוע');
    expect(droppedShapeNoun3('המרובע ABCD הוא ריבוע', c), 'the stated noun is accounted for').toEqual([]);
    expect(c.some((x) => x.type === 'quad-shape' && x.base === 'square')).toBe(true);
  });
});

describe('#587 — each family\'s constraint set HOLDS geometrically, at several seeds', () => {
  beforeEach(reset);

  const EPS = 1e-6;
  /** noun → the geometry that must actually be true of the built ring. */
  const families: [string, QuadBase, (d: ReturnType<typeof derive3>) => void][] = [
    ['ריבוע ABCD', 'square', (d) => {
      const s = [len(d, 'A', 'B'), len(d, 'B', 'C'), len(d, 'C', 'D'), len(d, 'D', 'A')];
      s.forEach((x) => expect(x).toBeCloseTo(s[0], 6));
      expect(cosAt(d, 'B', 'A', 'C')).toBeCloseTo(0, 6);
    }],
    ['מלבן ABCD', 'rectangle', (d) => {
      expect(cosAt(d, 'A', 'D', 'B')).toBeCloseTo(0, 6);
      expect(cosAt(d, 'B', 'A', 'C')).toBeCloseTo(0, 6);
      expect(cosAt(d, 'C', 'B', 'D')).toBeCloseTo(0, 6);
    }],
    ['מעוין ABCD', 'rhombus', (d) => {
      const s = [len(d, 'A', 'B'), len(d, 'B', 'C'), len(d, 'C', 'D'), len(d, 'D', 'A')];
      s.forEach((x) => expect(x).toBeCloseTo(s[0], 6));
    }],
    ['מקבילית ABCD', 'parallelogram', (d) => {
      expect(cosBetween(d, 'A', 'B', 'D', 'C')).toBeCloseTo(1, 6);
      expect(cosBetween(d, 'A', 'D', 'B', 'C')).toBeCloseTo(1, 6);
    }],
    ['דלתון ABCD', 'kite', (d) => {
      expect(len(d, 'A', 'B')).toBeCloseTo(len(d, 'A', 'D'), 5);
      expect(len(d, 'C', 'B')).toBeCloseTo(len(d, 'C', 'D'), 5);
    }],
    ['טרפז ABCD', 'trapezoid', (d) => {
      expect(cosBetween(d, 'D', 'C', 'A', 'B')).toBeCloseTo(1, 6);
    }],
  ];

  for (const [u, base, assertGeometry] of families) {
    it(`"${u}" (${base}) builds a genuine ${base} at several seeds`, () => {
      reset();
      submit(u);
      expect(state().lastError, `"${u}" must build`).toBe(null);
      for (let seed = 0; seed < 4; seed++) {
        const d = build(seed);
        // non-degenerate first — "all sides equal" is vacuously true of a collapsed ring
        expect(len(d, 'A', 'B'), `seed ${seed}: degenerate`).toBeGreaterThan(EPS);
        assertGeometry(d);
      }
    });
  }
});

describe('#587 — the DOF arithmetic agrees with the solid registry', () => {
  // The flat `polygon4` carries exactly 4 free dims (A=(0,0), B=(1,0) are the gauge), so a family's
  // constraint count must be `4 − QUAD_BASE_DIMS[base]`. This agreement is the main evidence the
  // constraint sets are the right ones — it is asserted rather than checked by hand.
  const BASES: QuadBase[] = ['square', 'rectangle', 'rhombus', 'parallelogram', 'kite', 'trapezoid', 'quad'];
  for (const base of BASES) {
    it(`${base}: ${4 - QUAD_BASE_DIMS[base]} constraints leave ${QUAD_BASE_DIMS[base]} free dims`, () => {
      expect(quadShapeConstraints(base, ['A', 'B', 'C', 'D'])).toHaveLength(4 - QUAD_BASE_DIMS[base]);
    });
  }
});

describe('#587 — the three apply arms', () => {
  beforeEach(reset);

  it('ARM 1 (all corners new): «מלבן ABCD» DECLARES — it no longer refuses two-unknowns', () => {
    submit('מלבן ABCD');
    expect(state().lastError).toBe(null);
    const d = build(0);
    expect(cosAt(d, 'B', 'A', 'C')).toBeCloseTo(0, 6);
  });

  it('ARM 2 (one unknown): corner completion works for a noun OTHER than מלבן', () => {
    submit('מקבילית ABCD');
    submit('ריבוע ABCE'); // E is the single unknown corner
    expect(state().lastError).toBe(null);
    const d = build(0);
    expect(d.positions.has('E'), 'the unknown corner was completed').toBe(true);
  });

  it('ARM 2: a family that does NOT determine the corner refuses instead of inventing it (ADR-052)', () => {
    submit('מקבילית ABCD');
    submit('טרפז ABCE'); // one parallel pair leaves E with a free DOF — nothing determines it
    expect(state().lastError, 'an underdetermined corner must be refused, never defaulted').not.toBe(null);
    expect(state().facts).toHaveLength(1);
  });

  it('ARM 3 (all known): a TRUE statement verifies green and adds no points', () => {
    submit('ריבוע ABCD');
    const n = state().facts.length;
    submit('ABCD מרובע');
    expect(state().lastError).toBe(null);
    expect(state().facts).toHaveLength(n + 1);
    build(0);
  });
});

describe('#587 — `rect-complete` absorbed: its three frozen phrasings are unchanged', () => {
  beforeEach(reset);

  for (const u of ['ABEC מלבן', 'ABEC is a rectangle', 'מלבן ABEC']) {
    it(`"${u}" still completes the single unknown corner`, () => {
      reset();
      submit('משולש ABC');
      submit(u);
      expect(state().lastError, `"${u}" must complete E`).toBe(null);
      const d = build(0);
      expect(d.positions.has('E')).toBe(true);
      // the completed ring is a genuine rectangle
      expect(cosAt(d, 'B', 'A', 'E')).toBeCloseTo(0, 6);
    });
  }

  it('the frozen phrasings lower through the SAME command the general rule emits', () => {
    // identical commands are what keeps the rectComplete/planarPolygon overlap off the shadow-matrix
    // divergence gate — one semantics, reached by two rules
    expect(cmds('ABEC מלבן')).toEqual([{ type: 'quad-shape', base: 'rectangle', ids: ['A', 'B', 'E', 'C'] }]);
    expect(cmds('מלבן ABEC')).toEqual(cmds('ABEC מלבן'));
    expect(cmds('ABEC is a rectangle')).toEqual(cmds('ABEC מלבן'));
  });

  it('a `.geo3.json` saved before ADR-3D-152 still loads: `rect-complete` delegates', () => {
    reset();
    submit('משולש ABC');
    const viaLegacy = applyCommand3(derive3(state().facts, 0).construction, {
      type: 'rect-complete', ids: ['A', 'B', 'E', 'C'],
    });
    expect(viaLegacy.ok, 'the legacy command still applies').toBe(true);
    if (viaLegacy.ok) expect(viaLegacy.next.points.has('E')).toBe(true);
  });
});
