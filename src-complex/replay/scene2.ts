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
import type { Derived2 } from './derive2';

/** The prototype's `prettyName`, kept local so this adapter has one import from the retiring engine. */
const pretty = (name: string): string => name.replace(/(\d+)$/, (d) => '₀₁₂₃₄₅₆₇₈₉'.slice(+d[0], +d[0] + 1));

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
  if (d.freeDof.length) parts.push(`דרגות חופש: ${d.freeDof.join(', ')}`);
  else parts.push('הצורה נקבעה במלואה');
  return parts.join(' · ');
}

/** The exact polar reading of every plotted number — the point of the whole exercise. */
export const v2Labels = (d: Derived2): string[] =>
  d.points.map((p) => `${pretty(p.name)} = ${p.exactLabel ?? `${p.modulus}·cis${round(p.argumentDeg)}°`}`);

const round = (x: number): number => Math.round(x * 1e4) / 1e4;
