/**
 * #1176 — THE LOCUS IS TRACED AT THE CONFIGURATION BEING SHOWN.
 *
 * Operator, playing PR #1172's T10: *"when pressing show another option, the shape breaks"*, with `P`
 * sitting well off the circle drawn as its own locus.
 *
 * `ask.ts` traced at a hardcoded `[0, 1]` while the figure sits at the session's seed, so from the
 * first press of «הציגו תצורה אחרת» the drawn curve belonged to a different value of `a`. Measured
 * before the fix: the traced circle was **identical at every seed** (centre ≈ (55, 0), r ≈ 86.4) while
 * `P` moved — at seed 2, the operator's screenshot, `P` was 36 units off it.
 *
 * ## The assertion that was missing IS the deliverable
 *
 * All 24 locks in `issue-1136-1137-locus.test.ts` passed throughout. They assert the trace's SHAPE and
 * the determinacy gate's VERDICT — both true — and neither asks the one question that matters on a
 * figure that moves:
 *
 * > **the traced point lies ON its own trace, at the configuration shown, at every seed.**
 *
 * It is invisible without a parameter, because there the locus really is the same set at every seed.
 * So the parameterised figure is not an edge case here — it is the only case that can fail, and every
 * assertion below is built on one.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { locusOf } from '../engine/locus';
import { locusEquation, snapAndVerify } from '../engine/locusFit';
import { fmtAnalytic } from '../format';

/** חורף 25 with the exam's own parameter — the locus is a different circle at every `a`. */
const PARAM_CIRCLE = ['A(-9a,0)', 'B(41a,0)', 'נקודה P', 'PA מאונך ל-PB'];
/** The bisector with a parameter — the locus is the line `x = 4a`. */
const PARAM_LINE = ['A(0,0)', 'B(8a,0)', 'נקודה M', 'MA = MB'];

/** The traced curve's centre and mean radius — an independent measure, not the tool's own fit. */
function circleOf(pts: readonly { x: number; y: number }[]) {
  const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
  const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
  const r = pts.reduce((s, q) => s + Math.hypot(q.x - cx, q.y - cy), 0) / pts.length;
  return { cx, cy, r };
}

/** The locus as the ASK LANE computes it — the path the canvas actually draws from. */
function tracedFor(lines: string[], seed: number, id: string) {
  const d = derive(lines, seed);
  const res = locusOf(d.construction, id, [d.seed, d.seed + 1], d.box);
  const pt = d.figure.points.find((q) => q.id === id);
  return { d, res, pt };
}

describe('#1176 — the point lies on its own locus', () => {
  it('a Derivation carries the seed it was derived at', () => {
    for (const seed of [0, 3, 7]) expect(derive(PARAM_CIRCLE, seed).seed).toBe(seed);
  });

  it('חורף 25 with a parameter: P is ON the drawn circle, at every configuration', () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const { res, pt } = tracedFor(PARAM_CIRCLE, seed, 'P');
      expect(res, `no locus at seed ${seed}`).toBeTruthy();
      expect(pt, `no P at seed ${seed}`).toBeTruthy();
      const { cx, cy, r } = circleOf(res!.trace.points);
      const dist = Math.hypot(pt!.x - cx, pt!.y - cy);
      // Within 2% of the radius — the trace is a polyline, so its mean radius is not exact.
      expect(Math.abs(dist - r), `seed ${seed}: P is ${dist.toFixed(1)} from a circle of r ${r.toFixed(1)}`)
        .toBeLessThan(0.02 * r);
    }
  });

  it('the parameterised bisector: M is ON the traced line, at every configuration', () => {
    for (let seed = 0; seed < 6; seed += 1) {
      const { res, pt } = tracedFor(PARAM_LINE, seed, 'M');
      if (!res) continue; // a configuration with no drawable locus is not this test's business
      const xs = res.trace.points.map((q) => q.x);
      const ys = res.trace.points.map((q) => q.y);
      const along = Math.max(...ys) - Math.min(...ys);
      const across = Math.max(...xs) - Math.min(...xs);
      /**
       * RELATIVE to the trace's own extent, because that is the only scale-free statement.
       *
       * A configuration can place the free point far out — measured, seed 2 of this figure draws the
       * locus over 1600 units while `A` and `B` are 8 apart — and out there `MA = MB` pins `x` only
       * weakly, so the walk drifts a few parts in 10⁵. That is a property of the FIGURE, not of the
       * tracer, and an absolute bar here would be asserting precision the geometry does not have.
       */
      expect(across / along, `seed ${seed}: the trace is not straight`).toBeLessThan(1e-4);
      expect(Math.abs(pt!.x - xs[0]) / along, `seed ${seed}: M is off its own line`).toBeLessThan(1e-4);
    }
  });

  /**
   * ADR-AG-072 §4's OWN STATED SIDE EFFECT, asserted directly: *"«הציגו תצורה אחרת» then makes the
   * circle GROW with `a` on screen."* Before the fix the radius was the same at every seed — the
   * feature's headline behaviour, silently absent, and no test noticed.
   */
  it('successive configurations trace DIFFERENT circles', () => {
    const radii = [0, 1, 2, 3].map((seed) => {
      const { res } = tracedFor(PARAM_CIRCLE, seed, 'P');
      return circleOf(res!.trace.points).r;
    });
    expect(new Set(radii.map((r) => r.toFixed(1))).size, `radii were ${radii.map((r) => r.toFixed(1))}`)
      .toBeGreaterThan(1);
  });

  /**
   * THE COUNTER-DIRECTION — a determinate figure must answer exactly as it did. The fix changes which
   * configuration is traced, and on a figure with no parameter that must make no difference at all.
   */
  it('the determinate answers are unchanged, at seed 0 and elsewhere', () => {
    const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל' };
    const kind = ((k: string) => HE[k] ?? k) as never;
    for (const seed of [0, 1, 3, 4, 5]) {
      expect(
        ask(derive(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], seed), 'המקום הגיאומטרי של M', fmtAnalytic, kind).value,
        `bisector at seed ${seed}`,
      ).toBe('ישר · x = 4');
      expect(
        ask(derive(['A(-9,0)', 'B(41,0)', 'נקודה P', 'PA מאונך ל-PB'], seed), 'המקום הגיאומטרי של P', fmtAnalytic, kind).value,
        `חורף 25 at seed ${seed}`,
      ).toBe('מעגל · (x − 16)² + y² = 25²'); // #1187
    }
  });

  /**
   * SEED 1 IS THE ONE THE COMPARISON FIX BUYS, and it is worth its own case.
   *
   * Its neighbour — seed 2 — is the ill-conditioned configuration below, and before `COMPARE_TRIES`
   * the gate read "one of them has no measurable shape" as "the sets differ" and withheld the equation
   * from a figure that measures perfectly. One bad neighbour poisoning a good answer is the defect;
   * this is the assertion that it no longer does.
   */
  it('a measurable configuration is not poisoned by an unmeasurable NEIGHBOUR', () => {
    const kind = ((k: string) => (k === 'line' ? 'ישר' : k)) as never;
    expect(
      ask(derive(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 1), 'המקום הגיאומטרי של M', fmtAnalytic, kind).value,
    ).toBe('ישר · x = 4');
  });

  /**
   * THE ILL-CONDITIONED CONFIGURATION NOW PRINTS ITS EQUATION — and #1224 is why.
   *
   * This asserted the opposite until #1224, with the note *"asserted so that a future change which
   * starts printing an equation here has to say why"*. Saying why:
   *
   * At seed 2 the figure draws its locus over ~974 units while `A` and `B` sit 8 apart. The old
   * premise was that the snapped `x = 4` *"cannot be re-verified against the trace"* — but that was a
   * consequence of `snapRational`'s ABSOLUTE tolerance, not of the verification. The snap failed
   * first, so nothing ever reached the check.
   *
   * With the snap taken from the trace's own scatter (#1224), the equation reaches verification and
   * **passes it**: measured, the trace's worst deviation from `x = 4` is `1.85e−3` against a
   * verification tolerance of `0.95`. And `x = 4` is the TRUE locus here at every seed — the
   * perpendicular bisector of `(0,0)` and `(8,0)` does not depend on where `M` happens to sit.
   *
   * So the tool is not stating something it could not check; it is now checking something it
   * previously could not reach. The honesty rule — never print an equation that fails the trace — is
   * untouched, and the next test is what holds it.
   */
  it('an ill-conditioned configuration still reaches its TRUE equation (#1224)', () => {
    const kind = ((k: string) => (k === 'line' ? 'ישר' : k)) as never;
    const v = ask(derive(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 2), 'המקום הגיאומטרי של M', fmtAnalytic, kind).value;
    expect(v).toBe('ישר · x = 4');
  });

  it('AND AN EQUATION THAT FAILS THE TRACE IS STILL REFUSED — the rule #1224 did not touch', () => {
    /**
     * The honesty half, asserted directly rather than inferred from a case that happened to fail the
     * snap. `snapAndVerify` re-checks the snapped conic against every point, and a conic that does
     * not describe the trace must come back `null` however loose the snap was.
     */
    const d = derive(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 0);
    const pts = (locusOf(d.construction, 'M', [0, 1], d.box) as ReturnType<typeof locusOf>)?.trace?.points ?? [];
    expect(pts.length, 'the trace exists').toBeGreaterThan(1);
    // `x = 40` is nowhere near this locus; no tolerance may let it through.
    expect(snapAndVerify({ A: 0, B: 0, C: 0, D: 1, E: 0, F: -40 }, pts)).toBeNull();
  });

  /** And the parameterised figure still declines to print an equation, at every seed. */
  it('a parameterised locus still shows the KIND only, at every configuration', () => {
    const kind = ((k: string) => (k === 'circle' ? 'מעגל' : k)) as never;
    for (const seed of [0, 1, 2, 3]) {
      expect(
        ask(derive(PARAM_CIRCLE, seed), 'המקום הגיאומטרי של P', fmtAnalytic, kind).value,
        `seed ${seed}`,
      ).toBe('מעגל');
    }
  });
});

/**
 * #1180's ruling, applied to the surface it did not reach — `locusFit` lives on this branch, so the
 * panel's fix could not touch it. `y = 4/3x + 2` reads as `4/(3x)` exactly as the curve row did.
 */
describe('#1176 — a locus equation carries no fraction as a coefficient', () => {
  it('a fractional slope is cleared from the whole equation', () => {
    const shape = {
      curve: { kind: 'line' as const, a: -4 / 3, b: 1, c: -2 },
      conic: { A: 0, B: 0, C: 0, D: -4 / 3, E: 1, F: -2 },
    };
    expect(locusEquation(shape, fmtAnalytic)).toBe('3y = 4x + 6');
  });

  it('an integer slope is untouched', () => {
    const shape = {
      curve: { kind: 'line' as const, a: -2, b: 1, c: 0 },
      conic: { A: 0, B: 0, C: 0, D: -2, E: 1, F: 0 },
    };
    expect(locusEquation(shape, fmtAnalytic)).toBe('y = 2x');
  });

  /** The two axis-parallel arms are STANDALONE values — nothing follows them, so they keep a fraction. */
  it('a vertical or horizontal locus keeps its exact value', () => {
    const vert = {
      curve: { kind: 'line' as const, a: 1, b: 0, c: -4 / 3 },
      conic: { A: 0, B: 0, C: 0, D: 1, E: 0, F: -4 / 3 },
    };
    expect(locusEquation(vert, fmtAnalytic)).toBe('x = 4/3');
  });
});
