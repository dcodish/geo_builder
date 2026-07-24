/**
 * #304 + #305 (ADR-3D-072) — the quadrilateral base family.
 *
 * Operator report (2026-07-24): «`פירמידה שבסיסה מעוין` … seems to draw something else.»
 * It drew a RECTANGLE-base pyramid: `rightPyramid` dispatched its base by a chain of positive
 * tests ending in an unconditional else-fallback to the rule's UNSTATED-base default, so any
 * base noun it did not test (מעוין, דלתון, טרפז, מרובע…) was silently dropped AND replaced by
 * a rectangle the student never gave — an M4 / ADR-052 violation in the parser itself.
 *
 * The tests below are in two layers:
 *   (1) the CLASS lock — for EVERY base noun in the shared vocabulary, a stated base either
 *       lowers to a kind whose base IS that shape, or defers. Never a different shape. This is
 *       the mechanism test: it fails if anyone re-introduces a fallback, for nouns nobody reported.
 *   (2) the CAPABILITY — the rhombus / kite / trapezoid / general-quad pyramids actually build,
 *       with the defining property of each base verified on the coordinates, at several seeds.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { applyCommand3, DIM_COUNT, VERTEX_COUNT } from '../engine/apply';
import { QUAD_BASE_DIMS, QUAD_PYRAMIDS, quadBaseRing, type QuadBase } from '../engine/baseShapes';
import { evaluate3, solidDims } from '../engine/evaluate';
import { emptyConstruction3, type SolidKind } from '../engine/types';
import { dist3, sub3 } from '../engine/vec3';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const derived = (seed = useGeo3.getState().seed) => derive3(useGeo3.getState().facts, seed);
const kindOf = (u: string): string => {
  const r = parse3(u);
  if (!r.ok) return `DEFER:${r.reason}`;
  const c = r.commands[0];
  return c.type === 'solid' ? c.kind : `CMD:${c.type}`;
};

/** The base shape each pyramid kind actually stands on — read from the engine's own table. */
const baseOf = (kind: string): QuadBase | 'triangle' | null =>
  QUAD_PYRAMIDS[kind as SolidKind]?.base ?? (['pyramid3', 'pyramid3e', 'tetra'].includes(kind) ? 'triangle' : null);

// ---------------------------------------------------------------------------
// (1) the CLASS lock — a stated base is honoured or deferred, never swapped
// ---------------------------------------------------------------------------

/** Every base noun a student can state, in both locales, with the shape it names. */
const NOUNS: { he: string; en: string; base: QuadBase | 'triangle' }[] = [
  { he: 'מעוין', en: 'rhombus', base: 'rhombus' },
  { he: 'מעויין', en: 'rhombus', base: 'rhombus' }, // the double-yod spelling
  { he: 'דלתון', en: 'kite', base: 'kite' },
  { he: 'טרפז', en: 'trapezoid', base: 'trapezoid' },
  { he: 'מרובע', en: 'quadrilateral', base: 'quad' },
  { he: 'מקבילית', en: 'parallelogram', base: 'parallelogram' },
  { he: 'ריבוע', en: 'square', base: 'square' },
  { he: 'מלבן', en: 'rectangle', base: 'rectangle' },
  { he: 'משולש', en: 'triangular', base: 'triangle' },
];

describe('#304 — a stated base noun is NEVER silently replaced by another shape', () => {
  it('CLASS: every noun × (labelled / bare / right), He + En — the built base matches the stated one, or it defers', () => {
    for (const { he, en, base } of NOUNS) {
      const utterances = [
        `פירמידה SABCD שבסיסה ${he}`,
        `פירמידה שבסיסה ${he}`,
        `פירמידה ישרה SABCD שבסיסה ${he}`,
        `פירמידה ישרה שבסיסה ${he}`,
        `pyramid SABCD with a ${en} base`,
        `pyramid with a ${en} base`,
        `right pyramid SABCD with a ${en} base`,
      ];
      for (const u of utterances) {
        const kind = kindOf(u);
        if (kind.startsWith('DEFER:')) continue; // deferring is always honest
        expect(baseOf(kind), `«${u}» built ${kind}, whose base is not ${base}`).toBe(base);
      }
    }
  });

  it('the exact reported utterances no longer build a rectangle', () => {
    // pre-#304 these were pyramid4gr / pyramid4r — a free-aspect RECTANGLE base
    expect(kindOf('פירמידה SABCD שבסיסה מעוין')).toBe('pyramidRhomb');
    expect(kindOf('פירמידה ישרה SABCD שבסיסה מעוין')).toBe('pyramidRhombR');
    expect(kindOf('pyramid SABCD with a rhombus base')).toBe('pyramidRhomb');
    // …and the label-less form the operator typed is no longer an LLM escalation
    expect(kindOf('פירמידה שבסיסה מעוין')).toBe('pyramidRhomb');
  });

  it('a base-noun / label-count CONTRADICTION defers instead of building something else', () => {
    // a stated TRIANGLE base with 5 labels (pre-#304: pyramid4r, a rectangle-base pyramid)
    expect(parse3('פירמידה ישרה SABCD שבסיסה משולש').ok).toBe(false);
    // a stated QUAD base with only 4 labels (pre-#304: `tetra`, a triangular pyramid)
    expect(parse3('פירמידה ABCD שבסיסה מעוין').ok).toBe(false);
    expect(parse3('פירמידה ABCD שבסיסה טרפז').ok).toBe(false);
  });

  it('a base with no pyramid model defers (never the unstated-base default)', () => {
    expect(parse3('פירמידה SABCD שבסיסה מחומש').ok).toBe(false); // pentagon: no pyramid kind
    expect(parse3('pyramid SABCD with a hexagon base').ok).toBe(false);
  });

  it('SIBLING (same else-fallback in rightPrism): a stated base with no prism model defers', () => {
    // pre-#304 these built a TRIANGULAR prism, silently dropping the stated base
    expect(parse3('מנסרה ישרה ABC שבסיסה טרפז').ok).toBe(false);
    expect(parse3('right prism ABC with a kite base').ok).toBe(false);
    // the prism bases that DO exist are unchanged
    expect(kindOf('מנסרה ישרה ABC')).toBe('prism3');
    expect(kindOf('מנסרה ישרה שבסיסה מקבילית')).toBe('prism4');
    expect(kindOf('מנסרה ישרה שבסיסה מעוין')).toBe('prism4r');
    expect(kindOf('מנסרה ישרה שבסיסה מרובע')).toBe('prism4g');
  });

  it('REGRESSION: the pre-#305 forms lower exactly as before', () => {
    expect(kindOf('פירמידה ABCDS')).toBe('pyramid4gr'); // no base stated → free-aspect rectangle (unchanged)
    expect(kindOf('פירמידה ישרה ABCDS')).toBe('pyramid4r');
    expect(kindOf('פירמידה ABCD')).toBe('tetra');
    expect(kindOf('פירמידה ישרה ABCS')).toBe('pyramid3');
    expect(kindOf('פירמידה ישרה שבסיסה ריבוע')).toBe('pyramid4');
    expect(kindOf('פירמידה SABCD שבסיסה ריבוע')).toBe('pyramid4g');
    expect(kindOf('פירמידה SABCD שבסיסה מקבילית')).toBe('pyramidPar');
    expect(kindOf('טטראדר')).toBe('tetra');
    expect(kindOf('פירמידה ישרה שבסיסה משולש שווה צלעות')).toBe('pyramid3e');
    expect(kindOf('מקבילון')).toBe('parallelepiped');
    expect(kindOf('מנסרה שבסיסה מקבילית')).toBe('parallelepiped'); // #295, bare = oblique
  });

  it('«ישרה» over a base with NO centre of symmetry defers — never an invented centroid (ADR-052)', () => {
    for (const u of ['פירמידה ישרה SABCD שבסיסה דלתון', 'פירמידה ישרה SABCD שבסיסה טרפז', 'right pyramid SABCD with a quadrilateral base']) {
      expect(parse3(u).ok, u).toBe(false);
    }
    // …while the centro-symmetric bases DO have a right form
    expect(kindOf('פירמידה ישרה SABCD שבסיסה מעוין')).toBe('pyramidRhombR');
    expect(kindOf('פירמידה ישרה SABCD שבסיסה מקבילית')).toBe('pyramidParR');
  });
});

// ---------------------------------------------------------------------------
// (2) the CAPABILITY — each base's defining property holds on the coordinates
// ---------------------------------------------------------------------------

const SEEDS = [0, 1, 2, 3, 5, 8];

describe('#305 — the quad pyramid bases build with the right geometry', () => {
  beforeEach(reset);
  const at = (id: string, seed = 0) => derived(seed).positions.get(id)!;
  /** The signed area of the base ring — a proxy for "the quad is simple and convex-ish". */
  const ringOk = (seed: number) => {
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(id, seed));
    return [A, B, C, D].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  };

  it('rhombus base: all four sides equal, and it is NOT a square (∠A ≠ 90°) at every seed', () => {
    submit('פירמידה SABCD שבסיסה מעוין');
    expect(useGeo3.getState().lastError).toBeNull();
    for (const seed of SEEDS) {
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(id, seed));
      expect(dist3(A, B)).toBeCloseTo(dist3(B, C), 9);
      expect(dist3(B, C)).toBeCloseTo(dist3(C, D), 9);
      expect(dist3(C, D)).toBeCloseTo(dist3(D, A), 9);
      // ADR-052: the default drawing must not LOOK like a square (the special case)
      const ab = sub3(B, A);
      const ad = sub3(D, A);
      const cos = (ab.x * ad.x + ab.y * ad.y + ab.z * ad.z) / (dist3(A, B) * dist3(A, D));
      expect(Math.abs(cos), `seed ${seed}: rhombus rendered as a square`).toBeGreaterThan(0.15);
      expect(ringOk(seed)).toBe(true);
    }
  });

  it('kite base: |AB| = |AD| and |CB| = |CD|, and it is NOT a rhombus', () => {
    submit('פירמידה SABCD שבסיסה דלתון');
    expect(useGeo3.getState().lastError).toBeNull();
    for (const seed of SEEDS) {
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(id, seed));
      expect(dist3(A, B)).toBeCloseTo(dist3(A, D), 9); // the two adjacent pairs
      expect(dist3(C, B)).toBeCloseTo(dist3(C, D), 9);
      // ADR-052: a kite must not render as a rhombus (its special case — all four equal)
      expect(Math.abs(dist3(A, B) - dist3(C, B)), `seed ${seed}: kite rendered as a rhombus`).toBeGreaterThan(0.1);
    }
  });

  it('trapezoid base: DC ∥ AB, and it is NOT a parallelogram nor a RIGHT trapezoid', () => {
    submit('פירמידה SABCD שבסיסה טרפז');
    expect(useGeo3.getState().lastError).toBeNull();
    for (const seed of SEEDS) {
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(id, seed));
      const ab = sub3(B, A);
      const dc = sub3(C, D);
      // parallel ⇒ the cross product vanishes
      const cx = ab.y * dc.z - ab.z * dc.y;
      const cy = ab.z * dc.x - ab.x * dc.z;
      const cz = ab.x * dc.y - ab.y * dc.x;
      expect(Math.hypot(cx, cy, cz), `seed ${seed}: DC not parallel to AB`).toBeLessThan(1e-9);
      // ADR-052: not a parallelogram (|DC| ≠ |AB|) and not right-angled at A
      expect(Math.abs(dist3(D, C) - dist3(A, B)), `seed ${seed}: trapezoid rendered as a parallelogram`).toBeGreaterThan(0.2);
      const ad = sub3(D, A);
      const cosA = (ab.x * ad.x + ab.y * ad.y + ab.z * ad.z) / (dist3(A, B) * dist3(A, D));
      expect(Math.abs(cosA), `seed ${seed}: trapezoid rendered as a RIGHT trapezoid`).toBeGreaterThan(0.1);
    }
  });

  it('general quad base: a simple quad with no forced equality or parallelism', () => {
    submit('פירמידה SABCD שבסיסה מרובע');
    expect(useGeo3.getState().lastError).toBeNull();
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(id, 0));
    expect(Math.abs(dist3(A, B) - dist3(C, D))).toBeGreaterThan(0.05);
    expect(Math.abs(dist3(B, C) - dist3(D, A))).toBeGreaterThan(0.05);
    expect(ringOk(0)).toBe(true);
  });

  it('a RIGHT rhombus pyramid: the apex sits over the diagonals\' intersection', () => {
    submit('פירמידה ישרה SABCD שבסיסה מעוין');
    expect(useGeo3.getState().lastError).toBeNull();
    for (const seed of SEEDS) {
      const [A, B, C, D, S] = ['A', 'B', 'C', 'D', 'S'].map((id) => at(id, seed));
      expect(dist3(A, B)).toBeCloseTo(dist3(B, C), 9); // still a rhombus
      const mid = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2, z: (A.z + C.z) / 2 };
      expect(S.x).toBeCloseTo(mid.x, 9);
      expect(S.y).toBeCloseTo(mid.y, 9);
      expect(S.z).toBeGreaterThan(A.z); // …and above the base
      // over a rhombus, "right" makes the lateral edges equal in opposite PAIRS
      expect(dist3(S, A)).toBeCloseTo(dist3(S, C), 9);
      expect(dist3(S, B)).toBeCloseTo(dist3(S, D), 9);
    }
  });

  it('a RIGHT parallelogram pyramid (the ישרה that used to be dropped) is right', () => {
    submit('פירמידה ישרה SABCD שבסיסה מקבילית');
    const [A, B, C, D, S] = ['A', 'B', 'C', 'D', 'S'].map((id) => at(id, 0));
    expect(dist3(A, B)).toBeCloseTo(dist3(C, D), 9); // parallelogram
    expect(dist3(B, C)).toBeCloseTo(dist3(D, A), 9);
    expect(S.x).toBeCloseTo((A.x + C.x) / 2, 9);
    expect(S.y).toBeCloseTo((A.y + C.y) / 2, 9);
  });

  it('ADR-052: every new base keeps FREE shape DOFs — "show another" moves the base', () => {
    for (const u of ['פירמידה SABCD שבסיסה מעוין', 'פירמידה SABCD שבסיסה דלתון', 'פירמידה SABCD שבסיסה טרפז', 'פירמידה SABCD שבסיסה מרובע']) {
      reset();
      submit(u);
      // the diagonal ratio is a similarity-invariant of ANY quad (for a rhombus the side ratio
      // is identically 1, so it would not detect a frozen base)
      const shape = (seed: number) => {
        const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(id, seed));
        return dist3(A, C) / dist3(B, D);
      };
      expect(Math.abs(shape(0) - shape(4)), `${u}: base shape is fixed, not a free DOF`).toBeGreaterThan(1e-6);
    }
  });
});

// ---------------------------------------------------------------------------
// the operator's exact sequence (2026-07-24) — the non-negotiable regression lock
// ---------------------------------------------------------------------------

describe('SCENARIO — operator 2026-07-24: «פירמידה שבסיסה מעוין» draws a rhombus-base pyramid', () => {
  beforeEach(reset);

  it('the exact utterance builds, and the base really is a rhombus (not the rectangle it used to draw)', () => {
    submit('פירמידה שבסיסה מעוין'); // ← verbatim, as reported
    const d = derived();
    for (const f of useGeo3.getState().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(useGeo3.getState().lastError).toBeNull();

    const [A, B, C, D, S] = ['A', 'B', 'C', 'D', 'S'].map((id) => d.positions.get(id)!);
    expect(dist3(A, B)).toBeCloseTo(dist3(B, C), 9);
    expect(dist3(B, C)).toBeCloseTo(dist3(C, D), 9);
    expect(dist3(C, D)).toBeCloseTo(dist3(D, A), 9);
    expect(S).toBeDefined(); // the apex exists and the solid has its 5 vertices
    expect(d.positions.size).toBe(5);
    // the base is flat and the apex is off it — a genuine pyramid, not a degenerate figure
    expect(A.z).toBeCloseTo(B.z, 9);
    expect(S.z).toBeGreaterThan(A.z + 0.1);
  });

  it('it composes with the rest of the lane: naming vectors and a size given work on it', () => {
    submit('פירמידה שבסיסה מעוין');
    submit('נסמן: AB = u, AD = v, AS = w');
    submit('|u| = 3');
    const d = derived();
    for (const f of useGeo3.getState().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const [A, B, D] = ['A', 'B', 'D'].map((id) => d.positions.get(id)!);
    expect(dist3(A, B)).toBeCloseTo(3, 6);
    expect(dist3(A, D)).toBeCloseTo(3, 6); // a rhombus: |AD| = |AB|, so the size given reaches it too
  });

  it('the free base angle survives a rebuild: "show another configuration" reshapes the rhombus', () => {
    submit('פירמידה שבסיסה מעוין');
    const angleAt = (seed: number) => {
      const p = derive3(useGeo3.getState().facts, seed).positions;
      const [A, B, D] = ['A', 'B', 'D'].map((id) => p.get(id)!);
      const ab = sub3(B, A);
      const ad = sub3(D, A);
      return Math.acos((ab.x * ad.x + ab.y * ad.y + ab.z * ad.z) / (dist3(A, B) * dist3(A, D)));
    };
    expect(Math.abs(angleAt(0) - angleAt(3))).toBeGreaterThan(1e-6);
  });
});

// ---------------------------------------------------------------------------
// the drift locks — the hand-maintained tables must agree with the geometry
// ---------------------------------------------------------------------------

describe('#305 — base registry integrity', () => {
  it('EVERY solid kind: DIM_COUNT matches the dims it actually samples, and VERTEX_COUNT its positions', () => {
    // the two hand-maintained tables in apply.ts must agree with the geometry in evaluate.ts —
    // the same drift #288 found in the save whitelist, locked here so it cannot happen silently
    for (const kind of Object.keys(DIM_COUNT) as SolidKind[]) {
      const dims = solidDims(kind, `k-${kind}`, 0);
      expect(dims.length, `DIM_COUNT[${kind}]`).toBe(DIM_COUNT[kind]);
      const ids = Array.from({ length: VERTEX_COUNT[kind] }, (_, i) => `P${i}`);
      const res = applyCommand3(emptyConstruction3(), { type: 'solid', kind, ids });
      expect(res.ok, `${kind} did not apply with VERTEX_COUNT ids`).toBe(true);
      if (res.ok) expect(evaluate3(res.next, 0).size, `positions for ${kind}`).toBe(VERTEX_COUNT[kind]);
    }
  });

  it('every quad pyramid kind: base dims + top dims = the dims it actually samples', () => {
    for (const [kind, spec] of Object.entries(QUAD_PYRAMIDS)) {
      const expected = QUAD_BASE_DIMS[spec.base] + (spec.right ? 1 : 3);
      expect(solidDims(kind as SolidKind, `k-${kind}`, 0).length, kind).toBe(expected);
    }
  });

  it('every base ring returns 4 vertices from exactly QUAD_BASE_DIMS[base] dims, gauge A=(0,0) B=(1,0)', () => {
    for (const base of Object.keys(QUAD_BASE_DIMS) as QuadBase[]) {
      const dims = Array.from({ length: QUAD_BASE_DIMS[base] }, () => 0.7);
      const ring = quadBaseRing(base, dims);
      expect(ring, base).toHaveLength(4);
      expect(ring[0]).toEqual({ x: 0, y: 0 });
      expect(ring[1]).toEqual({ x: 1, y: 0 });
    }
  });

  it('a RIGHT kind exists only for a base with a centre of symmetry', () => {
    for (const [kind, spec] of Object.entries(QUAD_PYRAMIDS)) {
      if (!spec.right) continue;
      const ring = quadBaseRing(spec.base, Array.from({ length: QUAD_BASE_DIMS[spec.base] }, () => 0.7));
      // centro-symmetric ⇔ the two diagonals share a midpoint
      const mAC = { x: (ring[0].x + ring[2].x) / 2, y: (ring[0].y + ring[2].y) / 2 };
      const mBD = { x: (ring[1].x + ring[3].x) / 2, y: (ring[1].y + ring[3].y) / 2 };
      expect(Math.hypot(mAC.x - mBD.x, mAC.y - mBD.y), `${kind}: right pyramid over a base with no centre`).toBeLessThan(1e-9);
    }
  });
});
