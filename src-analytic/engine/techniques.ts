/**
 * THE TECHNIQUE TABLE — how a row was reached, in the words a teacher writes on a board (#1053).
 *
 * Operator, 2026-09-15: *"when I select to see a distance or an equation of a line, I want the
 * relevant formula to be shown on screen, so we don't just show the result — we show what to use to
 * get to this result."*
 *
 * ## The level, ruled by the operator
 *
 * The issue offered three, and he chose the second (*"1053 - yes - b is correct"*):
 *
 *   1. the formula alone — `d = √((x₂−x₁)² + (y₂−y₁)²)`
 *   2. **the formula with THIS figure's values substituted** — `d = √((4−1)² + (5−1)²)`
 *   3. the arithmetic worked through — `= √(9+16) = 5`
 *
 * (3) is the tool doing the student's homework. **(2) is where the teaching is**: seeing *their*
 * numbers in the general form is the step a student actually gets wrong, and it is still not the
 * working that earns the marks.
 *
 * ## Authored, not generated — and that is the load-bearing part
 *
 * [docs/19 §4b](../../docs/19-analytic-geometry-tool.md) specified this substrate when it deferred
 * the feature: *"an authored technique table … teacher knowledge, not engine knowledge"*. The formula
 * a teacher writes is what a student must reproduce for marks. Rendering one out of the code would
 * produce something correct and **unlike anything in their notebook** — the engine computes a
 * distance from a residual and a solve, not from `√((x₂−x₁)² + (y₂−y₁)²)`, and a trace derived from
 * the code would show the machine's route rather than the subject's.
 *
 * So each entry below is written by hand, and `integrity.test.ts` binds the table to the rules that
 * keep it honest rather than to the implementation.
 *
 * ## The boundary it must not cross
 *
 * [docs/19 §9](../../docs/19-analytic-geometry-tool.md): *"The trace must EXPLAIN, never PLAN. It
 * answers 'how was THIS reached', over a row already on screen. It must not answer 'how COULD you
 * reach X' for something not yet determined — that is a planner, and it grows by increments."*
 *
 * Every function here takes values the figure already determined and formats them. None searches,
 * none suggests, and none runs unless a row exists.
 */
import type { Id } from './types';
import { isVertical } from './lines';

/** A point as the trace needs it: a name and the coordinates the figure fixed. */
export interface TracePoint {
  id: Id;
  x: number;
  y: number;
}

export interface Technique {
  /** Stable id, for the integrity test and for a future catalog. */
  id: string;
  /** What kind of row this explains. */
  target: 'distance-2pt' | 'line-2pt' | 'point-line';
  /** The Hebrew name a teacher would use for the move. */
  he: string;
  /**
   * The GENERAL formula, exactly as the subject writes it. Authored; never derived from the code.
   * Kept beside the substitution so the two can never drift into different shapes.
   */
  formula: string;
}

/**
 * The moves this tool can explain so far.
 *
 * Deliberately short. The operator named two — a distance and a line's equation — and those are the
 * two the ask lane can already be asked for. `point↔line distance` and `slope` are named in the
 * issue and are NOT here, because neither has a surface that asks for it yet: the first arrives with
 * #1048's click-to-measure, the second is shown in the panel rather than asked. Adding entries for
 * rows nobody can request would be authoring against a guess.
 */
export const TECHNIQUES: readonly Technique[] = [
  {
    id: 'distance-2pt',
    target: 'distance-2pt',
    he: 'המרחק בין שתי נקודות',
    formula: 'd = √((x₂-x₁)² + (y₂-y₁)²)',
  },
  {
    id: 'line-2pt',
    target: 'line-2pt',
    he: 'משוואת הישר העובר דרך שתי נקודות',
    formula: 'y - y₁ = m(x - x₁),  m = (y₂-y₁)/(x₂-x₁)',
  },
  {
    id: 'point-line',
    target: 'point-line',
    he: 'המרחק מנקודה לישר',
    formula: 'd = |Ax₀ + By₀ + C| / √(A² + B²)',
  },
];

export const techniqueFor = (target: Technique['target']): Technique | undefined =>
  TECHNIQUES.find((t) => t.target === target);

/**
 * A signed term as it belongs INSIDE a formula: `4 - 1`, but `4 - (-1)` when the value is negative.
 *
 * The parentheses are not decoration. `(y₂−y₁)` with `y₁ = −3` is written `5 − (−3)` in every
 * textbook, and printing `5 − −3` is the single most common way a substituted formula stops looking
 * like the one in the student's notebook.
 */
const minus = (a: number, b: number, fmt: (v: number) => string): string =>
  `${fmt(a)} - ${b < 0 ? `(${fmt(b)})` : fmt(b)}`;

/**
 * The distance between two points, with THIS figure's numbers in the general form.
 *
 * Level (2): substituted, never evaluated. The student reads their own coordinates sitting in the
 * formula they have to reproduce, and does the arithmetic themselves.
 */
export function traceDistance2pt(a: TracePoint, b: TracePoint, fmt: (v: number) => string): string {
  return `d = √((${minus(b.x, a.x, fmt)})² + (${minus(b.y, a.y, fmt)})²)`;
}

/**
 * The line through two points, with this figure's numbers in it.
 *
 * The slope is shown substituted too, because it is the half a student is asked to produce first and
 * the half they most often get upside down. A VERTICAL line has no slope, and saying so is the
 * honest trace — the formula does not apply, and pretending otherwise by printing a division by zero
 * would teach the wrong thing.
 */
export function traceLine2pt(a: TracePoint, b: TracePoint, fmt: (v: number) => string): string {
  // #1276: RELATIVELY, through the one shared answer — an absolute `|Δx| < 1e-12` let a solved foot's
  // 3.6e-9 of residual through and printed `m = (0 - 6) / (1 - 1) = -1663960853.8`.
  if (isVertical(b.x - a.x, b.y - a.y)) {
    return `x = ${fmt(a.x)}  (הישר אנכי — אין שיפוע)`;
  }
  /**
   * THE INTERMEDIATE IS EVALUATED, AND EACH STATEMENT GETS ITS OWN ROW (#1221).
   *
   * Operator, 2026-09-19, playing T25: *"never include more than 2 equations in a line. the m= should
   * have a final answer there."*
   *
   * This trace was the only one with an INTERMEDIATE quantity, and it never stated its value
   * anywhere. `m` is not the answer — the answer is the line's equation — and the second step then
   * consumed it symbolically, so the student was shown `y - 0 = m(x - 0)` and never told what `m`
   * was, on any surface. The trace handed the last step back to them, which is the one thing #1053
   * built it not to do.
   *
   * The rule that gives this a stopping point, because "show more working" has none of its own:
   * **an intermediate the next step consumes is evaluated; a final value already shown in the answer
   * row is not repeated.** Under it the two distance traces are already correct and stay untouched —
   * their result is the answer row directly above them.
   *
   * `m`'s value is substituted into the second step rather than left as a letter, which is what a
   * textbook does once it is known and removes the last unresolved symbol from the working.
   */
  const m = (b.y - a.y) / (b.x - a.x);
  const slope = `m = (${minus(b.y, a.y, fmt)}) / (${minus(b.x, a.x, fmt)}) = ${fmt(m)}`;
  /**
   * A SUBSTITUTED SLOPE IS BRACKETED WHEN IT WOULD OTHERWISE BE AMBIGUOUS.
   *
   * `4/3(x - 0)` reads as `4/(3(x - 0))` at least as naturally as `(4/3)(x - 0)` — #1180's ambiguity
   * exactly, ruled on for the panel's line rows and applying here for the same reason. A negative
   * needs the brackets too, or `y - 0 = -2(x - 0)` is fine but `= (-2)` is clearer beside a minus.
   */
  const shown = fmt(m);
  const coef = shown.includes('/') || m < 0 ? `(${shown})` : shown;
  // `a.y < 0`, not `b.y` — this asked the WRONG point and printed «y - (0)» for A(0,0), B(3,-6).
  const point = `y - ${a.y < 0 ? `(${fmt(a.y)})` : fmt(a.y)} = ${coef}(x - ${a.x < 0 ? `(${fmt(a.x)})` : fmt(a.x)})`;
  // The separator is a NEWLINE, not a comma: two statements, two rows (#1125 already called them two).
  return `${slope}\n${point}`;
}

/**
 * The distance from a point to a line, with this figure's numbers in the general form (#1048).
 *
 * ADR-AG-062 deliberately left this entry unauthored while nothing could ask for it; #1048 gives it
 * a surface, so it joins the table now rather than as a guess made earlier.
 *
 * The line's coefficients are shown AS THE FIGURE HOLDS THEM. A student reading
 * `|3·2 + (-4)·5 + 1| / √(3² + (-4)²)` can check every symbol against the equation on their page,
 * which is the whole point of substituting rather than stating.
 */
export function tracePointLine(
  p: TracePoint,
  line: { a: number; b: number; c: number },
  name: string,
  fmt: (v: number) => string,
): string {
  const co = (v: number) => (v < 0 ? `(${fmt(v)})` : fmt(v));
  const plus = (v: number) => `${v < 0 ? '- ' : '+ '}${fmt(Math.abs(v))}`;
  return (
    `d(${p.id}, ${name}) = |${co(line.a)}·${co(p.x)} ${line.b < 0 ? '-' : '+'} ` +
    `${fmt(Math.abs(line.b))}·${co(p.y)} ${plus(line.c)}| / √(${co(line.a)}² + ${co(line.b)}²)`
  );
}

/**
 * THE ANGLE AT A VERTEX, WITH ITS WORKING (#1409) — the operator's 2026-09-27 ruling, verbatim:
 * *"if its an angle where m=tanx would work, use that, if not, use law of cosine"*.
 *
 * - **Slope method** whenever it works: both arms have a defined slope (neither vertical) and
 *   1 + m₁m₂ ≠ 0 (not perpendicular). The formula yields the ACUTE angle between the lines; when
 *   ∠XVY is obtuse the trace adds the «180° − α» step, so the working always ends on the answer.
 * - **Law of cosines** otherwise (a vertical arm, or perpendicular arms): the three lengths, then
 *   cos∠XVY = (a² + b² − c²)/(2ab).
 *
 * The value is the caller's (the same `angleAt` the residual constrains); only the WORKING is
 * built here, per statement per row (#1221), substituted at the level the operator ruled (#1053).
 * Null when a ray has no length — a zero-length arm has no angle and no honest working.
 */
export function traceAngle(v: TracePoint, a: TracePoint, b: TracePoint, deg: number, fmt: (n: number) => string): string | null {
  const dx1 = a.x - v.x;
  const dy1 = a.y - v.y;
  const dx2 = b.x - v.x;
  const dy2 = b.y - v.y;
  if (Math.hypot(dx1, dy1) < 1e-12 || Math.hypot(dx2, dy2) < 1e-12) return null;
  const name = `∠${a.id}${v.id}${b.id}`;
  if (!isVertical(dx1, dy1) && !isVertical(dx2, dy2)) {
    const m1 = dy1 / dx1;
    const m2 = dy2 / dx2;
    const denom = 1 + m1 * m2;
    // #1276's rule: relative, never a raw epsilon on a magnitude-carrying number
    if (Math.abs(denom) > 1e-9 * Math.max(1, Math.abs(m1 * m2))) {
      const tanTheta = Math.abs((m1 - m2) / denom);
      const acute = (Math.atan(tanTheta) * 180) / Math.PI;
      const rows = [
        `m(${v.id}${a.id}) = ${fmt(m1)}, m(${v.id}${b.id}) = ${fmt(m2)}`,
        `tan α = |(m₁ - m₂)/(1 + m₁·m₂)| = |(${fmt(m1)} - (${fmt(m2)}))/(1 + ${fmt(m1)}·(${fmt(m2)}))| = ${fmt(tanTheta)}`,
        `α = ${fmt(acute)}°`,
      ];
      if (deg > 90 + 1e-9) rows.push(`${name} קהה: ${name} = 180° - ${fmt(acute)}° = ${fmt(deg)}°`);
      return rows.join('\n');
    }
  }
  const aLen = Math.hypot(dx1, dy1);
  const bLen = Math.hypot(dx2, dy2);
  const cLen = Math.hypot(b.x - a.x, b.y - a.y);
  const cosV = (aLen * aLen + bLen * bLen - cLen * cLen) / (2 * aLen * bLen);
  return [
    `|${v.id}${a.id}| = ${fmt(aLen)}, |${v.id}${b.id}| = ${fmt(bLen)}, |${a.id}${b.id}| = ${fmt(cLen)}`,
    `cos ${name} = (|${v.id}${a.id}|² + |${v.id}${b.id}|² - |${a.id}${b.id}|²)/(2·|${v.id}${a.id}|·|${v.id}${b.id}|) = ${fmt(cosV)}`,
    `${name} = ${fmt(deg)}°`,
  ].join('\n');
}
