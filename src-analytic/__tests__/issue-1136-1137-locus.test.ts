/**
 * THE LOCUS LANE, V1a — a point the givens leave one degree of freedom draws its מקום גיאומטרי.
 * (#1136 the free point · #1137 the lane · ADR-AG-072)
 *
 * The gates this file keeps are the ones the issue and the ADR name, in their own terms:
 *
 * - a point can be NAMED before it is PLACED, and it genuinely MOVES (the anti-default assertion —
 *   a lock that only checked it exists would pass on a fixed default, which is the conformance smell
 *   CLAUDE.md names);
 * - the tracer draws the RIGHT CURVE, asserted as a geometric PROPERTY (every point on `x = 4`, every
 *   point at distance 25 from (16,0)) rather than as coordinates;
 * - the DETERMINACY GATE both ways — the bisector prints its equation, and חורף 25 **with a
 *   parameter** prints none and says «מעגל»;
 * - the self-check survives: a shape whose coefficients will not snap prints no equation;
 * - «no locus» is an honest answer on a determined figure, and is not confused with «I did not
 *   understand» or «there is no such point».
 *
 * Everything calls `locusOf` / `ask` rather than re-deriving the decision (#1102/#1118). The
 * *instruments* — distance to a centre, spread about a line — are independent arithmetic, which is
 * the point of them.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { drawnLoci } from '../app/answers';
import { derive } from '../engine/derive';
import { locusOf } from '../engine/locus';
import { parseLine } from '../parser/parseAnalytic';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' };
const answer = (lines: string[], question: string) =>
  ask(derive(lines, 0), question, fmt, ((k: string) => HE[k] ?? k) as never);

const BISECTOR = ['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'];
/** חורף 25 — the circle on diameter AB, from ∠APB = 90°. */
const WINTER25 = ['A(-9,0)', 'B(41,0)', 'נקודה P', 'PA מאונך ל-PB'];

// ---------------------------------------------------------------------------
// #1136 — a point may be NAMED before it is PLACED
// ---------------------------------------------------------------------------

describe('#1136 — «נקודה M» declares a free point', () => {
  /** Every spelling from the issue's own table, all six of which were `not-handled`. */
  it.each([
    'נקודה M',
    'נתונה נקודה M',
    'M היא נקודה',
    'M נקודה',
    'הנקודה M',
    'קדקוד M',
    'point M',
    'a point M',
  ])('«%s» parses to a declaration', (line) => {
    const r = parseLine(line);
    expect(r.ok, `${line} was refused`).toBe(true);
    if (r.ok) expect(r.facts.map((f) => f.t)).toEqual(['declare']);
  });

  /**
   * THE ANTI-DEFAULT ASSERTION (#1136's own lock, ADR-052).
   *
   * A point that exists but never moves is a fixed default masquerading as a free DOF — the thing
   * CLAUDE.md calls the conformance smell. Two different seeds must place it in two different places.
   */
  it('is a genuine free point — 2 DOF, and it MOVES between configurations', () => {
    const at = (seed: number) => {
      const d = derive(['נקודה M'], seed);
      expect(d.faults).toEqual([]);
      const p = d.figure.points.find((q) => q.id === 'M');
      expect(p, `M absent at seed ${seed}`).toBeTruthy();
      return { p: p!, dof: d.figure.carrierDof };
    };
    const a = at(0);
    const b = at(1);
    expect(a.dof).toBe(2);
    expect(Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y)).toBeGreaterThan(1e-6);
  });

  /** A later given PINS it, and the figure becomes determined rather than merely tidier. */
  it('a given that determines it, determines it', () => {
    const d = derive([...BISECTOR, 'MA = 5'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.carrierDof).toBe(0);
    const m = d.figure.points.find((q) => q.id === 'M')!;
    expect(Math.hypot(m.x, m.y)).toBeCloseTo(5, 6);
  });

  /**
   * The CLASS check (#1136's plan): the neighbouring nouns were measured at the same time. A circle
   * could already be named before being placed; a LINE still cannot, and that is filed rather than
   * folded in — a free line has no object kind and no `carrierOf` row, so it is engine work.
   *
   * Asserted so the split is visible rather than forgotten: if «ישר k» starts parsing, this is the
   * test that says the other half arrived.
   */
  it('the sibling nouns: a circle may be declared unplaced; a LINE still may not (filed)', () => {
    expect(parseLine('מעגל O').ok).toBe(true);
    expect(parseLine('ישר k').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #1137 — the tracer
// ---------------------------------------------------------------------------

describe('#1137 — the tracer walks the figure’s remaining freedom', () => {
  it('the perpendicular bisector traces the line x = 4 — asserted as a PROPERTY', () => {
    const d = derive(BISECTOR, 0);
    const res = locusOf(d.construction, 'M', [0, 1], d.box);
    expect(res).toBeTruthy();
    expect(res!.trace.points.length).toBeGreaterThan(20);
    // EVERY traced point is equidistant from A and B, and sits on x = 4.
    for (const p of res!.trace.points) {
      expect(Math.hypot(p.x - 0, p.y - 0)).toBeCloseTo(Math.hypot(p.x - 8, p.y - 0), 4);
      expect(p.x).toBeCloseTo(4, 4);
    }
  });

  it('חורף 25 traces the circle on diameter AB — every point 25 from (16, 0)', () => {
    const d = derive(WINTER25, 0);
    const res = locusOf(d.construction, 'P', [0, 1], d.box);
    expect(res).toBeTruthy();
    expect(res!.trace.points.length).toBeGreaterThan(20);
    for (const p of res!.trace.points) {
      expect(Math.hypot(p.x - 16, p.y)).toBeCloseTo(25, 3);
    }
    // A circle CLOSES — the walk came back, which is what tells an ellipse from a parabola.
    expect(res!.trace.closed).toBe(true);
  });

  /**
   * A DETERMINED figure has no locus, and an UNCONSTRAINED point has no locus either — for opposite
   * reasons, and both must be `null` rather than a curve.
   *
   * The second is the one worth stating: a 2-DOF point can go anywhere in the plane, and drawing a
   * one-dimensional trace through a two-dimensional family would assert a locus the givens never
   * described.
   */
  it('no locus where there is none — determined, and unconstrained', () => {
    const det = derive([...BISECTOR, 'MA = 5'], 0);
    expect(locusOf(det.construction, 'M', [0, 1], det.box)).toBeNull();

    const open = derive(['נקודה M'], 0);
    expect(locusOf(open.construction, 'M', [0, 1], open.box)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The determinacy gate — the honesty boundary of the whole feature
// ---------------------------------------------------------------------------

describe('#1137 — the determinacy gate (ADR-AG-072 §4, §5)', () => {
  it('the bisector is determinate: «ישר» AND its equation', () => {
    const a = answer(BISECTOR, 'המקום הגיאומטרי של M');
    expect(a.unreadable).toBeUndefined();
    expect(a.value).toBe('ישר · x - 4 = 0');
    expect(a.locus!.points.length).toBeGreaterThan(20);
  });

  it('חורף 25 is determinate: «מעגל» AND (x − 16)² + y² = 25² (#1187 — was 625)', () => {
    const a = answer(WINTER25, 'המקום הגיאומטרי של P');
    // #1187, operator's T31: «the radius in equation should show as 25^2 and not 625» — the row's
    // job is to say what the circle IS, and 625 makes the student take a square root to find out.
    expect(a.value).toBe('מעגל · (x − 16)² + y² = 25²');
  });

  /**
   * THE NEGATIVE HALF, and the reason the gate exists at all.
   *
   * With a PARAMETER in the givens the locus is a different circle at every configuration —
   * `(x − 16a)² + y² = 625a²` — and reaching that would mean recognising a symbolic dependence
   * across samples, which is the CAS boundary this tree does not cross. So: the KIND, which IS
   * invariant and IS what the exam asks to show, and **no equation**.
   *
   * Operator: *"only if we are positive about the equation we show it. otherwise, we stick to
   * showing the shape."*
   */
  it('חורף 25 WITH A PARAMETER: «מעגל», and no equation', () => {
    const a = answer(['A(-9a,0)', 'B(41a,0)', 'נקודה P', 'PA מאונך ל-PB'], 'המקום הגיאומטרי של P');
    expect(a.value).toBe('מעגל');
    // The KIND is shown, so the curve is still drawn — a shape-only answer is an answer.
    expect(a.locus!.points.length).toBeGreaterThan(20);
  });

  it('a parameterised bisector, likewise: «ישר» with no equation', () => {
    const a = answer(['A(0,0)', 'B(8a,0)', 'נקודה M', 'MA = MB'], 'המקום הגיאומטרי של M');
    expect(a.value).toBe('ישר');
  });

  /**
   * The self-check's own statement: an equation is printed ONLY as part of a value that also names
   * the kind, and never on its own. A row reading just «(x − 16)² + y² = 625» with no family would
   * be the tool asserting more than it checked.
   */
  it('an equation never appears without the kind that was verified with it', () => {
    for (const fig of [BISECTOR, WINTER25]) {
      const v = answer(fig, `המקום הגיאומטרי של ${fig === BISECTOR ? 'M' : 'P'}`).value!;
      expect(v.startsWith('ישר') || v.startsWith('מעגל')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The ask lane's own contract
// ---------------------------------------------------------------------------

describe('#1137 — the ask lane', () => {
  it('reads the Hebrew and the English, with and without «של»', () => {
    for (const q of ['המקום הגיאומטרי של M', 'המקום הגיאומטרי M', 'locus of M', 'the locus of M']) {
      expect(answer(BISECTOR, q).value, q).toBe('ישר · x - 4 = 0');
    }
  });

  /**
   * THE THREE FAILURES ARE THREE DIFFERENT ANSWERS (#1111's rule, applied here).
   *
   * «no such point» is not «no locus» is not «I did not understand» — and a student told the wrong
   * one will rewrite a sentence that was never the problem.
   */
  it('a point the figure does not have is MISSING, not unreadable', () => {
    const a = answer(BISECTOR, 'המקום הגיאומטרי של Z');
    expect(a.missing).toEqual({ name: 'Z', kind: 'point' });
    expect(a.unreadable).toBeUndefined();
    expect(a.locus).toBeUndefined();
  });

  it('a determined point has no locus — an open answer, not a refusal', () => {
    const a = answer([...BISECTOR, 'MA = 5'], 'המקום הגיאומטרי של M');
    expect(a.value).toBeNull();
    expect(a.unreadable).toBeUndefined();
    expect(a.missing).toBeUndefined();
    expect(a.locus).toBeUndefined();
  });

  /**
   * An ask NEVER mutates the figure (02c R24) — the locus is decoration, exactly like the #1048
   * perpendicular: no id, no letter, never in the fact list.
   */
  it('asking for a locus changes nothing about the figure', () => {
    const before = derive(BISECTOR, 0);
    answer(BISECTOR, 'המקום הגיאומטרי של M');
    const after = derive(BISECTOR, 0);
    expect(after.construction.objects.length).toBe(before.construction.objects.length);
    expect(after.figure.points.map((p) => p.id)).toEqual(before.figure.points.map((p) => p.id));
  });

  /**
   * The trace rides ADR-AG-067's `shown` lifetime rather than inventing a fourth rule — the same
   * flag the perpendicular uses, so «click the entry again» hides a locus exactly as it hides a
   * height, and the ROW stays either way.
   */
  it('a hidden locus leaves the panel row and leaves the canvas', () => {
    const a = answer(BISECTOR, 'המקום הגיאומטרי של M');
    expect(drawnLoci([a])).toHaveLength(1);
    expect(drawnLoci([{ ...a, shown: false }])).toHaveLength(0);
    // The label the canvas draws is the answer's own value, so the two cannot disagree.
    expect(drawnLoci([a])[0].label).toBe('ישר · x - 4 = 0');
  });
});
