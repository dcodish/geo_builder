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

/** How far to look. The same budget the drawable search uses, for the same reason. */
const TRIES = 24;

/**
 * What makes two figures the SAME figure, for a student looking at them.
 *
 * The placed points, rounded to a hair finer than the canvas can show. Coarser than the solver's own
 * agreement on purpose: two configurations differing in the sixth decimal are one picture, and
 * offering them as "another configuration" would be the button lying in the other direction.
 */
const signature = (lines: readonly string[], seed: number): string =>
  derive(lines, seed)
    .figure.points.map((p) => `${p.id}:${p.x.toFixed(4)},${p.y.toFixed(4)}`)
    .join('|');

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
