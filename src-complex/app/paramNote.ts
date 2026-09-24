/**
 * THE TEACHING NOTE on a letter read as a real number (#1405,
 * [ADR-CX-047](../../docs/06d-decisions-complex.md#adr-cx-047)).
 *
 * `u^5 = 32` reads `u` as a real PARAMETER (ADR-CX-004: a letter outside z and w is real) and solves
 * it, u = 2. That is the intended reading, and it is shown (ADR-CX-043). But a student who meant u as a
 * complex number, whose fifth roots are five points, got one real value with nothing saying why. The
 * operator's ruling: say so, once, on the line, and teach the sentence that changes it —
 * «u מספר מרוכב».
 *
 * A NOTE, never a refusal: the line is accepted and the reading is a legitimate one.
 *
 * **The note only teaches a remedy that works** (the #1156 lesson: a taught spelling must drive).
 * Each note is offered only when the declaration it teaches passes the REAL acceptance gate on this
 * very figure. `|z1| = 9r` solves r = 5/9 too, but there r is a size, a size is real, and declaring
 * r complex is refused, so no note tells the student to try it.
 */
import type { Expr } from '../model/expr';
import { paramsOf } from '../model/expr';
import type { Derived2 } from '../replay/derive2';
import { parseLineV2 } from '../parser/rules';
import { acceptLine } from './submit';

export interface ParamNote {
  /** index into the lines passed in: the FIRST line that uses the parameter */
  readonly line: number;
  readonly name: string;
  /** the value exactly as the data panel prints it (`2`, `-2`, `±2`, `5/9`) */
  readonly value: string;
}

/** The declaration sentence the note teaches. The gate reads it; the UI prints its own language's form. */
export const declarationOf = (name: string): string => `${name} מספר מרוכב`;

/** Every expression one parsed line states or asks about. */
function exprsOf(raw: string): Expr[] {
  const r = parseLineV2(raw);
  if (!r.ok) return [];
  const l = r.line;
  return [
    ...l.constraints.flatMap((c) => [c.lhs, c.rhs]),
    ...l.measures.map((m) => m.rhs),
    ...l.objects.flatMap((o) => (o.kind === 'circle' ? [o.radius] : [])),
    ...l.roots.map((e) => e.rhs),
  ];
}

/**
 * The notes for one figure: one per SOLVED real parameter whose complex reading the gate would
 * accept, on the first line that uses it. `lines` are the ACTIVE lines the figure was folded from.
 */
export function realParamNotes(lines: readonly string[], derived: Derived2, seed: number): ParamNote[] {
  const out: ParamNote[] = [];
  for (const p of derived.params) {
    if (p.value === null) continue; // a free parameter is not "read as" anything yet
    const at = lines.findIndex((l) => exprsOf(l).some((e) => paramsOf(e).includes(p.name)));
    if (at < 0) continue;
    if (!acceptLine(lines, declarationOf(p.name), seed).ok) continue;
    out.push({ line: at, name: p.name, value: p.value });
  }
  return out;
}
