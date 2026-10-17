/**
 * AN ANGLE WRITTEN WITH π IS REFUSED IN EVERY PLANE-GEOMETRY BUILDER (#1837, ADR-710 / ADR-W-142) — the
 * shared rows, written per docs/28 §5c (the `proof-target-rows` precedent).
 *
 * Operator rulings on #1837: 2026-10-07 *"Refuse and teach degrees"*; 2026-10-08 *"analytics tool should not
 * support radians at all. only the complex tool should"*. Measured on `main` b0e9dbea, after «משולש ABC»: 2-D
 * sent every π angle to the AI fallback and committed «∠ABC = pi/2» as 2°; 3-D recorded «∠ABC = π» as an
 * angle mark labelled π and answered the rest `not-understood` (the fallback); analytic recorded each one in
 * DEGREES («∠ABC = π/2» drew 1.57°).
 *
 * The rule lives once (`shell/radianAngle.ts`); whether each builder CALLS it is not visible from `shell/`,
 * so each tree hands its REAL submit decision over as a {@link RadianGate} (`src/app/__tests__/radian-angle-1837.test.ts`,
 * `src3d/__tests__/radian-angle-1837.test.ts`, `src-analytic/__tests__/radian-angle-1837.test.ts`), and
 * `shell/__tests__/radian-angle-meta-1837.test.ts` proves these checks catch a broken gate.
 *
 * Every line speaks of A, B, C (and O for a circle), so each builder's setup is a triangle.
 */

/** The ruled sentence (2026-10-07), Hebrew — every builder's refusal reads exactly this. */
export const RADIAN_SENTENCE_HE = 'בגאומטריה של המישור זוויות נכתבות במעלות — למשל ∠ABC = 90';
/** Its English locale twin (the plan: "the English locale carries the sentence's direct translation"). */
export const RADIAN_SENTENCE_EN = 'In plane geometry, angles are written in degrees — for example ∠ABC = 90';

/** What a builder's REAL submit gate did with one line, in the vocabulary of these checks. */
export interface RadianGateVerdict {
  /** refused AS A RADIAN ANGLE (not merely refused) */
  radian: boolean;
  /** the line, or any part of it, would be recorded / committed */
  recorded: boolean;
  /** the line would go to the AI fallback (2-D `escalate`, 3-D `not-understood`, analytic `not-handled`) */
  escalated: boolean;
  /** the student-facing refusal text through the product's own i18n (null when not refused) */
  text: string | null;
}

/** The product's submit decision on its triangle. Pure: it must not change the session. */
export type RadianGate = (line: string) => RadianGateVerdict | Promise<RadianGateVerdict>;

/** Every spelling the plan names, and the spellings around them (the class, not the one input). */
export const RADIAN_ROWS: readonly string[] = [
  '∠ABC = π/2',
  '∠ABC = π',
  'זווית ABC = π/3',
  'זווית ABC שווה ל-π/4',
  '∠ABC = 2π/3',
  '∠B = π/2',
  'זוית B = π/6',
  'הזווית ABC היא π/2',
  '∢ABC=π/3',
  '∡ABC = π / 2',
  '∠ABC = 0.5π',
  '∠ABC = (π/2)',
  '∠ABC = pi/2',
  'angle ABC = π/2',
  'the angle ABC is π/3',
  'הזווית בין AB ל-AC היא π/6',
];

/**
 * Lines that are NOT an angle in radians: π as a number, π as a name, degrees, LaTeX. A builder may accept
 * or refuse each for its own reasons — only a RADIAN refusal is a fault.
 */
export const NOT_RADIAN_ROWS: readonly string[] = [
  '∠ABC = 90',
  '∠ABC = 90°',
  '∠ABC = 1.2',
  'AB = π',
  'AB = 2π',
  'מעגל O שהיקפו 6π',
  'B על המישור π2',
  'הזווית בין AB למישור π1 היא 30',
  '∠ABC = \\pi/2',
  'קשת AB = 4π',
  'α = π/3',
];

/** Every violated property, named. Empty array = the builder conforms. */
export async function radianAngleFaults(gate: RadianGate, sentence: string = RADIAN_SENTENCE_HE): Promise<string[]> {
  const faults: string[] = [];
  for (const line of RADIAN_ROWS) {
    const v = await gate(line);
    if (!v.radian) faults.push(`«${line}» was not refused as an angle in radians`);
    if (v.recorded) faults.push(`«${line}» was recorded — an angle in radians became a figure`);
    if (v.escalated) faults.push(`«${line}» was handed to the AI fallback — the ruling refuses it deterministically`);
    if (v.radian && v.text !== sentence) faults.push(`the refusal of «${line}» is not the ruled sentence: ${JSON.stringify(v.text)}`);
  }
  for (const line of NOT_RADIAN_ROWS) {
    const v = await gate(line);
    if (v.radian) faults.push(`«${line}» is not an angle in radians, but was refused as one`);
  }
  return faults;
}
