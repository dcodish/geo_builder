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
import { canonicalSeed, drawnSampleOf, looksTheSame, seedNumber, type Seed } from '../engine/evaluate';

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
const derivedAt = (lines: readonly string[], seed: Seed, seedNames: Readonly<Record<string, string>>) => derive(lines, seed, seedNames);

export interface AnotherConfiguration {
  /**
   * The configuration to move to — unchanged when nothing different was found. It is the one the derivation DREW
   * (#2039 step 1, ADR-AG-358): the next seed may walk on to a later configuration, and the session records that one.
   */
  seed: Seed;
  /** Did the figure actually change? `false` is worth telling the student. */
  found: boolean;
}

export function anotherConfiguration(
  lines: readonly string[],
  seed: Seed,
  tries = TRIES,
  // #1631: the session's seed names, so the search compares the figures the canvas would actually draw
  seedNames: Readonly<Record<string, string>> = {},
): AnotherConfiguration {
  const from = seedNumber(seed);
  if (lines.length === 0) return { seed: from + 1, found: true };
  // TOLERANCE-AWARE (#1539, ADR-AG-197): a picture that differs only by the solver's noise — «-0.0000» against
  // «0.0000» above all — is the SAME picture, so the walk moves on to a configuration that really differs.
  const current = derivedAt(lines, seed, seedNames).figure;
  /**
   * THE SAME SAMPLE IS THE SAME CONFIGURATION (#2633, ADR-AG-358 — the operator on #1166: *"we need to give the user
   * different options and not similar options"*). A candidate that draws the sample already on the screen in the other box
   * is that configuration re-scaled, whatever its positions; it is skipped before the pictures are compared.
   */
  const shownSample = drawnSampleOf(current);
  for (let step = 1; step <= tries; step += 1) {
    const next = derivedAt(lines, from + step, seedNames);
    if (shownSample !== undefined && drawnSampleOf(next.figure) === shownSample) continue;
    /*
     * …AND THE SAME PICTURE IS NOT ANOTHER ONE (ADR-W-175 sr-30, ADR-AG-379): a candidate that differs from the drawing on
     * the screen by less than the eye can see (`looksTheSame`, the stacking ruler) is skipped while the walk can still
     * find one that differs. With none inside the budget the answer stays the honest "nothing else" (`found: false`).
     */
    if (!looksTheSame(next.figure, current)) return { seed: canonicalSeed(next.configuration), found: true };
  }
  return { seed, found: false };
}

