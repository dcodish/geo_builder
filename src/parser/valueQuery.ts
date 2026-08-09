/**
 * The VALUES-PANEL query parser — #477, the 3-D query lane ([ADR-3D-057](../../docs/06b-decisions-3d.md#adr-3d-057),
 * #274) ported as a PATTERN, never imported (docs/20 §12).
 *
 * The student names a quantity they want to see — `∠GBC`, `AB`, `שטח ABC` — and the engine answers it if
 * it is knowledge. This module only turns the text into a `ValueQuery`; deciding whether the answer is
 * knowable is `valuesPanel`'s job, and deliberately not shared with it: the engine may not import the
 * parser (`engine ← replay ← store`), so it is handed what was MEANT and never a string to interpret.
 *
 * Runs through `normalizeUtterance`, so a query inherits every orthographic fold the figure input has —
 * `<GBC` and `∡GBC` reach the angle rule as `∠GBC` ([ADR-381](../../docs/06-decisions.md#adr-381)), and
 * a Hebrew spelling variant folds the same way it does in a given. A student should not have to type a
 * question differently from the way they type a fact.
 *
 * **Silence beats a guess.** Unrecognised text returns null and the lane says so; it must never fall
 * through to "probably a length", because a wrong answer to a question about a figure is indistinguishable
 * from a fact.
 */
import type { Id, ValueQuery } from '@/engine';
import { normalizeUtterance } from './parse';

/** A point label: an uppercase letter, optional digit subscript, optional prime. */
const PT = String.raw`[A-Z]\d*'?`;

const rx = {
  /** «∠GBC» / «זווית GBC» / «angle GBC» — the middle label is the vertex. */
  angle: new RegExp(String.raw`^(?:∠|ה?זוו?ית\s+|angle\s+)(${PT})(${PT})(${PT})$`, 'i'),
  /** «שטח ABC» / «area ABC» — 3+ labels. */
  area: new RegExp(String.raw`^(?:ה?שטח\s+(?:של\s+)?|area\s+(?:of\s+)?)((?:${PT}){3,})$`, 'i'),
  /** «היקף ABC» / «perimeter ABC». */
  perimeter: new RegExp(String.raw`^(?:ה?היקף\s+(?:של\s+)?|perimeter\s+(?:of\s+)?)((?:${PT}){3,})$`, 'i'),
  /** «AB» / «|AB|» — a bare pair is a LENGTH. Last, so it cannot swallow the named forms. */
  length: new RegExp(String.raw`^\|?(${PT})(${PT})\|?$`),
};

/** Split a glued label run («ABC», «A1B'C») into its individual labels. */
const labels = (run: string): Id[] => run.match(new RegExp(PT, 'g')) ?? [];

/**
 * Parse one query, or null when the text is not a quantity this lane understands.
 *
 * Degenerate references are rejected rather than answered: an angle needs three DISTINCT labels (its
 * rays cannot be the same ray), a length two, and a polygon three with no repeats — each would otherwise
 * produce a confident 0 or NaN, which is exactly the "sampled number dressed as a fact" this lane exists
 * to avoid.
 */
export function parseValueQuery(text: string): ValueQuery | null {
  const s = normalizeUtterance(text).trim();
  if (!s) return null;

  const a = s.match(rx.angle);
  if (a) {
    const [, ray1, vertex, ray2] = a;
    return ray1 !== ray2 && ray1 !== vertex && ray2 !== vertex ? { kind: 'angle', vertex, ray1, ray2 } : null;
  }
  const ar = s.match(rx.area);
  if (ar) {
    const ids = labels(ar[1]);
    return ids.length >= 3 && new Set(ids).size === ids.length ? { kind: 'area', ids } : null;
  }
  const pe = s.match(rx.perimeter);
  if (pe) {
    const ids = labels(pe[1]);
    return ids.length >= 3 && new Set(ids).size === ids.length ? { kind: 'perimeter', ids } : null;
  }
  const l = s.match(rx.length);
  if (l && l[1] !== l[2]) return { kind: 'length', a: l[1], b: l[2] };
  return null;
}
