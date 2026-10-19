/**
 * #2255 ([ADR-3D-374](../../docs/06b-decisions-3d.md#adr-3d-374), [ADR-W-147](../../docs/06w-decisions-workspace.md#adr-w-147))
 * — A MIXED NUMBER TYPED WITH A FRACTION GLYPH IS THAT NUMBER, in 3-D too.
 *
 * Reported (measured at b7d6223c): `normalize3` spelled each glyph as text with no separator, so «2½» became
 * «21/2» = 10.5 — «A(2½, 3, 1)» was drawn at x = 10.5 and «AB = 2½» on a cube recorded an edge of 10.5, green —
 * and only ½ ¼ ¾ ⅓ ⅔ were read («A(2⅕, 0, 0)», «A(2 ½, 3, 1)», «∠ABC = 22½», «z - 2½ = 0» went to the AI). The
 * boundary now calls the shared `shell/vulgarFractions` (2-D's ADR-635 reader), so every slot reads the number.
 *
 * The build + drift net for the reported cube is the fixture `fixtures3/mixed-fraction-2255.geo3.json`; these are
 * the bespoke assertions, through the real `decideSubmit3` + `derive3` seam: each value against its decimal twin,
 * the palette's own buttons, and the vector coefficients a lone glyph already read (which must not move).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { normalize3 } from '../parser/parse3';
import { SYMBOL_PALETTE_3 } from '../ui/symbols3';
import { norm3, sub3, type Vec3 } from '../engine/vec3';

type St = { facts: Fact3[]; seed: number };
let n = 0;
const id = () => `f${n++}`;

/** Every line must record; returns the final state. */
function build(lines: readonly string[], seed = 0): St {
  let st: St = { facts: [], seed };
  for (const line of lines) {
    const v = decideSubmit3(st, line, id);
    expect(v.kind, `«${line}»: ${JSON.stringify(v)}`).toBe('record');
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
/** The commands the LAST line lowered to. */
const lastCmds = (lines: readonly string[]) => {
  const st = build(lines);
  return st.facts[st.facts.length - 1].cmds;
};
const allOk = (st: St) => {
  const d = derive3(st.facts, st.seed);
  expect(Object.values(d.status).every((x) => x === 'ok'), JSON.stringify(d.status)).toBe(true);
  return d;
};
const pointA = (utterance: string): Vec3 => {
  const d = allOk(build([utterance]));
  return d.positions.get('A') as Vec3;
};
const CUBE = "קובייה ABCDA'B'C'D'";
const BASIS = "נסמן: AB=u, AD=v, AA'=w";

describe('#2255 — a coordinate written with a mixed number is that number', () => {
  it.each([
    ['A(2½, 3, 1)', { x: 2.5, y: 3, z: 1 }],
    ['A(1¼, 0, 0)', { x: 1.25, y: 0, z: 0 }],
    ['A(0, 2¾, 0)', { x: 0, y: 2.75, z: 0 }],
    ['A(2⅓, 0, 0)', { x: 7 / 3, y: 0, z: 0 }],
    ['A(-2½, 0, 0)', { x: -2.5, y: 0, z: 0 }],
    ['A(2 ½, 3, 1)', { x: 2.5, y: 3, z: 1 }],
    ['A(2⅕, 0, 0)', { x: 2.2, y: 0, z: 0 }],
    ['A(½, 0, 0)', { x: 0.5, y: 0, z: 0 }],
  ])('«%s» is drawn at the stated point', (utterance, want) => {
    const A = pointA(utterance);
    expect(A.x).toBeCloseTo(want.x, 12);
    expect(A.y).toBeCloseTo(want.y, 12);
    expect(A.z).toBeCloseTo(want.z, 12);
  });

  it('the stored row keeps the glyph the student typed (the parser boundary only)', () => {
    const st = build(['A(2½, 3, 1)']);
    expect(st.facts[0].utterance).toBe('A(2½, 3, 1)');
  });
});

describe('#2255 — a magnitude written with a mixed number equals its decimal twin', () => {
  it('the reported cube: «AB = 2½» gives edge 2.5, exactly as «AB = 2.5» does, at several seeds', () => {
    expect(lastCmds([CUBE, 'AB = 2½'])).toEqual(lastCmds([CUBE, 'AB = 2.5']));
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = allOk(build([CUBE, 'AB = 2½'], seed));
      const at = (k: string) => d.positions.get(k) as Vec3;
      expect(norm3(sub3(at('B'), at('A'))), `seed ${seed}`).toBeCloseTo(2.5, 6);
    }
  });

  it('«משולש ABC» · «AB = 2½» is |AB| = 2.5 (the 2-D reading, ADR-635)', () => {
    const d = allOk(build(['משולש ABC', 'AB = 2½']));
    const at = (k: string) => d.positions.get(k) as Vec3;
    expect(norm3(sub3(at('B'), at('A')))).toBeCloseTo(2.5, 6);
  });

  it('«∠ABC = 22½» is 22.5°', () => {
    expect(lastCmds(['משולש ABC', '∠ABC = 22½'])).toEqual(lastCmds(['משולש ABC', '∠ABC = 22.5']));
  });

  it('«המישור π1: z - 2½ = 0» is the plane «z - 2.5 = 0»', () => {
    expect(lastCmds(['המישור π1: z - 2½ = 0'])).toEqual(lastCmds(['המישור π1: z - 2.5 = 0']));
  });

  it('the sphere «ורדיוסו 2½» has the verdict and the radius of «ורדיוסו 2.5»', () => {
    const twin = decideSubmit3({ facts: [], seed: 0 }, 'כדור שמרכזו O ורדיוסו 2.5', id);
    const glyph = decideSubmit3({ facts: [], seed: 0 }, 'כדור שמרכזו O ורדיוסו 2½', id);
    expect(glyph.kind).toBe(twin.kind);
    if (glyph.kind === 'record' && twin.kind === 'record') {
      expect(glyph.facts[0].cmds).toEqual(twin.facts[0].cmds);
    }
  });

  it('«AB = ½√3» is √3/2 — a glyph coefficient of a radical moves below it', () => {
    expect(normalize3('AB = ½√3')).toBe('AB = √3/2');
    const d = allOk(build(['משולש ABC', 'AB = ½√3']));
    const at = (k: string) => d.positions.get(k) as Vec3;
    expect(norm3(sub3(at('B'), at('A')))).toBeCloseTo(Math.sqrt(3) / 2, 6);
  });
});

describe('#2255 — the palette: a digit then the ½ / ¾ button reads as the mixed number', () => {
  const insertOf = (label: string) => {
    const row = SYMBOL_PALETTE_3.find(([l]) => l === label);
    expect(row, `palette button ${label}`).toBeDefined();
    return row![1];
  };
  it.each([
    ['½', 2.5],
    ['¾', 2.75],
  ])('«AB = 2» + the %s button is |AB| = %s', (label, want) => {
    const typed = `AB = 2${insertOf(label)}`;
    const d = allOk(build(['משולש ABC', typed]));
    const at = (k: string) => d.positions.get(k) as Vec3;
    expect(norm3(sub3(at('B'), at('A')))).toBeCloseTo(want, 6);
  });
});

describe('#2255 — the vector coefficients a lone glyph already read do not move (the plan gate)', () => {
  const termsOf = (line: string) => {
    const cmds = lastCmds([CUBE, BASIS, line]);
    const rel = cmds.find((c) => c.type === 'vec-rel') as { terms: { coeff: { k: number; p: number }; atom: unknown }[] } | undefined;
    expect(rel, JSON.stringify(cmds)).toBeDefined();
    return rel!.terms.map((t) => [t.coeff.k, t.coeff.p, t.atom]);
  };
  it.each([
    ['AM = ½u + ½v', [[0.5, 0, { kind: 'named', name: 'u' }], [0.5, 0, { kind: 'named', name: 'v' }]]],
    [
      'AM = ⅓u - ¾v + ⅔w',
      [[1 / 3, 0, { kind: 'named', name: 'u' }], [-0.75, 0, { kind: 'named', name: 'v' }], [2 / 3, 0, { kind: 'named', name: 'w' }]],
    ],
    ['AM = ½AB + ½AD', [[0.5, 0, { kind: 'pair', from: 'A', to: 'B' }], [0.5, 0, { kind: 'pair', from: 'A', to: 'D' }]]],
  ])('«%s» lowers exactly as before', (line, want) => {
    expect(termsOf(line)).toEqual(want);
  });

  it('a MIXED coefficient is one number: «AM = 2½u» is 2.5u (it was 10.5u)', () => {
    expect(termsOf('AM = 2½u')).toEqual([[2.5, 0, { kind: 'named', name: 'u' }]]);
  });
});
