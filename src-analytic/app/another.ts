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
import { figureSignature } from '../engine/evaluate';

/** How far to look. The same budget the drawable search uses, for the same reason. */
const TRIES = 24;

/**
 * What makes two figures the SAME figure, for a student looking at them.
 *
 * **The decision moved into the engine** (`figureSignature`, `evaluate.ts`) when #1282 showed it has
 * three consumers, not one: this button, the knowledge gate, and — through the gate — every value the
 * data panel prints. It used to live here, and the cost of that was a P1: `isKnowledge` asked for three
 * SEEDS rather than three CONFIGURATIONS, `drawableAt`'s forward walk resolved all three to one figure,
 * and zero spread was read as certainty on a figure with a free degree of freedom. The rule that two
 * configurations differing in the sixth decimal are one picture, and that a line is compared normalised
 * (#1201, #1220), is now stated once and CALLED
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)).
 */
const signature = (lines: readonly string[], seed: number): string =>
  figureSignature(derive(lines, seed).figure);

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

