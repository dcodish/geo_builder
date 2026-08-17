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

/** One line of honest state for the preview banner — what the engine knows and what it does not. */
export function v2Status(d: Derived2): string {
  if (d.contradiction) return `✗ הנתונים סותרים זה את זה (${d.contradiction})`;
  const parts: string[] = [];
  parts.push(d.configCount ? `תצורה ${d.configIndex + 1} מתוך ${d.configCount}` : 'אין תצורה תקפה');
  /**
   * The DOF cue must report the freedom that is LEFT, not the freedom tier 1 started with.
   *
   * `freeDof` is the nullspace dimension of the exact tier — the state of the figure *before* the
   * numeric tier runs. Once «שטח OZ₁Z₂Z₃ = 150r²» consumes a direction, printing the tier-1 list tells
   * a student the figure can still move in a direction their own given has just pinned.
   */
  const remaining = Math.max(0, d.freeDof.length - d.drivenDof);
  if (remaining > 0) {
    const shown = d.drivenDof > 0 ? `${remaining} מתוך ${d.freeDof.length}` : d.freeDof.join(', ');
    parts.push(`דרגות חופש: ${shown}`);
  } else parts.push('הצורה נקבעה במלואה');
  return parts.join(' · ');
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
export const v2Labels = (d: Derived2): string[] => d.points.map((p) => p.reading);

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
