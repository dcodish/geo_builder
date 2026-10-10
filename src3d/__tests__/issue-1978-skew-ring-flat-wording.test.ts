/**
 * Issue #1978 (ADR-3D-325): the skew-ring refusal says WHICH property failed.
 *
 * ADR-3D-319 refuses a polygon declared over placed points that no configuration makes coplanar, and it reused the
 * general `givens-contradict` wording: «הנתונים סותרים זה את זה — אין גוף שמקיים את …». That names both statements
 * but never says that a polygon is FLAT and these corners are not. The operator chose the sentence on 2026-10-10
 * (option A, "lead with the rule"), with the shape noun a parameter — a «מחומש» reaches the same line and must not
 * be called a «מרובע». The verdict is unchanged; only the message is new, and only on the skew arm.
 *
 * The lock: the operator's exact sequence and sentence, the noun by vertex count (the pentagon is what a hard-coded
 * «מרובע» would break), #1928's class rows (coordinates, cube, pyramid), a `givens-contradict` from another cause
 * byte-identical to before, the crossed ring's `ring-crossed` untouched, and the no-other-statement fallback.
 */

import { describe, expect, it } from 'vitest';
import { decideSubmit3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import i18n3d from '../i18n';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('he')(k, o) as string);
const en = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('en')(k, o) as string);

type St = { facts: Fact3[]; seed: number };
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

describe('#1978 the reported sequence, verbatim', () => {
  const LINES = ["קובייה ABCDA'B'C'D'", "מרובע ABCA'"];

  it('still refused on the same line, the cube kept — the verdict does not change', () => {
    const r = play(LINES);
    expect(r.kinds).toEqual(['record', 'refused']);
    expect(r.st.facts.map((f) => f.utterance)).toEqual(["קובייה ABCDA'B'C'D'"]);
    expect(r.error).toEqual({
      code: 'ring-not-flat',
      stated: "מרובע ABCA'",
      others: ["קובייה ABCDA'B'C'D'"],
      sides: 4,
      vertices: ['A', 'B', 'C', "A'"],
    });
  });

  it('the operator\'s sentence of 2026-10-10, exactly, and its English', () => {
    const r = play(LINES);
    expect(errorText3(he, r.error)).toBe(
      "מרובע הוא צורה שטוחה, והקודקודים A, B, C, A' אינם נמצאים במישור אחד — ולכן «מרובע ABCA'» לא מתקיים יחד עם «קובייה ABCDA'B'C'D'».",
    );
    expect(errorText3(en, r.error)).toBe(
      "A quadrilateral is a flat shape, and the vertices A, B, C, A' do not lie in one plane — so «מרובע ABCA'» cannot hold together with «קובייה ABCDA'B'C'D'».",
    );
  });
});

describe('#1978 the class — every skew ring of ADR-3D-319 carries the flat-shape reason', () => {
  it.each([
    [
      'a PENTAGON is called a pentagon, never a quadrilateral',
      ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(2,5,1)', 'E(0,3,0)', 'מחומש ABCDE'],
      'מחומש הוא צורה שטוחה, והקודקודים A, B, C, D, E אינם נמצאים במישור אחד — ולכן «מחומש ABCDE» לא מתקיים יחד עם «A(0,0,0)», «B(4,0,0)», «C(4,3,0)», ….',
    ],
    [
      'points fixed by coordinates',
      ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(0,3,5)', 'מרובע ABCD'],
      'מרובע הוא צורה שטוחה, והקודקודים A, B, C, D אינם נמצאים במישור אחד — ולכן «מרובע ABCD» לא מתקיים יחד עם «A(0,0,0)», «B(4,0,0)», «C(4,3,0)», ….',
    ],
    [
      'a pyramid\'s vertices',
      ['פירמידה SABCD', 'מרובע SABC'],
      'מרובע הוא צורה שטוחה, והקודקודים S, A, B, C אינם נמצאים במישור אחד — ולכן «מרובע SABC» לא מתקיים יחד עם «פירמידה SABCD».',
    ],
    [
      'a rectangle is a quadrilateral too',
      ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(0,3,5)', 'מלבן ABCD'],
      'מרובע הוא צורה שטוחה, והקודקודים A, B, C, D אינם נמצאים במישור אחד — ולכן «מלבן ABCD» לא מתקיים יחד עם «A(0,0,0)», «B(4,0,0)», «C(4,3,0)», ….',
    ],
  ])('%s', (_what, lines, text) => {
    const r = play(lines as string[]);
    expect(r.kinds[r.kinds.length - 1]).toBe('refused');
    expect(r.error?.code).toBe('ring-not-flat');
    expect(errorText3(he, r.error)).toBe(text);
  });

  it('the English noun follows the vertex count too', () => {
    const r = play(['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(2,5,1)', 'E(0,3,0)', 'מחומש ABCDE']);
    expect(errorText3(en, r.error)).toMatch(/^A pentagon is a flat shape, and the vertices A, B, C, D, E do not lie in one plane/);
  });

  it('with no other statement to name, the general wording stands (the ruled sentence needs a second statement)', () => {
    const err: Parameters<typeof errorText3>[1] = {
      code: 'ring-not-flat',
      stated: 'מרובע ABCD',
      others: [],
      sides: 4,
      vertices: ['A', 'B', 'C', 'D'],
    };
    expect(errorText3(he, err)).toBe(
      'הנתונים סותרים זה את זה — אין גוף שמקיים את «מרובע ABCD» יחד עם שאר הנתונים',
    );
  });
});

describe('#1978 the scope — nothing else is reworded', () => {
  it('a `givens-contradict` from another cause (contradictory angles, #425) is byte-identical to before', () => {
    const r = play(['פירמידה משולשת ABCD', 'AB', '|AB|=|BC|', 'AC', '|AB|=|AC|', 'AD', 'BD', 'זווית DAB = 120', 'זווית DAC = 53.13']);
    expect(r.error?.code).toBe('givens-contradict');
    expect(errorText3(he, r.error)).toBe(
      'הנתונים סותרים זה את זה — אין גוף שמקיים את «זווית DAC = 53.13» יחד עם «|AB|=|BC|», «|AB|=|AC|», «זווית DAB = 120»',
    );
  });

  it('the crossed ring keeps `ring-crossed` and its own message', () => {
    const r = play(['A(0,0,0)', 'B(4,0,0)', 'C(1,3,0)', 'D(3,3,0)', 'טרפז ABCD']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: 'טרפז ABCD' });
    expect(errorText3(he, r.error)).toBe(he('err.ringContradictsNoun', { detail: 'טרפז ABCD' }));
  });

  it('a flat section of the cube still records', () => {
    expect(play(["קובייה ABCDA'B'C'D'", "מרובע ABC'D'"]).kinds).toEqual(['record', 'record']);
  });
});
