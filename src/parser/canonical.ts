/**
 * Canonical input forms — [ADR-428](../../docs/06-decisions.md#adr-428).
 *
 * The tool TEACHES its input language rather than merely accepting what was typed. When a student's
 * phrasing is understood but is not the canonical form, we say so and show the canonical spelling, so the
 * habit they build is one we can promise to honour. (`A=40` reaching the LLM "works" today and may not
 * tomorrow — that unreliability is invisible to the student, and it is what this module exists to remove.)
 *
 * **The load-bearing rule: canonicalise from the LOWERED COMMANDS, never by rewriting the input string.**
 * Rendering the commands reports what the tool actually UNDERSTOOD; rewriting the text would be a guess
 * about what was meant. That is what keeps the hint honest, and it is why this is not — and must not
 * become — an inverse of the parser.
 *
 * Scope grows by measured demand (log-triage), exactly like `catalog.ts`. A lowering with no canonical
 * renderer here simply produces no hint; silence is always safe, a wrong hint is not.
 */
import type { AnyCommand, Id } from '@/engine';

export type Locale = 'he' | 'en';

/** Does the utterance already name an angle? Used to tell a canonical phrasing from a bare one. */
const NAMES_ANGLE = /זוו?ית|\bangle\b|∠/i;

/** `set-angle` → `∠BAC = 40`. The full triple is used deliberately: it is unambiguous whatever the
 *  vertex's edge count, so it is the form worth teaching.
 *
 *  **The GLYPH, not the word** (operator ruling 2026-08-09, #460 — [ADR-428](../../docs/06-decisions.md#adr-428)
 *  Am. 1). Every other teaching surface in the app already says `∠`: `err.latex` points at the toolbar
 *  ("△ ∥ ∠ ⊥ √"), `err.ambiguousAngle` spells its example as `∠A{v}C = 90`, and there is a `∠` button
 *  sitting beside the input box. This hint was the one surface teaching a different canonical spelling
 *  from the rest of the tool. The glyph is locale-independent — only the surrounding copy is not.
 *
 *  Note what deliberately does NOT change: `<BAC = 50` still receives a hint. The prefix `<` is a
 *  keyboard APPROXIMATION of `∠` ([ADR-381](../../docs/06-decisions.md#adr-381), #237 — students type it
 *  because `∠` isn't on a keyboard), tolerated input rather than a canonical form, so nudging it toward
 *  the glyph is this module doing its job. Teaching a student out of the approximation and onto the
 *  button is the whole point; suppressing that hint would strand them on it. */
function angleText(vertex: Id, ray1: Id, ray2: Id, value: number, _locale: Locale): string {
  return `∠${ray1}${vertex}${ray2} = ${value}`;
}

/**
 * The canonical utterance for a lowering, or null when this module cannot render it faithfully.
 *
 * Only single-statement lowerings are rendered — a compound utterance has no single canonical line, and
 * inventing one would misreport what was committed. Auto-drawn `segment` commands are ignored: they are
 * ink the angle statement implies, not part of what the student said.
 */
export function canonicalText(cmds: AnyCommand[], locale: Locale): string | null {
  const meaningful = cmds.filter((c) => c.type !== 'segment');
  if (meaningful.length !== 1) return null;
  const c = meaningful[0];
  if (c.type === 'set-angle') return angleText(c.vertex, c.ray1, c.ray2, c.value, locale);
  return null;
}

/**
 * The canonical form to TEACH for this input, or null when the input was already canonical (or cannot be
 * rendered). Conservative by construction: a hint appears only when the utterance is missing the very
 * word that names the construct, which is the difference the student needs to see.
 */
export function teachCanonical(utterance: string, cmds: AnyCommand[], locale: Locale): string | null {
  const text = canonicalText(cmds, locale);
  if (!text) return null;
  const meaningful = cmds.filter((c) => c.type !== 'segment');
  // the angle family: a phrasing that never names the angle (`A = 40`) is the non-canonical case
  if (meaningful[0]?.type === 'set-angle' && !NAMES_ANGLE.test(utterance)) return text;
  return null;
}
