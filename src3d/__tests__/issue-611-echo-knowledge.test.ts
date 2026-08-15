/**
 * Issue #611 (ADR-3D-157) — P1: a DERIVED line's echo may print numbers only when they are KNOWLEDGE.
 *
 * Operator, playing round #596: on a pyramid `SABC` with planes `ABC` and `SBC` and their intersection
 * line, the canvas printed «ℓ: x = (0.678, 0.467, 0) + t·(-0.568, 0.823, 0)» while the app's own status
 * line read «דרגות חופש שטרם נקבעו: 5». Those are one sample of an under-determined figure, shown as
 * the given — the canvas honesty rule, inverted:
 *
 *   > a number drawn on the canvas must be seed-invariant knowledge. One drawing's values are not a
 *   > given, and printing them is dishonest.  (src3d/CLAUDE.md)
 *
 * Root cause: the echo's honesty gate was an ENUMERATION OF LINE KINDS, not a rule. Two branches
 * existed — free lines (#552) and symbolic parametric lines (#371/#479) — each added by a report, each
 * bound to a code path. Every kind nobody wrote a branch for (`plane-plane`, `through`, `common-perp`,
 * `line-projection`) printed sampled numbers unconditionally. So this file locks THE CLASS: the
 * property that no line form on an under-determined figure contains a digit, not four examples.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { freeDofCount3 } from '../engine/evaluate';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, planeDisplay: {}, queries: [] });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

function scene(seed = 0) {
  const d = derive3(state().facts, seed);
  return { d, scene: buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1, {}, true) };
}
/** Every line's echo text. */
const forms = (seed = 0) => scene(seed).scene.lines.map((l) => l.form);
const HAS_DIGIT = /\d/;

describe("#611 — the operator's exact figure", () => {
  beforeEach(reset);

  const build = () => {
    submit('פירמידה SABC');
    submit('מישור ABC');
    submit('מישור SBC');
    submit('ℓ ישר החיתוך בין המישור ABC ובין המישור SBC');
  };

  it('the intersection line echoes its NAME only — never one configuration\'s numbers', () => {
    build();
    expect(state().lastError).toBeNull();
    const f = forms();
    expect(f, 'the line is drawn').toHaveLength(1);
    expect(f[0]).toBe('ℓ');
  });

  it('the figure really is under-determined — the precondition the report rests on', () => {
    build();
    const { d } = scene();
    expect(freeDofCount3(d.construction, d.resolved)).toBeGreaterThan(0);
  });

  it('and it stays a bare name at every seed (the value would have MOVED — that is the whole point)', () => {
    build();
    for (let seed = 0; seed < 4; seed++) {
      expect(forms(seed), `seed ${seed}`).toEqual(['ℓ']);
    }
  });

  it('the planes and the line are still DRAWN — suppressing the numbers hides nothing else', () => {
    build();
    const s = scene().scene;
    expect(s.lines.length, 'the line is on the canvas').toBe(1);
    expect(s.planes.length, 'both planes are on the canvas').toBeGreaterThanOrEqual(2);
  });
});

describe('#611 — the CLASS: every derived line kind, not just the reported one', () => {
  beforeEach(reset);

  /** Each row leaves an under-determined figure carrying derived lines of that kind. */
  const CASES: [string, string[]][] = [
    ['plane-plane', ['פירמידה SABC', 'מישור ABC', 'מישור SBC', 'ℓ ישר החיתוך בין המישור ABC ובין המישור SBC']],
    // the projection rule creates the `through` line AS as a side effect, so this row covers BOTH kinds
    ['through + line-projection', ["תיבה ABCDA'B'C'D'", "BE היטל הישר A'C על המישור ABCD"]],
    ['common-perp (+ its two through lines)', ["תיבה ABCDA'B'C'D'", 'הישר d מאונך לישר AB ולישר CD']],
  ];

  for (const [kind, steps] of CASES) {
    it(`a ${kind} line prints NO digits while the figure has free DOF`, () => {
      reset();
      for (const u of steps) submit(u);
      expect(state().lastError, `precondition: «${steps[steps.length - 1]}» must build`).toBeNull();
      const { d } = scene();
      expect(freeDofCount3(d.construction, d.resolved), 'precondition: under-determined').toBeGreaterThan(0);
      // the assertion below is only meaningful if lines actually EXIST — an empty list would pass
      // vacuously, which is precisely how a class test lies
      expect(forms().length, 'precondition: the figure really carries derived lines').toBeGreaterThan(0);
      for (const form of forms()) {
        expect(HAS_DIGIT.test(form), `«${form}» asserts sampled numbers as a given`).toBe(false);
      }
    });
  }

  it('the PROPERTY that closes the class: no line form carries a digit on any under-determined figure', () => {
    // stated as a property rather than as four examples — a line kind added later is covered by
    // construction, which is exactly what the two kind-bound branches failed to do
    let checked = 0;
    for (const [, steps] of CASES) {
      reset();
      for (const u of steps) submit(u);
      const { d } = scene();
      if (freeDofCount3(d.construction, d.resolved) === 0) continue;
      for (const form of forms()) {
        checked++;
        expect(HAS_DIGIT.test(form)).toBe(false);
      }
    }
    expect(checked, 'the property swept real line forms, not an empty corpus').toBeGreaterThan(3);
  });
});

describe('#611 — what must NOT change: a STATED given is echoed verbatim', () => {
  beforeEach(reset);

  it('a numeric parametric line the student typed keeps its numbers, DOF or no DOF', () => {
    submit('פירמידה SABC'); // leaves the figure under-determined on purpose
    submit('הישר ℓ: x = (0,7,6) + t(0,2,1)');
    expect(state().lastError).toBeNull();
    const f = forms().find((x) => x.startsWith('ℓ'));
    expect(f, 'the student typed these numbers — they are their given, not a sample').toContain('(0, 7, 6)');
  });

  it('a SYMBOLIC parametric line still echoes the student\'s own form (#371/#479 unchanged)', () => {
    submit('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)');
    expect(state().lastError).toBeNull();
    const f = forms().find((x) => x.startsWith('ℓ'));
    expect(f, 'the symbolic src, not one value of m').toContain('m');
  });

  it('a DETERMINED absolute figure DOES print its derived line\'s numbers — this is not a blanket ban', () => {
    submit('A(0,0,0)');
    submit('B(4,0,0)');
    submit('C(0,3,0)');
    submit('הישר d מאונך לישר AB ולישר AC'); // creates through-lines AB, AC + the common perpendicular
    expect(state().lastError).toBeNull();
    const { d } = scene();
    expect(freeDofCount3(d.construction, d.resolved), 'precondition: nothing left free').toBe(0);
    expect(forms().some((f) => HAS_DIGIT.test(f)), 'forced numbers ARE knowledge and come back').toBe(true);
  });

  it('a free LINE still shows only its name (#552 — the branch this rule generalises)', () => {
    submit('פירמידה SABC');
    submit('ישר k');
    expect(forms()).toContain('k');
  });
});
