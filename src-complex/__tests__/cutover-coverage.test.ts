/**
 * WHAT THE PROTOTYPE SUITE LOCKED AND NO v2 TEST DID — #624 step 3.
 *
 * The plan of record read *"the prototype's 76 tests, rewritten to drive addLine"*. That is not the job:
 * most of `prototype.test.ts` is already covered on the v2 path by `rules`, `cutover-parity`,
 * `knowledge`, `knowledge-in-r`, `claims`, `visualization`, `solution-sets`, `window` and
 * `acceptance-gate`, and another slice asserts prototype INTERNALS — the `Scene` shape, `derive()`'s
 * `checks` map — which have no v2 counterpart and must not be ported.
 *
 * So the gap was MEASURED rather than eyeballed: every input line the prototype suite drives (125 of
 * them) was run through `app/submit.ts`, and the 57 already driven by a v2 test were set aside. What
 * remained split three ways — renamed twins of a covered case, genuine v2 gaps (fixed as #690 and #691
 * at ADR-CX-025 and ADR-CX-026), and **capabilities v2 already had that nothing asserted**. This file
 * is that third group. Deleting `prototype.test.ts` without it would drop coverage silently, which is
 * the failure mode the measurement existed to prevent.
 *
 * Everything here drives the REAL submit path — `submitLine` → `deriveLines` → the fold — because a
 * test that reaches past it is a test of a path the product does not ship (#686, and the eight green
 * tests that turned out to describe the retiring bridge).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { hydrateSession, submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();

beforeEach(() => {
  store().resetSession();
  store().setEngine('v2');
});

const figure = (seed = store().seed) => deriveLines(store().lines, seed, seed);
const feed = (lines: readonly string[]): void => {
  for (const l of lines) expect(submitLine(l), `refused «${l}»`).toBe(true);
};
const pt = (d: ReturnType<typeof deriveLines>, name: string) => d.points.find((p) => p.name === name);
const answer = (d: ReturnType<typeof deriveLines>, needle: string) =>
  d.knowledge.find((k) => k.label.includes(needle));

/** docs/27 §2b — the setup paragraph every part builds on. */
const SETUP = ['arg z1 - arg z2 = 90', '|z1| = 9r', '|z2| = 12r', 'z2 ברביע הראשון', 'arg z2 < 45'];

describe('the §2b capstone, END TO END through the submit path', () => {
  /**
   * docs/27 §2b's own gate assertions, which existed only as a prototype test. The exemplar exercises
   * all six corpus archetypes in one question, so this is the single strongest thing in the net.
   */
  it('parts setup + א + ב + ג + ד — the figure answers every part', () => {
    feed([
      ...SETUP,
      '|z1-z2|', // א
      '|z3| = 20r',
      'arg z3 + arg z2 = 0',
      'המרובע Oz1z2z3',
      'שטח Oz1z2z3 הוא 150r^2', // ב given
      'היקף Oz1z2z3', // ב ask
      'z1, z2, z4 סדרה הנדסית', // ג
      'המרובע Oz2z3z4',
      'z^5 = z1*z2^3*z4', // ד
    ]);
    const d = figure();
    expect(d.untranslated).toEqual([]);
    expect(d.unsatisfied).toEqual([]);
    expect(d.contradiction).toBeNull();

    // א — the 9-12-15 triangle, in r as the exam demands
    expect(answer(d, '|z1-z2|')!.value).toBe('15r');
    // ב — the area given pins the free angle to arctan ½, and the perimeter follows
    expect(pt(d, 'z2')!.argumentDeg).toBeCloseTo(26.565, 1);
    expect(answer(d, 'היקף')!.value).toBe('60r');
  });

  it('part ג: z4 is DEFINED by the sequence and rides the parameter — |z4| = 16r', () => {
    feed([...SETUP, '|z3| = 20r', 'arg z3 + arg z2 = 0', 'שטח Oz1z2z3 הוא 150r^2',
      'z1, z2, z4 סדרה הנדסית', '|z4|']);
    // |z4| = |z2|²/|z1| = 144r²/9r = 16r
    expect(answer(figure(), '|z4|')!.value).toBe('16r');
  });

  it('every given holds across CONFIGURATIONS — r stays free end to end (ADR-052)', () => {
    feed([...SETUP, '|z1-z2|']);
    for (const seed of [0, 1, 2, 3]) {
      const d = figure(seed);
      expect(d.unsatisfied, `seed ${seed}`).toEqual([]);
      const a = pt(d, 'z2')!.argumentDeg;
      expect(a, `seed ${seed}`).toBeGreaterThan(0);
      expect(a, `seed ${seed}`).toBeLessThan(45);
      expect(answer(d, '|z1-z2|')!.value, `seed ${seed}`).toBe('15r');
    }
  });
});

describe('the ד equation: an enumeration over a GROUNDED right-hand side', () => {
  it('«z^5 = z1*z2^3*z4» over polar literals enumerates five solutions', () => {
    feed(['z1 = 2cis100', 'z2 = 1cis50', 'z4 = 3cis10', 'z^5 = z1*z2^3*z4']);
    const d = figure();
    expect(d.untranslated).toEqual([]);
    // rhs = 2·1·3 cis(100 + 150 + 10) = 6cis260 → five roots on |z| = 6^(1/5), the first at 52°
    const solutions = d.points.filter((p) => !['z1', 'z2', 'z4'].includes(p.name));
    expect(solutions).toHaveLength(5);
    for (const s of solutions) expect(Math.hypot(s.z.re, s.z.im)).toBeCloseTo(Math.pow(6, 1 / 5), 6);
    expect(Math.min(...solutions.map((s) => s.argumentDeg))).toBeCloseTo(52, 6);
  });

  it('THE EXAM PASTE «Z⁵ = Z₁Z₂³Z₄» is the same utterance (ADR-CX-003 P2)', () => {
    feed(['z1 = 2cis100', 'z2 = 1cis50', 'z4 = 3cis10', 'Z⁵ = Z₁Z₂³Z₄']);
    const d = figure();
    expect(d.untranslated).toEqual([]);
    expect(d.points.filter((p) => !['z1', 'z2', 'z4'].includes(p.name))).toHaveLength(5);
  });
});

describe('the sequence family (F9)', () => {
  it('one unknown listed name is DEFINED by the others — z4 = z2²/z1', () => {
    feed(['z1 = 2', 'z2 = 2i', 'z1, z2, z4 סדרה הנדסית']);
    const z4 = pt(figure(), 'z4')!;
    expect(z4.z.re).toBeCloseTo(-2, 6); // (2i)²/2
    expect(z4.z.im).toBeCloseTo(0, 6);
  });

  it('a FREE listed term is driven to fit', () => {
    feed(['z3 מספר מרוכב', 'z1 = 1', 'z2 = 2i', 'z1, z2, z3 סדרה הנדסית']);
    expect(pt(figure(), 'z3')!.z.re).toBeCloseTo(-4, 6); // (2i)²/1
  });

  it('all terms determined and TRUE: the figure stands', () => {
    feed(['z1 = 1', 'z2 = 2', 'z3 = 4', 'z1, z2, z3 סדרה הנדסית']);
    const d = figure();
    expect(d.contradiction).toBeNull();
    expect(d.unsatisfied).toEqual([]);
  });

  it('all terms determined and FALSE: refused, never a figure that ignores the line', () => {
    feed(['z1 = 1', 'z2 = 2', 'z5 = 5']);
    expect(submitLine('z1, z2, z5 סדרה הנדסית')).toBe(false);
  });

  it('#598 — the keyword-first word orders are the same statement', () => {
    for (const line of [
      'סדרה הנדסית z1,z2,z3',
      'סדרה חשבונית: z1, z2, z3',
      'הסדרה ההנדסית z1,z2,z3',
      'geometric sequence z1,z2,z3',
      'z1, z2, z3 סדרה הנדסית',
      'z1, z2, z3 is an arithmetic sequence',
    ]) {
      store().resetSession();
      store().setEngine('v2');
      expect(submitLine(line), line).toBe(true);
      expect(figure().untranslated, line).toEqual([]);
    }
  });
});

describe('the symbol palette, as DEFINITIONS rather than as parses', () => {
  it('|z|, 1/(z), conj(z)·z, 2·z^2, cis°, the overbar and the superscript all COMPUTE', () => {
    feed(['z1 = 3+4i', 'w1 = |z1|', 'w2 = 1/(z1)', 'w3 = conj(z1)*z1', 'w4 = 2·z1^2',
      'w5 = 1cis90°', 'w6 = z̅1 * i', 'w7 = z1³']);
    const d = figure();
    expect(d.untranslated).toEqual([]);
    const re = (n: string) => pt(d, n)!.z.re;
    const im = (n: string) => pt(d, n)!.z.im;
    expect(re('w1')).toBeCloseTo(5, 6);
    expect(re('w2')).toBeCloseTo(3 / 25, 6);
    expect(im('w2')).toBeCloseTo(-4 / 25, 6);
    expect(re('w3')).toBeCloseTo(25, 6); // z·z̄ = |z|²
    expect(re('w4')).toBeCloseTo(-14, 6);
    expect(im('w4')).toBeCloseTo(48, 6);
    expect(im('w5')).toBeCloseTo(1, 6);
    expect(re('w6')).toBeCloseTo(4, 6); // conj(3+4i)·i = 4+3i
    expect(im('w6')).toBeCloseTo(3, 6);
    expect(re('w7')).toBeCloseTo(-117, 6); // (3+4i)³
    expect(im('w7')).toBeCloseTo(44, 6);
  });

  it('re/im recompose: «w = re(z1) + i*im(z1)» rebuilds z1', () => {
    feed(['z1 = 3+4i', 'w = re(z1) + i*im(z1)']);
    const d = figure();
    expect(pt(d, 'w')!.z.re).toBeCloseTo(3, 6);
    expect(pt(d, 'w')!.z.im).toBeCloseTo(4, 6);
  });

  it('the Hebrew spellings are the same operations', () => {
    feed(['z1 = 2i', 'w = ההופכי של z1']);
    expect(pt(figure(), 'w')!.z.im).toBeCloseTo(-0.5, 6);
  });
});

describe('the panel prints the PARAMETER form, or a plain number', () => {
  it('a quadratic dependence reads r², and a pinned magnitude reads its number', () => {
    feed(['|z1| = 3r', '|z1|*|z1|', 'z2 = 3+4i', '|z2|']);
    const d = figure();
    expect(answer(d, '|z1|*|z1|')!.value).toBe('9r²');
    expect(answer(d, '|z2|')!.value).toBe('5');
  });
});

describe('names outside the z/w convention', () => {
  it('«q מספר מרוכב» declares an ordinary name and draws it', () => {
    feed(['q מספר מרוכב']);
    const d = figure();
    expect(d.untranslated).toEqual([]);
    expect(pt(d, 'q')).toBeDefined();
  });

  it('a free number lands by NAME, not by insertion order — so a figure is reproducible', () => {
    const alone = deriveLines(['q1 מספר מרוכב'], 0, 0);
    const after = deriveLines(['z5 = 1', 'q1 מספר מרוכב'], 0, 0);
    expect(after.points.find((p) => p.name === 'q1')!.z)
      .toEqual(alone.points.find((p) => p.name === 'q1')!.z);
  });
});

describe('save / load, through the real hydration path', () => {
  it('round-trips the capstone: same lines, same figure, seed and overrides restored', () => {
    feed([...SETUP, 'המרובע Oz1z2z3', '|z3| = 20r', 'היקף Oz1z2z3']);
    store().nextConfig();
    store().setFree('z9', { re: 1, im: 2 }); // a stray drag override travels too
    const saved = store().serialize();
    expect(saved.app).toBe('complex-builder');
    const before = figure(saved.seed);

    store().resetSession();
    store().setEngine('v2');
    expect(store().lines).toHaveLength(0);
    expect(hydrateSession(JSON.parse(JSON.stringify(saved)))).toBe(true);

    expect(store().seed).toBe(saved.seed);
    expect(store().freePos).toEqual(saved.freePos);
    // EVERY line survived — a line silently lost on load is #658 arriving through the file dialog
    expect(store().lines).toEqual(saved.lines);

    const after = figure(store().seed);
    expect(after.points.map((p) => [p.name, p.z])).toEqual(before.points.map((p) => [p.name, p.z]));
    expect(after.knowledge).toEqual(before.knowledge);
  });

  it('the SAVED form is the student’s own lines — which is what makes a fixture a drift net', () => {
    feed(['z1 = 2cis(θ)']);
    expect(store().serialize().lines).toEqual(['z1 = 2cis(θ)']);
  });

  it('refuses foreign or corrupt data without touching the session', () => {
    feed(['z1 = 3+4i']);
    expect(hydrateSession({ app: 'geo-builder', lines: [] })).toBe(false);
    expect(hydrateSession('garbage')).toBe(false);
    expect(hydrateSession(null)).toBe(false);
    expect(store().lines).toEqual(['z1 = 3+4i']);
  });
});
