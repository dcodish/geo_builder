/**
 * #305 / #341 / #358 (ADR-3D-090) — RIGHTNESS IS A MODIFIER OF ANY BASE.
 *
 * «פירמידה ישרה» = all lateral edges equal ⇔ the apex's foot is the base's CIRCUMCENTRE ⇔ the base
 * is CYCLIC. Before this, rightness lived in a kind's dim parameterization (`pyramid4r` hard-codes
 * the apex at `(0.5, b/2, h)`), so every (base × rightness) pair needed its own kind — and the pairs
 * nobody had written simply did not exist: right+rhombus and right+parallelogram deferred (#304/#341),
 * and kite / trapezoid / general-quad bases had no pyramid at all (#358).
 *
 * Operator ruling (2026-07-27, #305): when the stated base is not cyclic, do NOT refuse — constrain
 * it into the cyclic member of its OWN family and say so. Nothing is invented (ADR-052): the base
 * noun and «ישרה» jointly ENTAIL concyclicity, so the added relation is a consequence of two student
 * statements. The notice is what keeps it honest, and a contradiction with a STATED value is still
 * an ordinary over-constraint refusal — the auto-fix consumes FREE DOFs only.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { dist3 } from '../engine/vec3';
import { QUAD_BASE_DIMS, QUAD_PYRAMIDS, ringCircumcentre } from '../engine/baseShapes';
import { solidDims } from '../engine/evaluate';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';
import type { SolidKind } from '../engine/types';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

/** The four lateral edge lengths of the one solid, at `seed`. */
function lateralEdges(seed: number): number[] {
  const d = derive3(state().facts, seed);
  const s = d.construction.solids[0];
  const apex = d.positions.get(s.ids[4])!;
  return s.ids.slice(0, 4).map((b) => dist3(apex, d.positions.get(b)!));
}
/** The four side lengths of the base ring, at `seed`. */
function baseSides(seed: number): number[] {
  const d = derive3(state().facts, seed);
  const r = d.construction.solids[0].ids.slice(0, 4).map((p) => d.positions.get(p)!);
  return r.map((p, i) => dist3(p, r[(i + 1) % 4]));
}

describe('ADR-3D-090 — a RIGHT pyramid over every quad base', () => {
  beforeEach(reset);

  // The headline: each base the ruling names, in both languages, builds with EQUAL LATERAL EDGES.
  for (const [label, he, en] of [
    ['square', 'פירמידה ישרה SABCD שבסיסה ריבוע', 'right pyramid SABCD with a square base'],
    ['rectangle', 'פירמידה ישרה SABCD שבסיסה מלבן', 'right pyramid SABCD with a rectangle base'],
    ['rhombus', 'פירמידה ישרה SABCD שבסיסה מעוין', 'right pyramid SABCD with a rhombus base'],
    ['parallelogram', 'פירמידה ישרה SABCD שבסיסה מקבילית', 'right pyramid SABCD with a parallelogram base'],
    ['kite', 'פירמידה ישרה SABCD שבסיסה דלתון', 'right pyramid SABCD with a kite base'],
    ['trapezoid', 'פירמידה ישרה SABCD שבסיסה טרפז', 'right pyramid SABCD with a trapezoid base'],
    ['quad', 'פירמידה ישרה SABCD שבסיסה מרובע', 'right pyramid SABCD with a quadrilateral base'],
  ] as [string, string, string][]) {
    for (const [lang, u] of [['he', he], ['en', en]] as [string, string][]) {
      it(`${label} (${lang}): builds, and every lateral edge is equal at several seeds`, () => {
        submit(u);
        expect(state().facts.length, `${u} did not build: ${JSON.stringify(state().lastError)}`).toBe(1);
        for (const seed of [0, 1, 2, 3]) {
          expect(derive3(state().facts, seed).status[state().facts[0].id], `seed ${seed}`).toBe('ok');
          const lat = lateralEdges(seed);
          expect(lat[0]).toBeGreaterThan(1e-3);
          for (const l of lat) expect(l, `${label} seed ${seed}: ${lat.join(', ')}`).toBeCloseTo(lat[0], 3);
        }
      });
    }
  }

  it('each base stays in its OWN family — the fix never swaps a kite for a rhombus', () => {
    // a right KITE: |AB| = |AD| and |CB| = |CD| (adjacent pairs), but NOT all four equal
    submit('פירמידה ישרה SABCD שבסיסה דלתון');
    const [ab, bc, cd, da] = baseSides(0);
    expect(ab).toBeCloseTo(da, 4); // |AB| = |AD|
    expect(bc).toBeCloseTo(cd, 4); // |CB| = |CD|
    expect(Math.abs(ab - bc)).toBeGreaterThan(0.05); // still a kite, not a rhombus
  });

  it('a right TRAPEZOID base becomes ISOSCELES — the legs equalize, the bases stay unequal', () => {
    submit('פירמידה ישרה SABCD שבסיסה טרפז');
    const [ab, bc, cd, da] = baseSides(0);
    expect(bc).toBeCloseTo(da, 4); // the legs BC and AD
    expect(Math.abs(ab - cd)).toBeGreaterThan(0.05); // the two parallel bases stay different
  });

  it('a right PARALLELOGRAM base becomes a rectangle but keeps its aspect free (only the angle is consumed)', () => {
    submit('פירמידה ישרה SABCD שבסיסה מקבילית');
    const aspects = [0, 1, 2, 3].map((s) => {
      const [ab, bc] = baseSides(s);
      return bc / ab;
    });
    for (const s of [0, 1, 2, 3]) {
      const [ab, bc, cd, da] = baseSides(s);
      expect(cd).toBeCloseTo(ab, 4); // opposite sides equal — still a parallelogram
      expect(da).toBeCloseTo(bc, 4);
    }
    expect(Math.max(...aspects) - Math.min(...aspects)).toBeGreaterThan(0.02); // the aspect is still a free DOF
  });

  it('the OBLIQUE forms are untouched — no «ישרה» means a free apex (ADR-052)', () => {
    submit('פירמידה SABCD שבסיסה מעוין');
    const lat = lateralEdges(0);
    expect(Math.max(...lat) - Math.min(...lat)).toBeGreaterThan(0.02); // genuinely free, not seated
    expect(derive3(state().facts, 0).notices).toHaveLength(0); // nothing was constrained ⇒ no notice
  });
});

describe('ADR-3D-090 — the build NOTICE names what the shape became', () => {
  beforeEach(reset);

  for (const [u, from, to] of [
    ['פירמידה ישרה SABCD שבסיסה מעוין', 'rhombus', 'square'],
    ['פירמידה ישרה SABCD שבסיסה מקבילית', 'parallelogram', 'rectangle'],
    ['פירמידה ישרה SABCD שבסיסה דלתון', 'kite', 'rightKite'],
    ['פירמידה ישרה SABCD שבסיסה טרפז', 'trapezoid', 'isoTrapezoid'],
    ['פירמידה ישרה SABCD שבסיסה מרובע', 'quad', 'cyclicQuad'],
  ] as [string, string, string][]) {
    it(`${from} → ${to} raises a notice`, () => {
      submit(u);
      const notices = derive3(state().facts, 0).notices;
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ kind: 'base-constrained', from, to });
    });
  }

  it('a base that is ALREADY cyclic raises NO notice (nothing changed)', () => {
    for (const u of ['פירמידה ישרה SABCD שבסיסה ריבוע', 'פירמידה ישרה SABCD שבסיסה מלבן']) {
      reset();
      submit(u);
      expect(derive3(state().facts, 0).notices, u).toHaveLength(0);
    }
  });
});

describe('ADR-3D-090 — the boundary: the auto-fix consumes FREE DOFs only', () => {
  beforeEach(reset);

  it('a STATED angle that contradicts concyclicity refuses honestly, keep-prior', () => {
    // a cyclic rhombus must have a 90° base angle; the student said 60°, so this is a genuine
    // over-constraint — the fix must never overwrite a statement (ADR-052 / ADR-114).
    submit('פירמידה ישרה SABCD שבסיסה מעוין');
    expect(state().facts.length).toBe(1);
    submit('זווית DAB = 60');
    const d = derive3(state().facts, 0);
    const refused = state().facts.length === 1 || Object.values(d.status).some((s) => s !== 'ok');
    expect(refused, 'a 60° angle on a cyclic (⇒ square) rhombus base must not read as satisfied').toBe(true);
  });

  it('a stated angle CONSISTENT with the fix is accepted', () => {
    submit('פירמידה ישרה SABCD שבסיסה מעוין');
    submit('זווית DAB = 90');
    const d = derive3(state().facts, 0);
    for (const f of state().facts) expect(d.status[f.id]).toBe('ok');
  });
});

describe('ADR-3D-090 — the general path SUBSUMES the special cases', () => {
  it('every legacy quad-pyramid kind takes its dims from the registry, unchanged', () => {
    // The proof the migration moved no figure: the five pre-#305 kinds are now COMPOSED
    // (base dims, then top dims) and must still produce exactly their historical dim vectors.
    const legacy: [SolidKind, number][] = [
      ['pyramid4', 1], ['pyramid4g', 3], ['pyramid4r', 2], ['pyramid4gr', 4], ['pyramidPar', 5],
    ];
    for (const [kind, n] of legacy) {
      for (const seed of [0, 1, 7]) {
        expect(solidDims(kind, `solid-${kind}-ABCDS`, seed), `${kind} @${seed}`).toHaveLength(n);
      }
    }
  });

  it('the registry is total: every quad-pyramid kind has a base with a matching dim count', () => {
    for (const [kind, spec] of Object.entries(QUAD_PYRAMIDS)) {
      const expected = QUAD_BASE_DIMS[spec!.base] + (spec!.right ? 1 : 3);
      expect(solidDims(kind as SolidKind, `solid-${kind}-ABCDS`, 0), kind).toHaveLength(expected);
    }
  });

  it('ringCircumcentre is exact on a cyclic ring and equals the centre of a square/rectangle', () => {
    expect(ringCircumcentre([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toMatchObject({
      x: expect.closeTo(0.5, 10),
      y: expect.closeTo(0.5, 10),
    });
    // a triangle: the classic circumcentre (equidistant from all three)
    const c = ringCircumcentre([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }]);
    expect(c.x).toBeCloseTo(2, 10);
    expect(c.y).toBeCloseTo(1.5, 10);
  });
});

describe('ADR-3D-090 — save → load round-trip (the #288 whitelist guard)', () => {
  beforeEach(reset);

  for (const u of [
    'פירמידה ישרה SABCD שבסיסה מעוין',
    'פירמידה ישרה SABCD שבסיסה דלתון',
    'פירמידה ישרה SABCD שבסיסה מרובע',
    'פירמידה SABCD שבסיסה טרפז',
  ]) {
    it(`"${u}" survives serialize → deserialize with the same figure`, () => {
      submit(u);
      const before = lateralEdges(0);
      const text = serializeFigure3(state().facts, state().seed);
      const loaded = deserializeFigure3(text);
      expect(loaded.ok, `${u} did not round-trip: ${JSON.stringify(loaded)}`).toBe(true);
      if (!loaded.ok) return;
      // the whitelist drops unknown commands silently, so assert the FIGURE, not just the parse
      const d = derive3(loaded.facts, 0);
      expect(d.construction.solids).toHaveLength(1);
      const s = d.construction.solids[0];
      const apex = d.positions.get(s.ids[4])!;
      const after = s.ids.slice(0, 4).map((b) => dist3(apex, d.positions.get(b)!));
      after.forEach((v, i) => expect(v).toBeCloseTo(before[i], 6));
    });
  }
});

describe('ADR-3D-090 — a stated base noun is still never silently dropped (#304 invariant)', () => {
  it('every quad base noun parses to a kind carrying THAT base — never a default', () => {
    const cases: [string, SolidKind][] = [
      ['פירמידה SABCD שבסיסה מעוין', 'pyramidRhomb'],
      ['פירמידה SABCD שבסיסה דלתון', 'pyramidKite'],
      ['פירמידה SABCD שבסיסה טרפז', 'pyramidTrap'],
      ['פירמידה SABCD שבסיסה מרובע', 'pyramidQuad'],
      ['פירמידה SABCD שבסיסה מקבילית', 'pyramidPar'],
      ['פירמידה SABCD שבסיסה ריבוע', 'pyramid4g'],
      ['פירמידה SABCD שבסיסה מלבן', 'pyramid4gr'],
    ];
    for (const [u, kind] of cases) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      expect(r.commands.some((c) => c.type === 'solid' && c.kind === kind), `${u} → ${kind}`).toBe(true);
    }
  });
});
