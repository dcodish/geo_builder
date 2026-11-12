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
import { derive, drawingConstructionOf } from '../engine/derive';
import { admittedToPool, canonicalSeed, drawableAt, drawnConfiguration, drawnSampleOf, looksTheSame, sameSolution, seedNumber, type Figure, type Seed } from '../engine/evaluate';

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
const derivedAt = (lines: readonly string[], seed: Seed, seedNames: Readonly<Record<string, string>>, pins: Readonly<Record<number, readonly string[]>>) =>
  derive(lines, seed, seedNames, pins);

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
  // #1973 (ADR-AG-430): the hosts the session's cevian lines were accepted in, on these lines — the figure the canvas draws
  pins: Readonly<Record<number, readonly string[]>> = {},
): AnotherConfiguration {
  const from = seedNumber(seed);
  if (lines.length === 0) return { seed: from + 1, found: true };
  // TOLERANCE-AWARE (#1539, ADR-AG-197): a picture that differs only by the solver's noise — «-0.0000» against
  // «0.0000» above all — is the SAME picture, so the walk moves on to a configuration that really differs.
  const current = derivedAt(lines, seed, seedNames, pins).figure;
  /**
   * THE SAME SAMPLE IS THE SAME CONFIGURATION (#2633, ADR-AG-358 — the operator on #1166: *"we need to give the user
   * different options and not similar options"*). A candidate that draws the sample already on the screen in the other box
   * is that configuration re-scaled, whatever its positions; it is skipped before the pictures are compared.
   */
  const shownSample = drawnSampleOf(current);
  /*
   * A DETERMINED FIGURE WALKS ITS SOLUTIONS FIRST (#2831, ADR-AG-473, ADR-W-206 — operator 2026-11-12, *"2831 - A"*: a
   * mirror image is the same solution placed differently, and the button shows new solutions first, Q-2731c (b)).
   */
  if (current.carrierDof === 0) {
    const next = solutionCycleStep(lines, current, tries, seedNames, pins);
    if (next !== null) return next;
  }
  for (let step = 1; step <= tries; step += 1) {
    const next = derivedAt(lines, from + step, seedNames, pins);
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


/**
 * THE SOLUTION CYCLE OF A DETERMINED FIGURE (#2831, [ADR-AG-473](../../docs/06c-decisions-analytic.md#adr-ag-473), the
 * workspace rule [ADR-W-206](../../docs/06w-decisions-workspace.md#adr-w-206)).
 *
 * The walk above knows nothing about which configurations are one solution, so on the book's p2-15 (three ellipses) it
 * showed eleven mirror images and repeats of the first two before the third, on press 13. A figure with no freedom left
 * has finitely many configurations, so here they are gathered once (seeds `0..tries−1`, the pool's budget, admitted
 * configurations only, a picture already gathered dropped), grouped by {@link sameSolution} (one solution up to a turn, a
 * shift or a mirror, with the same letter values and curve shapes), and the groups are interleaved round-robin in order
 * of first appearance: g0#0, g1#0, g2#0, …, g0#1, g1#1, …. A press moves to the successor of the drawing on the screen,
 * so the first drawing never changes and nothing new is stored; a drawing that is not in the cycle starts it.
 *
 * `null` — keep the seed walk: some admitted configuration still has freedom, or the cycle has fewer than two drawings
 * (the walk then gives its honest `found: false`).
 */
function solutionCycleStep(
  lines: readonly string[],
  current: Figure,
  tries: number,
  seedNames: Readonly<Record<string, string>>,
  pins: Readonly<Record<number, readonly string[]>>,
): AnotherConfiguration | null {
  const cycle = solutionCycle(lines, tries, seedNames, pins);
  if (cycle === null) return null;
  const at = cycle.findIndex((m) => looksTheSame(m.figure, current));
  const next = at < 0 ? cycle[0] : cycle[(at + 1) % cycle.length];
  return { seed: next.seed, found: true };
}

/** One member of a solution cycle: the configuration to move to and the drawing it is. */
interface CycleMember {
  seed: Seed;
  figure: Figure;
}
/**
 * The cycle per figure, so repeated presses gather it once (docs/17 §7): keyed by what `derive` reads, the last few
 * figures only. The cycle depends on nothing a press changes, which is what keeps it stable from press to press.
 */
const cycleMemo = new Map<string, CycleMember[] | null>();
const CYCLE_MEMO_SIZE = 8;
function solutionCycle(
  lines: readonly string[],
  tries: number,
  seedNames: Readonly<Record<string, string>>,
  pins: Readonly<Record<number, readonly string[]>>,
): CycleMember[] | null {
  const key = JSON.stringify([lines, tries, seedNames, pins]);
  if (cycleMemo.has(key)) return cycleMemo.get(key)!;
  const cycle = gatherCycle(lines, tries, seedNames, pins);
  if (cycleMemo.size >= CYCLE_MEMO_SIZE) cycleMemo.delete(cycleMemo.keys().next().value!);
  cycleMemo.set(key, cycle);
  return cycle;
}
function gatherCycle(
  lines: readonly string[],
  tries: number,
  seedNames: Readonly<Record<string, string>>,
  pins: Readonly<Record<number, readonly string[]>>,
): CycleMember[] | null {
  // Every configuration is drawn as `derive(lines, s)` draws it, from the one folded construction (one fold, not one per seed).
  const c = drawingConstructionOf(derivedAt(lines, 0, seedNames, pins));
  const drawn = (s: number) => {
    if (!c) {
      const d = derivedAt(lines, s, seedNames, pins);
      return { figure: d.figure, configuration: d.configuration };
    }
    return { figure: drawableAt(c, s, true), configuration: drawnConfiguration(c, s, true) };
  };
  const members: CycleMember[] = [];
  for (let s = 0; s < tries; s += 1) {
    const d = drawn(s);
    if (!admittedToPool(d.figure)) continue;
    if (d.figure.carrierDof !== 0) return null;
    if (members.some((m) => looksTheSame(m.figure, d.figure))) continue;
    members.push({ seed: canonicalSeed(d.configuration), figure: d.figure });
  }
  if (members.length < 2) return null;
  const groups: CycleMember[][] = [];
  for (const m of members) {
    const g = groups.find((x) => sameSolution(x[0].figure, m.figure));
    if (g) g.push(m);
    else groups.push([m]);
  }
  const cycle: CycleMember[] = [];
  for (let round = 0; cycle.length < members.length; round += 1) for (const g of groups) if (round < g.length) cycle.push(g[round]);
  return cycle;
}
