/**
 * THE BANNER'S READINGS — a `Derived2` turned into the honest lines of text beside the canvas.
 *
 * It also held `sceneFromDerived2`, an adapter that rendered a `Derived2` through the PROTOTYPE's
 * `Scene` shape so the old Gauss plane could draw the new engine before the render layer was rebuilt.
 * S5 replaced that renderer and the adapter went dead; the cutover deleted it with the shape it
 * targeted ([ADR-CX-027](../../docs/06d-decisions-complex.md#adr-cx-027)).
 *
 * What these will not do is invent. A number whose modulus the givens leave open has no plottable
 * position, so it is absent from the canvas and present in the free-DOF cue instead — showing it at a
 * guessed radius would be the ADR-052 sin, and drawing nothing while saying nothing would be the
 * silent-drop one.
 */

import { FORMULA_TABLE } from '../formulas/table';
import type { Derived2 } from './derive2';

/**
 * B6 (#671) split what was one `v2Status` banner line into its two honest halves, per the operator's
 * rulings: a CONTRADICTION is a refusal and stays on the always-visible strip; the freedom cue is
 * figure DATA and lives at the head of the data panel — as a plain COUNT («the 2-D way»: people who
 * care will look, others ignore; never a per-DOF resolution of what is fixed and what can move).
 * The config count («תצורה 1 מתוך 1») died entirely — the «אפשרות נוספת» button already says
 * alternatives exist, and the count can be large and meaningless.
 */

/** The refusal half — null when the figure holds. Strip content, never opt-in. */
export const v2Contradiction = (d: Derived2): string | null =>
  d.contradiction ? `✗ הנתונים סותרים זה את זה (${d.contradiction})` : null;

/**
 * The freedom half — the panel's head-line.
 *
 * The count reports the freedom that is LEFT, not the freedom tier 1 started with: `freeDof` is the
 * nullspace dimension of the exact tier, and once «שטח OZ₁Z₂Z₃ = 150r²» consumes a direction,
 * reporting tier 1's number tells a student the figure can still move in a direction their own given
 * has just pinned. `אין תצורה תקפה` outranks the count — a figure with no valid configuration has no
 * freedom to report.
 */
export function v2Freedom(d: Derived2): string {
  if (!d.configCount) return 'אין תצורה תקפה';
  const remaining = Math.max(0, d.freeDof.length - d.drivenDof);
  return remaining > 0 ? `דרגות חופש: ${remaining}` : 'הצורה נקבעה במלואה';
}

/**
 * THE KNOWLEDGE PANEL — answers to what the student asked to see.
 *
 * A row with no value is not an empty row: «the givens do not determine this yet» is the answer, and
 * printing the current sample instead would present one configuration as the result. The prototype's
 * «בדגימה הנוכחית» string is the shape this replaces.
 */
export const v2Knowledge = (d: Derived2): string[] =>
  d.knowledge.map((k) => (k.value === null ? `${k.label} — ${k.why}` : `${k.label} = ${k.value}`));

/** Stated measures, with the verdict the figure gives them (F7). */
export const v2Measures = (d: Derived2): string[] =>
  d.measures.map((m) => {
    const mark = m.status === 'holds' ? '✓' : m.status === 'violated' ? '✗' : '?';
    return `${mark} ${m.why}`;
  });

/**
 * The polar reading of every plotted number — READ, not re-derived.
 *
 * This function used to compose the text itself, from the same fields the canvas had, by its own
 * rules. Two surfaces answering one question from two sources is the #653 class, and it duly
 * diverged: the banner had a decimal fallback for a value with no symbolic form and the canvas had
 * none, so `z1 = 3+4i` printed here and drew as a bare name there (#675). The composition lives at
 * stage 5d in `derive2`; both surfaces print what it decided.
 */
export const v2Labels = (d: Derived2, view: 'polar' | 'cart' = 'polar'): string[] =>
  // The no-guess ruling, refined (operator 2026-08-18): an undetermined number gets NO row at all —
  // "don't show the letter and say we cannot compute it". The place that explains a missing value
  // is the ASK lane, when the student asks for that name explicitly (3-D's query lane already
  // answers that way; the complex ask input rides #623).
  // #703: the rows follow the VIEW — the same stage-5d compositions the canvas prints.
  d.points.filter((p) => p.modulusKnown && p.argumentKnown).map((p) => (view === 'cart' ? p.readingCart : p.reading));

/**
 * The sheet formulas this figure is using, with the lines that brought each up.
 *
 * The row names the STATEMENTS that triggered it — that is the premise highlighting: a formula with no
 * traceable premise is a formula the app is teaching at random.
 */
export const v2Formulas = (d: Derived2, lang: 'he' | 'en'): string[] =>
  d.formulas.map((f) => {
    const row = FORMULA_TABLE.find((r) => r.id === f.id)!;
    return `${lang === 'he' ? row.he : row.en}: ${row.statement}  ←  ${f.premises.join(' · ')}`;
  });

/** The student's answers, with the verdict the exact core reached. */
export const v2Claims = (d: Derived2): string[] =>
  d.claims.map(({ claim, verdict }) => {
    const mark = verdict.status === 'holds' ? '✓' : verdict.status === 'refuted' ? '✗' : '?';
    return `${mark} ${claim.src} — ${verdict.why}`;
  });
