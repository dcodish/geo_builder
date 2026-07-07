/**
 * The verbatim givens list for the question export (FR-HS-11, ADR-251):
 * one line per submission group, in entry order — exactly the utterances the
 * student typed, so the exported question is deterministic (no LLM) and reads
 * as the figure was actually posed. The step list is the reference display:
 * a group is included iff SOME fact in it is enabled (the step list's own
 * not-disabled state), and the line is the group's first stated utterance.
 *
 * Utterance-less groups are SKIPPED, never rendered as command-type joins —
 * "circle + on-circle" is developer jargon, not textbook text. Every typed
 * step carries its utterance (and .geo.json files persist it), so in practice
 * nothing is lost; an all-utterance-less session simply exports no lines and
 * the UI disables the button.
 */
import type { Fact } from '@/store/geoStore';
import { groupKey } from '@/store/geoStore';

export function questionLines(facts: Fact[]): string[] {
  const order: string[] = [];
  const byGroup = new Map<string, Fact[]>();
  for (const f of facts) {
    const k = groupKey(f);
    if (!byGroup.has(k)) {
      byGroup.set(k, []);
      order.push(k);
    }
    byGroup.get(k)!.push(f);
  }
  const lines: string[] = [];
  for (const k of order) {
    const group = byGroup.get(k)!;
    if (!group.some((f) => f.enabled)) continue; // off in the step list ⇒ not a given
    const utterance = group.find((f) => f.utterance)?.utterance?.trim();
    if (utterance) lines.push(utterance);
  }
  return lines;
}
