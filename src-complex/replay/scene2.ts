/**
 * A `Derived2` rendered through the PROTOTYPE's `Scene` shape, so the existing Gauss plane draws the
 * v2 engine with no renderer change at all.
 *
 * Deliberately thin, and deliberately temporary. S5 (#622) replaces the render layer wholesale with a
 * pure scene model carrying the polar substrate, the argument arcs, the sequence spiral and the value
 * cycle; this adapter exists only so the exact solver can be PLAYED before that lands, rather than the
 * operator having to take the tests' word for it. It goes with `bridgeFacts`.
 *
 * What it will not do is invent. A number whose modulus the givens leave open has no plottable
 * position, so it is absent from the canvas and present in the free-DOF cue instead — showing it at a
 * guessed radius would be the ADR-052 sin, and drawing nothing while saying nothing would be the
 * silent-drop one.
 */

import type { Scene } from '../engine/model';
import { prettyName as pretty } from '../model/naming';
import type { Derived2 } from './derive2';

export function sceneFromDerived2(d: Derived2): Scene {
  return {
    points: d.points.map((p) => ({
      key: `v2-${p.name}`,
      label: pretty(p.name),
      z: p.z,
      kind: 'def' as const,
      factId: `v2-${p.name}`,
    })),
    circles: [],
    segments: [],
    measures: [],
    errors: {},
    checks: {},
    params: {},
  };
}

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

/** The student's answers, with the verdict the exact core reached. */
export const v2Claims = (d: Derived2): string[] =>
  d.claims.map(({ claim, verdict }) => {
    const mark = verdict.status === 'holds' ? '✓' : verdict.status === 'refuted' ? '✗' : '?';
    return `${mark} ${claim.src} — ${verdict.why}`;
  });
