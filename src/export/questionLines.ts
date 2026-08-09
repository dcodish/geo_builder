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
 *
 * SCAFFOLDING steps are omitted (ADR-252): a step that only draws ink or marks
 * a helper node — a bare segment ("OA"), a bare drawn line ("הישר AB"), or a
 * free marker point placed to make a line drawable — states no given: it adds
 * no constraint and moves nothing, and the drawn result is already visible in
 * the exported figure image beside the text. A textbook "נתון:" list doesn't
 * say "draw OA". The classification is semantic, not a phrasing whitelist:
 *   - a group is scaffold-CLASS iff every enabled command in it is pure ink
 *     (`segment`, `line-through`) or a value-less marker creating a NEW point
 *     (`free-point free:true`, `point-on-segment` with no stated ratio,
 *     `point-on-circle` with no arc restriction, `point-on-line`). A stated
 *     value (ratio, coordinates, distance…) or a statement about an EXISTING
 *     point (M1 — "C על DF" is a collinearity given) is never scaffolding.
 *   - a scaffold-class group is kept anyway when a LATER kept group references
 *     something it introduced — the reader needs the definition ("נקודה G על
 *     AD" stays when "זווית GBA = 37" follows). The check cascades in reverse:
 *     a marker whose only consumer is an omitted bare segment is omitted too.
 */
import type { AnyCommand, Id } from '@/engine';
import type { Fact } from '@/store/geoStore';
import { commandObjectIds, groupKey, introducedIds } from '@/store/geoStore';
import { canonicalText } from '@/parser';
import type { Locale } from '@/parser/canonical';

/**
 * Is this command pure scaffolding in context — drawing/marking that states no
 * given? `defined` is the set of ids that existed BEFORE this command ran: a
 * marker kind only counts when its point is NEW (an existing id makes the same
 * command a membership constraint on that point — design-rules M1, never ink).
 */
const isScaffoldCmd = (c: AnyCommand, defined: Set<Id>): boolean => {
  switch (c.type) {
    case 'segment': // pure ink between points (auto-created endpoints are free — covered by the reference check)
    case 'line-through': // a bare drawn line through two points — its collinearity is trivially true
      return true;
    case 'free-point':
      return c.free === true && !defined.has(c.id); // auto-placed helper; typed coordinates PIN — a stated given
    case 'point-on-segment':
      return c.t === undefined && !defined.has(c.id); // a stated ratio is a given
    case 'point-on-circle':
      return c.between === undefined && !defined.has(c.id); // a stated arc restriction is a given
    case 'point-on-line':
      return !defined.has(c.id); // the ADR-036 marker naming a spot on a drawn line
    default:
      return false; // shapes, circles, derived points, constraints, measures — all stated givens
  }
};

/**
 * #465 (operator ruling 2026-08-09) — the export follows the CANONICAL form.
 *
 * [ADR-428](../../docs/06-decisions.md#adr-428) reserved this decision for "the slice that builds
 * obligation 3"; obligation 3 (#450) made the step list echo canonically, so the screen and the paper had
 * begun to disagree — a student reading both saw `∠BAC = 50` on screen and `A=50` in the worksheet. The
 * ruling closes that: the paper says what the tool understood, in the spelling it teaches.
 *
 * Rendered through the SAME `canonicalText` the step row and the acceptance hint use, so all three
 * surfaces cannot drift. It stays conservative by inheritance: a lowering the renderer cannot express
 * faithfully keeps its verbatim utterance, which is most lines.
 */
export function questionLines(facts: Fact[], locale: Locale = 'he'): string[] {
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

  // Forward pass: per group, classify scaffold-ness and collect the ids it
  // introduces IN CONTEXT (ids nothing earlier defined).
  const defined = new Set<Id>();
  const meta = order.map((k) => {
    const cmds = byGroup.get(k)!.filter((f) => f.enabled).map((f) => f.cmd);
    let scaffold = cmds.length > 0;
    const intro: Id[] = [];
    for (const c of cmds) {
      if (!isScaffoldCmd(c, defined)) scaffold = false;
      for (const id of introducedIds(c)) {
        if (!defined.has(id)) {
          defined.add(id);
          intro.push(id);
        }
      }
    }
    return { k, cmds, intro, scaffold };
  });

  // Reverse pass: a scaffold group survives only if a LATER KEPT group
  // references something it introduced; omitted groups' own references don't
  // count, so a marker consumed only by omitted ink cascades away with it.
  const needed = new Set<Id>();
  const keep = new Set<string>();
  for (let i = meta.length - 1; i >= 0; i--) {
    const g = meta[i];
    if (!g.scaffold || g.intro.some((id) => needed.has(id))) {
      keep.add(g.k);
      for (const c of g.cmds) for (const id of commandObjectIds(c)) needed.add(id);
    }
  }

  const lines: string[] = [];
  for (const k of order) {
    const group = byGroup.get(k)!;
    if (!group.some((f) => f.enabled)) continue; // off in the step list ⇒ not a given
    if (!keep.has(k)) continue; // scaffolding — ink/markers nothing kept refers to (ADR-252)
    const utterance = group.find((f) => f.utterance)?.utterance?.trim();
    // An utterance is still REQUIRED (see the header: a command-type join is developer jargon, not
    // textbook text) — the canonical form replaces how the line reads, never whether it appears.
    if (utterance) lines.push(canonicalText(group.map((f) => f.cmd), locale) ?? utterance);
  }
  return lines;
}
