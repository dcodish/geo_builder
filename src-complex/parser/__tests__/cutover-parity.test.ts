/**
 * S7's HARD GATE, as a test: v2 must read everything the prototype reads before the prototype is
 * deleted ([#624](https://github.com/dcodish/geo_builder/issues/624), ADR-CX-019).
 *
 * The cutover deletes `engine/model.ts` and `engine/complex.ts`. The operator's condition on it is
 * exact: *"if v2 cannot cover something the prototype covers, STOP and report it rather than deleting
 * the capability."* So the gate is measured rather than asserted — every form the prototype's own
 * suite exercises is run through BOTH grammars, and a form the prototype reads and v2 does not is a
 * failure of this test, not a note in a document.
 *
 * The forms below are the ones the measurement found missing, each now built. What the measurement did
 * NOT cover is behaviour after parsing — the referencable solution set («z^3 = 8» naming z₁,z₂,z₃) is
 * a capability the prototype has and v2 does not, and it is [#680](https://github.com/dcodish/geo_builder/issues/680).
 */
import { describe, expect, it } from 'vitest';

import { parseLine } from '../parse';
import { parseLineV2 } from '../rules';
import { deriveLines } from '../../app/deriveLines';

/** Every form the prototype's suite exercises, as one representative utterance each. */
const PROTOTYPE_FORMS: string[] = [
  'z1 = 3+4i',
  'z2 = 2cis150',
  'z1 מספר מרוכב',
  'w = הצמוד של z1',
  'w = conj(z1)',
  'w = ההופכי של z1',
  'w = 1/(z1)',
  '|z1-z2|',
  'z1*z2',
  'w = re(z1)',
  'im(z1)',
  'w = החלק הממשי של z1',
  'z = rcis(theta)',
  'z1 = 2cis(θ)',
  'z^3 = 8',
  'z1^3 = z3',
  '-2z1 = conj(z3)',
  '|z1| = 9r',
  '|z1| = 2|z2|',
  'arg z1 - arg z2 = 90',
  'arg z2 < 45',
  'z1 ברביע הראשון',
  'המרובע Oz1z2z3',
  'שטח Oz1z2z3 הוא 150r^2',
  'z1, z2, z3 סדרה הנדסית',
  'z1*conj(z1) + z2*conj(z2) = 25',
];

describe('the cutover gate: v2 reads everything the prototype reads', () => {
  it.each(PROTOTYPE_FORMS)('«%s»', (line) => {
    const proto = parseLine(line);
    const v2 = parseLineV2(line);
    if (!proto.ok) return; // a form the prototype cannot read is not a capability the cutover loses
    expect(
      v2.ok,
      `the prototype reads «${line}» and v2 does not — deleting the prototype would delete this ` +
        `capability, which #624's gate forbids`,
    ).toBe(true);
  });
});

describe('F4 inequalities are branch SELECTORS, not drivers', () => {
  it('«arg z2 < 45» keeps the sampled direction inside the window', () => {
    const d = deriveLines(['z2', 'arg z2 < 45']);
    const z2 = d.points.find((p) => p.name === 'z2')!;
    expect(z2.argumentDeg).toBeLessThan(45);
  });

  it('a two-sided window bounds both ends', () => {
    const d = deriveLines(['z1', '90 < arg z1 < 180']);
    const z1 = d.points.find((p) => p.name === 'z1')!;
    expect(z1.argumentDeg).toBeGreaterThan(90);
    expect(z1.argumentDeg).toBeLessThan(180);
  });

  it('it PRUNES an enumerated branch set rather than moving a forced value (#651)', () => {
    // the three cube roots of 8 sit at 0°, 120°, 240°: only one is in (90°, 180°)
    const d = deriveLines(['z^3 = 8', '90 < arg z < 180']);
    expect(d.configCount).toBe(1);
    expect(d.points[0].reading).toBe('z = 2·cis120°');
  });
});

describe('the projections are real, and no longer an invented parameter', () => {
  /**
   * `im(z1)` lexed as the NAME `im` times `z1` — a stated projection silently became a product with an
   * invented real parameter. Same defect the TOKEN comment records for `2cis150`.
   */
  it('«im(z1)» is the imaginary part, not a product', () => {
    const d = deriveLines(['z1 = 3+4i', 'im(z1)']);
    expect(d.knowledge[0].value).toBe('4');
    expect(d.points.map((p) => p.name)).toEqual(['z1']); // no phantom `im` number
  });

  it('«re(z1)» reads the real part, and defines a number when named', () => {
    const d = deriveLines(['z1 = 3+4i', 'w = re(z1)']);
    const w = d.points.find((p) => p.name === 'w')!;
    expect(w.z.re).toBeCloseTo(3, 9);
    expect(w.z.im).toBeCloseTo(0, 9);
  });

  it('the Hebrew spelling is the same operation', () => {
    const he = deriveLines(['z1 = 3+4i', 'w = החלק הממשי של z1']);
    const fn = deriveLines(['z1 = 3+4i', 'w = re(z1)']);
    expect(he.points.map((p) => p.reading)).toEqual(fn.points.map((p) => p.reading));
  });
});

describe('a bare expression is a QUESTION, answered by the knowledge rule', () => {
  it('«|z1-z2|» over a determined figure answers', () => {
    expect(deriveLines(['z1 = 3+4i', 'z2 = 3', '|z1-z2|']).knowledge[0].value).toBe('4');
  });

  it('«|z1-z2|» over the capstone answers IN THE UNIT — the prototype panel’s job, done honestly', () => {
    const d = deriveLines(['|z1| = 9r', '|z2| = 12r', 'arg z1 - arg z2 = 90', '|z1-z2|']);
    expect(d.knowledge[0].value).toBe('15r');
  });

  it('and withholds a value the givens do not force, saying why', () => {
    const d = deriveLines(['z1 = 3', 'z2', '|z1-z2|']);
    expect(d.knowledge[0].value).toBeNull();
    expect(d.knowledge[0].why).not.toBe('');
  });

  it('a bare expression states nothing — it declares its names and constrains nothing', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 1', '|z1-z2|']);
    expect(d.unsatisfied).toEqual([]);
    expect(d.undecided).toEqual([]);
  });
});

describe('the spelled-out declaration and the symbolic polar form', () => {
  it('«z1 ו-z2 מספרים מרוכבים» declares both', () => {
    const d = deriveLines(['z1 ו-z2 מספרים מרוכבים']);
    expect(d.points.map((p) => p.name).sort()).toEqual(['z1', 'z2']);
  });

  it('«z1 = 2cis(θ)» states the MAGNITUDE and leaves the direction free', () => {
    const d = deriveLines(['z1 = 2cis(θ)']);
    const z1 = d.points[0];
    expect(Math.hypot(z1.z.re, z1.z.im)).toBeCloseTo(2, 6);
    expect(d.freeDof.some((f) => f.includes('arg'))).toBe(true);
  });
});
