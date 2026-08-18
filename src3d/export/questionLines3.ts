/**
 * The «נתון:» list for the 3-D question export (#745) — one line per ENABLED fact, in entry order,
 * exactly as the student stated it.
 *
 * ## Why verbatim, and why there is no scaffolding filter here
 *
 * The 2-D export omits scaffolding (ADR-252): a bare segment or a helper marker states no given, so a
 * textbook «נתון:» list should not say "draw OA". That rule is a per-COMMAND classification over the
 * 2-D engine's command set, and it is only safe because that engine can answer *does this command add a
 * constraint, and does a later kept given reference what it introduced?*
 *
 * The operator ruled (2026-08-18, scoping #745) that the 3-D list is VERBATIM: porting the
 * classification would mean inventing a second one over `Command3`, and a classification that is even
 * slightly wrong DROPS a given the student stated — the honesty invariant this whole export exists to
 * serve. A line too many is a cosmetic complaint; a line missing is the tool lying about the question.
 * Revisit only when a real figure prints noise, with a real figure to test against.
 *
 * Disabled facts are excluded, and for the same reason 2-D excludes them: the fact list is the
 * reference display, and a muted statement is one the student took OUT of the figure.
 *
 * Pure over the fact list — no DOM, no store, no engine — so it is unit-testable in node.
 */
import type { Fact3 } from '../store/store3';

export function questionLines3(facts: readonly Fact3[]): string[] {
  const lines: string[] = [];
  for (const f of facts) {
    if (!f.enabled) continue;
    const utterance = f.utterance.trim();
    // An utterance is REQUIRED: a command-type join would be developer jargon, not textbook text. Every
    // typed step carries one and saved files persist it, so in practice nothing is lost — and a session
    // that somehow has none exports no lines, which disables the button rather than printing nonsense.
    if (utterance) lines.push(utterance);
  }
  return lines;
}
