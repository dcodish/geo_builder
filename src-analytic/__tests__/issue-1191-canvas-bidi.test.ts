/**
 * #1191 — THE CANVAS GETS A BIDI CHOKEPOINT, SO A LABEL CANNOT REORDER A NUMBER.
 *
 * Operator, playing the locus lane (PR #1172): a perpendicular bisector of `A(0,0)`–`B(6,8)` drawn
 * dashed and labelled
 *
 * ```
 * 4 · ישר y = −3x + 25        ← what the student READ
 * ישר · 4y = −3x + 25        ← what the tool computed
 * ```
 *
 * The geometry, the tracer and the determinacy gate were all correct: `3x + 4y = 25` IS the bisector,
 * and the drawn `M` sits on it. **This was display only** — and it is the class `Figure.tsx`'s own
 * header comment calls *"the worst class of bug this tool can have"*: the canvas silently lying about
 * a number.
 *
 * The root `<svg>` is LTR, the `·` sits between a Hebrew word and a European Number, and UBA N1/I1
 * lift the digit above the base level. Only an equation that STARTS with a digit scrambles, which is
 * why the locus lane's circle demo survived the build:
 *
 * | locus | equation | first char | rendered |
 * | --- | --- | --- | --- |
 * | circle | `(x − 16)² + y² = 625` | `(` then `x` | correct |
 * | parabola | `y² = 8x` | `y` | correct |
 * | line, unit `y` | `x = 4` | `x` | correct |
 * | **line, non-unit `y`** | **`4y = −3x + 25`** | **`4`** | **scrambled** |
 *
 * ## What is asserted, and why it is not a reproduction
 *
 * The expected string is never spelled out here — it is the kit's own `isolateLtrRuns` applied to the
 * value the ask lane produced. So this asserts the canvas and the panel AGREE about one string, which
 * is the actual invariant; change the isolation algorithm and both move together, drop it on the
 * canvas and only one does (ADR-W-053).
 *
 * The second describe is the CLASS rather than the reported label: `measures[].label` is fed from the
 * same `Answer.value` through the same `<text>` and is one Hebrew word away from the identical defect.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { drawnLoci } from '../app/answers';
import { derive } from '../engine/derive';
import { buildScene, type SceneKnowledge } from '../render/scene';
import { analyticBidi } from '../i18n/bidi';

const LRI = '⁦';
const PDI = '⁩';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const HE: Record<string, string> = {
  line: 'ישר',
  circle: 'מעגל',
  parabola: 'פרבולה',
  ellipse: 'אליפסה',
};

/** The operator's own figure. Seed 1 is where the equation prints — seed 0 withholds it (#1182). */
const OPERATOR = ['A(0,0)', 'B(6,8)', 'נקודה M', 'MA = MB'];

/** The whole reported path: derive → ask → the drawn-loci reading → the scene. */
const locusLabelOnCanvas = (lines: string[], seed: number, who: string) => {
  const d = derive(lines, seed);
  const a = ask(d, `המקום הגיאומטרי של ${who}`, fmt, ((k: string) => HE[k] ?? k) as never);
  const loci = drawnLoci([a]);
  const scene = buildScene(d.figure, d.box, 600, 400, { loci });
  return { value: a.value ?? null, label: scene.loci[0]?.label?.text ?? null };
};

describe('#1191 — the reported label', () => {
  it('the locus label on the canvas is ISOLATED, and says what the panel says', () => {
    const { value, label } = locusLabelOnCanvas(OPERATOR, 1, 'M');
    expect(value, 'the configuration that prints an equation').toBe('ישר · 4y = −3x + 25');
    expect(label, 'the canvas must isolate the run the panel already isolates').toBe(
      analyticBidi.isolateLtrRuns(value as string),
    );
    expect(label, 'an LTR run inside an RTL label needs a real isolate').toContain(LRI);
    expect(label).toContain(PDI);
  });

  /**
   * The isolate must WRAP THE RUN, not the whole string: the Hebrew word belongs to the RTL
   * paragraph. If it opened before «ישר» the label would lay out left-to-right as a whole, which is a
   * different bug wearing the same fix.
   */
  it('the isolate opens at the run, leaving the Hebrew word outside it', () => {
    const { label } = locusLabelOnCanvas(OPERATOR, 1, 'M');
    expect(label!.indexOf(LRI), 'the isolate must not open at the start of the label').toBeGreaterThan(0);
    expect(label!.slice(0, label!.indexOf(LRI))).toBe('ישר ');
    expect(label!.endsWith(PDI)).toBe(true);
  });

  /**
   * THE REASON THIS SURVIVED THE BUILD. An equation beginning with a strong-L character RENDERS
   * correctly with or without the isolate, so a lock written against the circle demo would have
   * passed on the broken code — which is exactly what happened to the locus lane’s own 24 locks.
   *
   * The isolate is still applied here (the label mixes scripts, so the kit wraps the run): the point
   * is that this case could never have CAUGHT the bug, not that it is exempt from the fix.
   */
  it('the axis-parallel case is isolated too, though it read correctly without it', () => {
    const { value, label } = locusLabelOnCanvas(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 0, 'M');
    expect(value).toBe('ישר · x = 4');
    expect(label).toBe(analyticBidi.isolateLtrRuns(value as string));
  });
});

/**
 * THE CLASS, not the one label. `buildScene` is the single place every canvas label is produced, so
 * the assertion is about the chokepoint: whatever text reaches a label channel comes out isolated.
 * A label channel added later and wired straight through fails here.
 */
describe('#1191 — every canvas label channel goes through the chokepoint', () => {
  const HEBREW_THEN_NUMBER = 'מרחק · 4y = −3x + 25';

  const knows: SceneKnowledge = {
    marks: [{ from: { x: 0, y: 0 }, foot: { x: 3, y: 4 }, label: HEBREW_THEN_NUMBER }],
    loci: [
      {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
        closed: false,
        label: HEBREW_THEN_NUMBER,
      },
    ],
  };

  const scene = () => {
    const d = derive(['A(0,0)', 'B(6,8)'], 0);
    return buildScene(d.figure, d.box, 600, 400, knows);
  };

  it.each([
    ['a locus label', () => scene().loci[0]?.label?.text],
    ['a measure label', () => scene().measures[0]?.label?.text],
  ])('%s is isolated', (_what, read) => {
    const text = read();
    expect(text, 'the channel must produce a label at all, or this asserts nothing').toBeTruthy();
    expect(text).toBe(analyticBidi.isolateLtrRuns(HEBREW_THEN_NUMBER));
    expect(text).toContain(LRI);
  });

  /**
   * A label that is ALREADY a single LTR run has nothing to isolate, and must come through unchanged —
   * the kit's own rule (a bare run is not wrapped). Asserted so "isolate everything" can never be
   * mistaken for "wrap everything", which would put controls into strings that do not need them.
   */
  it('a pure-LTR label is left alone', () => {
    const d = derive(['A(0,0)', 'B(6,8)'], 0);
    const s = buildScene(d.figure, d.box, 600, 400, {
      loci: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false, label: '4y = −3x + 25' }],
    });
    expect(s.loci[0]?.label?.text).toBe('4y = −3x + 25');
  });
});
