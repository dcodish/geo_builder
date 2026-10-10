/**
 * Issue #1928 (ADR-3D-319): a polygon DECLARED over PLACED points must lie in ONE PLANE.
 *
 * The class (measured on main @ 8e0debff, at #1923's tip): *a declared flat polygon over points the figure has
 * already placed is never checked for lying in one plane*. «A(0,0,0) · B(4,0,0) · C(4,3,0) · D(0,3,5) · מרובע ABCD»
 * recorded all five lines green — D five units off the plane of A, B, C, a skew ring of 0.306 at all four claim
 * samples and all 24 raw seeds, with no status fail and no notice. «מלבן ABCD» on the same points recorded too,
 * because a rectangle's own claims (three right angles) all hold on that skew ring. ADR-3D-310 checked a declared
 * ring for COLLAPSE and nothing else, and ADR-3D-172 already rules that "planarity is the shape's meaning".
 *
 * The lock: the reported sequence with its exact he/en text and the prior figure kept, every class row (the
 * spellings, the rectangle, a pentagon, a solid's vertices, a derived vertex), and the RULED BOUNDARY against
 * #1935 — a ring with a FREE vertex is BUILT, never refused (operator ruling 2026-10-09). Plus the kept refusals,
 * the controls, a saved file's load, and `ringSkew3` itself.
 */

import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import i18n3d from '../i18n';
import { ringSkew3, v3 } from '../engine/vec3';
import { CLAIM_REL_TOL } from '../engine/operands';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('he')(k, o) as string);
const en = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('en')(k, o) as string);

type St = { facts: Fact3[]; seed: number };
/** Submit each line; returns every verdict kind and the last refusal's error. */
function play(lines: readonly string[]) {
  let n = 0;
  let st: St = { facts: [], seed: 0 };
  const kinds: string[] = [];
  let error: unknown = null;
  for (const line of lines) {
    const v = decideSubmit3(st, line, () => `f${++n}`);
    kinds.push(v.kind);
    if (v.kind === 'refused') error = v.error;
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return { st, kinds, error: error as Parameters<typeof errorText3>[1] };
}

/** the reported points — D is 5 off the plane of A, B, C */
const PTS = ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(0,3,5)'];

describe('#1928 the reported sequence, verbatim', () => {
  it('«A(0,0,0) · B(4,0,0) · C(4,3,0) · D(0,3,5) · מרובע ABCD» — the declaration is refused, the prior figure kept', () => {
    const r = play([...PTS, 'מרובע ABCD']);
    expect(r.kinds).toEqual(['record', 'record', 'record', 'record', 'refused']);
    expect(r.error).toEqual({
      code: 'ring-not-flat',
      stated: 'מרובע ABCD',
      others: ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', '…'],
      sides: 4,
      vertices: ['A', 'B', 'C', 'D'],
    });
    // keep-prior: the four coordinate points stand, the declaration is not in the list
    expect(r.st.facts.map((f) => f.utterance)).toEqual(PTS);
  });

  it('#1978 (ADR-3D-325): the ruled flat-shape wording, in both languages', () => {
    const r = play([...PTS, 'מרובע ABCD']);
    expect(errorText3(he, r.error)).toBe(
      'מרובע הוא צורה שטוחה, והקודקודים A, B, C, D אינם נמצאים במישור אחד — ולכן «מרובע ABCD» לא מתקיים יחד עם «A(0,0,0)», «B(4,0,0)», «C(4,3,0)», ….',
    );
    expect(errorText3(en, r.error)).toBe(
      'A quadrilateral is a flat shape, and the vertices A, B, C, D do not lie in one plane — so «מרובע ABCD» cannot hold together with «A(0,0,0)», «B(4,0,0)», «C(4,3,0)», ….',
    );
  });

  it('a saved list holding the reported ring loads with the declaration row failed', () => {
    // every ORDER of these four points is skew, so the row cannot be borrowed from a recorded play — the saved
    // file is written out as the loader hands it back.
    const facts = play(PTS).st.facts;
    const skew: Fact3 = {
      id: 'x',
      utterance: 'מרובע ABCD',
      cmds: [{ type: 'solid', kind: 'polygon4', ids: ['A', 'B', 'C', 'D'] }],
      enabled: true,
    };
    expect(derive3([...facts, skew], 0).status.x).toMatchObject({
      code: 'ring-not-flat',
      stated: 'מרובע ABCD',
      others: ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', '…'],
    });
  });
});

describe('#1928 the class — a declared flat polygon over placed, non-coplanar points', () => {
  it.each([
    ['another spelling', [...PTS, 'ABCD מרובע'], 'ABCD מרובע', ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', '…']],
    ['English', [...PTS, 'the quadrilateral ABCD'], 'the quadrilateral ABCD', ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', '…']],
    ['a rectangle, whose own claims all hold', [...PTS, 'מלבן ABCD'], 'מלבן ABCD', ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', '…']],
    [
      'a pentagon',
      ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(2,5,1)', 'E(0,3,0)', 'מחומש ABCDE'],
      'מחומש ABCDE',
      ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', '…'],
    ],
    ['a cube\'s vertices', ["קובייה ABCDA'B'C'D'", "מרובע ABCA'"], "מרובע ABCA'", ["קובייה ABCDA'B'C'D'"]],
    ['a cube\'s vertices, the other ring', ["קובייה ABCDA'B'C'D'", "מרובע ABC'D"], "מרובע ABC'D", ["קובייה ABCDA'B'C'D'"]],
    ['a pyramid\'s vertices', ['פירמידה SABCD', 'מרובע SABC'], 'מרובע SABC', ['פירמידה SABCD']],
    [
      'a vertex DERIVED from coordinates',
      ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'E(0,6,8)', 'M אמצע AE', 'מרובע ABCM'],
      'מרובע ABCM',
      ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', '…'],
    ],
  ])('%s — the declaration is refused, naming what placed its points', (_what, lines, stated, others) => {
    const r = play(lines as string[]);
    expect(r.kinds.slice(0, -1).every((k) => k === 'record')).toBe(true);
    expect(r.kinds[r.kinds.length - 1]).toBe('refused');
    expect(r.error).toMatchObject({ code: 'ring-not-flat', stated, others }); // #1978: its own code since ADR-3D-325
  });

  it('the solid rows name the solid, as the ruling words them (#1978: with the flat-shape reason)', () => {
    expect(errorText3(he, play(["קובייה ABCDA'B'C'D'", "מרובע ABCA'"]).error)).toBe(
      "מרובע הוא צורה שטוחה, והקודקודים A, B, C, A' אינם נמצאים במישור אחד — ולכן «מרובע ABCA'» לא מתקיים יחד עם «קובייה ABCDA'B'C'D'».",
    );
  });
});

/**
 * The boundary the operator ruled on 2026-10-09 (#1935): a ring with at least one FREE vertex is NOT a
 * contradiction — the free point is driven into the plane and the quadrilateral is BUILT. Refusing it would turn
 * an unstated freedom into an error (ADR-052). This refusal must never reach those rings.
 */
describe('#1928 the RULED boundary — a ring with a FREE vertex is built, never refused', () => {
  it.each([
    [['משולש ABC', 'משולש ABD', 'מרובע ACBD']],
    [["קובייה ABCDA'B'C'D'", 'משולש ABP', 'מרובע ABCP']],
    [['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'מרובע ABCD']], // D minted by the declaration (ADR-3D-172)
  ])('%j records', (lines) => {
    const r = play(lines);
    expect(r.kinds.every((k) => k === 'record')).toBe(true);
    expect(r.error).toBe(null);
  });
});

describe('#1928 the controls — unchanged', () => {
  it.each([
    [["קובייה ABCDA'B'C'D'", "מרובע ABC'D'"]], // a planar section of the cube
    [['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(0,3,0)', 'מרובע ABCD']], // coplanar coordinates
  ])('%j records', (lines) => {
    expect(play(lines).kinds.every((k) => k === 'record')).toBe(true);
  });

  it.each(['טרפז ABCD', 'ריבוע ABCD', 'מקבילית ABCD', 'מעוין ABCD', 'דלתון ABCD', 'טרפז שווה שוקיים ABCD'])(
    '«%s» on the reported points keeps its own `claim-refuted`',
    (noun) => {
      expect(play([...PTS, noun]).error).toEqual({ code: 'claim-refuted' });
    },
  );

  it('the declaration-FIRST order keeps its `injection-unsatisfiable` at «D(0,3,5)»', () => {
    const r = play(['מרובע ABCD', ...PTS]);
    expect(r.kinds).toEqual(['record', 'record', 'record', 'record', 'refused']);
    expect(r.error).toEqual({ code: 'injection-unsatisfiable' });
  });

  it('the crossed ring of #1923 keeps ITS message — the two checks do not collide', () => {
    const r = play(['A(0,0,0)', 'B(4,0,0)', 'C(1,3,0)', 'D(3,3,0)', 'טרפז ABCD']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: 'טרפז ABCD' });
  });
});

describe('#1928 ringSkew3', () => {
  it('the reported ring measures 0.306; a flat ring is 0 in any orientation', () => {
    expect(ringSkew3([v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 5)])).toBeCloseTo(0.306, 3);
    expect(ringSkew3([v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)])).toBeLessThanOrEqual(CLAIM_REL_TOL);
    // the same flat ring tilted out of the floor, and scaled a thousandfold — scale-free
    expect(ringSkew3([v3(0, 0, 0), v3(4, 0, 0), v3(4, 1.8, 2.4), v3(0, 1.8, 2.4)])).toBeLessThanOrEqual(CLAIM_REL_TOL);
    expect(ringSkew3([v3(0, 0, 0), v3(4000, 0, 0), v3(4000, 3000, 0), v3(0, 3000, 0)])).toBeLessThanOrEqual(CLAIM_REL_TOL);
  });

  it('a ring with no plane is 0 — a collapse is the collapse predicate\'s business', () => {
    expect(ringSkew3([v3(0, 0, 0), v3(1, 0, 0), v3(2, 0, 0), v3(3, 0, 0)])).toBe(0); // on one line
    expect(ringSkew3([v3(1, 1, 1), v3(1, 1, 1), v3(1, 1, 1), v3(1, 1, 1)])).toBe(0); // one point
    expect(ringSkew3([v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 1)])).toBe(0); // a triangle is flat by construction
  });

  it('solver noise stays well under the tolerance a figure is judged by', () => {
    expect(ringSkew3([v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 1e-6)])).toBeLessThan(CLAIM_REL_TOL);
  });
});
