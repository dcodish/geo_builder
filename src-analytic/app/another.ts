/**
 * «הציגו תצורה אחרת» — find a configuration that is actually DIFFERENT (#1084).
 *
 * Operator, 2026-09-15: *"the select other configs should have jumped to that solution as well and it
 * didnt"*.
 *
 * The button used to increment the seed and redraw. On his figure that produced the SAME picture for
 * the first few presses — seeds 0, 1 and 2 all converge to one configuration — so a button whose
 * whole promise is *"here is another one"* appeared to do nothing, while the DOF cue beside it said
 * the figure still had freedom. Twelve presses did eventually reach three distinct figures; the first
 * three did not.
 *
 * The cause is not a bug in the seed: a least-squares descent from different starting points often
 * lands on the same answer, and the seed advance that filters for drawable configurations (#1083)
 * narrows it further. So the button has to ask for what it promises — a figure that DIFFERS — rather
 * than for the next seed and hope.
 *
 * And when nothing differs, saying so is the honest answer. A determined figure has one configuration;
 * pressing the button on it should not quietly redraw the same picture for ever.
 */
import { derive } from '../engine/derive';
import { normalizedLine } from '../engine/lines';
import type { NumCurve } from '../engine/types';

/** How far to look. The same budget the drawable search uses, for the same reason. */
const TRIES = 24;

/**
 * What makes two figures the SAME figure, for a student looking at them.
 *
 * The placed points AND the resolved curves, rounded to a hair finer than the canvas can show.
 * Coarser than the solver's own agreement on purpose: two configurations differing in the sixth
 * decimal are one picture, and offering them as "another configuration" would be the button lying in
 * the other direction.
 *
 * It was the points alone until #1220, which is a figure-shaped blind spot rather than a rounding
 * one — see below.
 */
const signature = (lines: readonly string[], seed: number): string => {
  const d = derive(lines, seed);
  const points = d.figure.points.map((p) => `${p.id}:${p.x.toFixed(4)},${p.y.toFixed(4)}`);
  /**
   * THE CURVES COUNT TOO (#1220).
   *
   * Operator, playing T24 on «נתונה פרבולה שמשוואתה y^2=2px»: *"p is unknown but when i ask for
   * another config, there is no other config which is wrong"*.
   *
   * This read `figure.points` alone, and that figure has NONE — one curve and nothing else. So the
   * signature was the empty string at every seed, nothing ever differed, and the button reported
   * `found: false`. Which, per this file's own comment, MEANS *"a determined figure has one
   * configuration"* — said about a figure with infinitely many. The engine was innocent: `p` is
   * sampled correctly and lands differently at every seed.
   *
   * A LINE IS SIGNED NORMALISED, and that is not tidiness. `(a, b, c)` and `(2a, 2b, 2c)` are the
   * same line, and the solve can land on differently scaled triples across seeds; signing them raw
   * would make one line look like two and the button would claim "another configuration" while
   * redrawing an identical picture — the failure in the opposite direction this file already warns
   * about. `normalizedLine` (#1201) is the one place that decides when two lines are the same line,
   * so it is CALLED rather than reproduced ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)).
   *
   * The other kinds sign as their own resolved parameters, at the same 4 decimals the points use and
   * for the same reason: two configurations differing in the sixth decimal are one picture.
   */
  const curves = d.figure.curves.map((c) => `${c.id}:${curveSignature(c.curve)}`);
  return [...points, ...curves].join('|');
};

/** The resolved shape of one curve, to the precision a student could see. */
function curveSignature(c: NumCurve): string {
  const n = (v: number) => v.toFixed(4);
  switch (c.kind) {
    case 'line': {
      const k = normalizedLine(c.a, c.b, c.c);
      // A degenerate triple has no line to compare; it signs as itself rather than throwing.
      return k ? `line ${n(k.a)},${n(k.b)},${n(k.c)}` : `line ${n(c.a)},${n(c.b)},${n(c.c)}`;
    }
    case 'circle':
      return `circle ${n(c.cx)},${n(c.cy)},${n(c.r)}`;
    case 'parabola':
      return `parabola ${n(c.p)}`;
    case 'ellipse':
      return `ellipse ${n(c.a)},${n(c.b)}`;
  }
}

export interface AnotherConfiguration {
  /** The seed to move to — unchanged when nothing different was found. */
  seed: number;
  /** Did the figure actually change? `false` is worth telling the student. */
  found: boolean;
}

export function anotherConfiguration(
  lines: readonly string[],
  seed: number,
  tries = TRIES,
): AnotherConfiguration {
  if (lines.length === 0) return { seed: seed + 1, found: true };
  const current = signature(lines, seed);
  for (let step = 1; step <= tries; step += 1) {
    if (signature(lines, seed + step) !== current) return { seed: seed + step, found: true };
  }
  return { seed, found: false };
}


/**
 * WHICH SOLUTION DID THEY CLICK? (#1096)
 *
 * A line meets a conic TWICE, so two rings offer the SAME sentence — «P נקודת החיתוך של הישר l1 עם
 * האליפסה …» names both crossings, and [ADR-AG-047](../../docs/06c-decisions-analytic.md#adr-ag-047)
 * lists both in the panel with «הציגו תצורה אחרת» moving between them.
 *
 * **Clicking the left ring and landing on the right point would break the contract the rings exist
 * for.** So the click carries WHERE it was, and the seed that puts the new point nearest there is
 * the one shown first.
 *
 * This invents no given. Both roots are genuinely valid and the student can still cycle to the other;
 * choosing which to show FIRST is exactly what the branch mechanism is for, and ADR-052 permits a
 * starting choice so long as it can change. The operator was away and asked not to be consulted, so
 * this is recorded as the session's call rather than his ruling (ADR-AG-061).
 */
export function seedShowing(
  lines: readonly string[],
  id: string,
  target: { x: number; y: number },
  tries = TRIES,
): number {
  let best = 0;
  let bestD = Infinity;
  for (let seed = 0; seed < tries; seed += 1) {
    const p = derive([...lines], seed).figure.points.find((q) => q.id === id);
    if (!p) continue;
    const dist = Math.hypot(p.x - target.x, p.y - target.y);
    if (dist < bestD) {
      bestD = dist;
      best = seed;
      // Close enough that no other seed could be meaningfully nearer the click.
      if (dist < 1e-6) break;
    }
  }
  return best;
}
