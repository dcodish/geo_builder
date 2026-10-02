/**
 * PROOF TARGETS ARE REFUSED IN EVERY BUILDER (#1666, ADR-W-107) — the shared rows, written per docs/28 §5c.
 *
 * Operator ruling, 2026-10-02 (#1649): *"all refused with exaplanation"*. Before this, 2-D committed
 * «הוכיחו כי AB ⊥ AC» as a `set-perpendicular` and 3-D recorded it as a driving claim — the figure was made
 * to satisfy what the student had been asked to prove — while analytic refused it (#1618).
 *
 * The rule lives once (`shell/proofTarget.ts`), but whether each builder CALLS it at its submit gate is not
 * visible from `shell/`, which may not import a product. So each tree hands its REAL submit decision over as
 * a {@link ProofGate} (a thin lock: `src/app/__tests__/proof-target-1666.test.ts`,
 * `src3d/__tests__/proof-target-1666.test.ts`, `src-analytic/__tests__/proof-target-1666.test.ts`), and
 * `shell/__tests__/proof-target-meta-1666.test.ts` proves these checks catch a broken gate.
 *
 * Every line here speaks of A, B and C only, so each builder's setup needs just a figure with those three
 * points (a triangle, a pyramid, three coordinate points).
 */

/** What a builder's REAL submit gate did with one line, in the vocabulary of these checks. */
export interface ProofGateVerdict {
  /** the line was refused AS A PROOF TARGET (not merely refused) */
  proof: boolean;
  /** the line, or any part of it, would be recorded / committed */
  recorded: boolean;
  /** the student-facing refusal text, rendered through the product's own i18n (null when not refused) */
  text: string | null;
}

/** The product's submit decision, asked about `line` on its A/B/C figure. Pure: it must not change the session. */
export type ProofGate = (line: string) => ProofGateVerdict | Promise<ProofGateVerdict>;

/** A proof target, and the words its refusal must quote (the claim the student was asked to prove). */
export interface ProofRow {
  line: string;
  quotes: string;
}

/** Every spelling the ruling names, in Hebrew and English, with an item marker and inside a mixed line. */
export const PROOF_ROWS: readonly ProofRow[] = [
  { line: 'הוכיחו כי AB ⊥ AC', quotes: 'AB ⊥ AC' },
  { line: 'הוכח כי AB ⊥ AC', quotes: 'AB ⊥ AC' },
  { line: 'הוכיחו ש-AB ⊥ AC', quotes: 'AB ⊥ AC' },
  { line: 'הוכיחו שAB = AC', quotes: 'AB = AC' },
  { line: 'הראו כי AB ⊥ AC', quotes: 'AB ⊥ AC' },
  { line: 'הראה כי AB = AC', quotes: 'AB = AC' },
  { line: 'יש להוכיח כי AB ⊥ AC', quotes: 'AB ⊥ AC' },
  { line: 'צריך להוכיח כי AB = AC', quotes: 'AB = AC' },
  { line: 'prove that AB ⊥ AC', quotes: 'AB ⊥ AC' },
  { line: 'Show that AB = AC', quotes: 'AB = AC' },
  { line: 'א. הוכיחו כי AB ⊥ AC', quotes: 'AB ⊥ AC' },
  { line: '(1) הוכיחו כי AB = AC', quotes: 'AB = AC' },
  { line: '1. הראו כי AB ⊥ AC', quotes: 'AB ⊥ AC' },
  // The exam's mixed line: a given, then the claim. Nothing of it is recorded (analytic's behaviour since
  // #1618), and the refusal quotes the CLAIM, so the student sees which half to leave out.
  { line: 'נתון AB = AC. הוכיחו כי AB ⊥ AC', quotes: 'AB ⊥ AC' },
  { line: 'נתון: הוכיחו כי AB = AC', quotes: 'AB = AC' },
];

/**
 * Lines that are NOT proof targets: «כי» and «ש» in their other senses, and the show-verb as the
 * "show me" imperative. A builder may accept or refuse each for its own reasons — only a PROOF refusal
 * is a fault.
 */
export const NOT_PROOF_ROWS: readonly string[] = [
  'AB = AC',
  'נתון כי AB = AC',
  'נתון ש-AB = AC',
  'ידוע כי AB = AC',
  'ידוע ש-AB ⊥ AC',
  'given that AB = AC',
  'D על AB כך ש-AD = DB',
  'הראו את הזוויות',
  'הראו שני גבהים',
  'הראה את מרכז המעגל',
  'הראו כיצד לבנות את AB',
  'show the angles',
];

/** Every violated property, named. Empty array = the builder conforms. */
export async function proofTargetFaults(gate: ProofGate): Promise<string[]> {
  const faults: string[] = [];
  for (const { line, quotes } of PROOF_ROWS) {
    const v = await gate(line);
    if (!v.proof) faults.push(`«${line}» was not refused as a proof target`);
    if (v.recorded) faults.push(`«${line}» was recorded — a claim to prove became a given`);
    if (v.proof && !(v.text ?? '').includes(quotes)) {
      faults.push(`the refusal of «${line}» does not quote the claim «${quotes}»: ${JSON.stringify(v.text)}`);
    }
  }
  for (const line of NOT_PROOF_ROWS) {
    const v = await gate(line);
    if (v.proof) faults.push(`«${line}» is not a proof target, but was refused as one`);
  }
  return faults;
}
