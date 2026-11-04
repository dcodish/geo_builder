/**
 * #1595 ([ADR-W-176](../docs/06w-decisions-workspace.md#adr-w-176)) — TWO LETTERS ON ONE DOT ARE ACCEPTED, AND THE
 * PAGE ALWAYS SAYS SO.
 *
 * Operator, 2026-09-30 (playing round #1571 T23): *"when 2 dots are on top of each other we should accept but always
 * give a message about it. this is correct for all tools"*; and 2026-10-30 (PR #2605 T34): *"whenever 2 letters fall
 * on each other and there is no other option but them to do so, we give a message to the user"*.
 *
 * 2-D has said it since ADR-123: «{{a}} ו-{{b}} נפלו על אותה נקודה.», derived from the DRAWN figure on every render,
 * so it shows for as long as the drawing has the coincidence and survives every commit. This module is that notice
 * hoisted (the third-copy rule): ONE key and sentence (`suite.notice.converge`, `shell/locales`), and the one way a
 * list of pairs reads. What each builder keeps is engine knowledge: WHICH points are named on its canvas, and its own
 * identity tolerance for "the same point" (2-D `LEN_EPS`, 3-D `NAMED_TOL`, analytic `apart`, complex the number's own
 * scale). Each passes them in; nothing here knows a product.
 *
 * A pair the givens do NOT force is the configuration search's business, never this notice's (the 2026-09-20 rulings
 * on #1254/#1273, ADR-W-175 sr-25: "no stacked points while a separated view exists"). The notice reads what is drawn,
 * after that search ran, exactly as 2-D's does. A NEW letter whose definition puts it on an existing point stays a
 * refusal where a builder refuses it (#1175, #1274, 3-D `point-coincides`): this module never turns a refusal into a
 * notice, it only speaks about a figure that was drawn.
 */

/** The one suite key. Its sentence is 2-D's, verbatim (ADR-W-118 B1). */
export const CONVERGE_KEY = 'suite.notice.converge';

/**
 * Every pair of DISTINCT names drawn at one place, in the caller's order (earlier member first). `same` is the
 * builder's own identity test; `ids` are the points its canvas labels, machinery points already left out.
 */
export function coincidentPairs<P>(points: readonly (readonly [string, P])[], same: (a: P, b: P) => boolean): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      if (points[i][0] !== points[j][0] && same(points[i][1], points[j][1])) out.push([points[i][0], points[j][0]]);
  return out;
}

/** The translator the notice needs — each product's `t`, narrowed. */
export type ConvergeTranslate = (key: string, vars: Record<string, string>) => string;

/** How a list of pairs reads: one sentence per pair, space-joined (2-D's banner, ADR-123). Empty when there is none. */
export function convergeText(
  pairs: readonly (readonly [string, string])[],
  t: ConvergeTranslate,
  name: (id: string) => string = (id) => id,
): string {
  return pairs.map(([a, b]) => t(CONVERGE_KEY, { a: name(a), b: name(b) })).join(' ');
}

/**
 * #2696 (ADR-AG-393; 2-D's ADR-486 rule, hoisted) — TWO LETTERS AT ONE SPOT ARE WRITTEN AS ONE LABEL, «B=D».
 *
 * The pairs are grouped (a chain «A~B», «B~C» is one group); each group's alphabetically first id CARRIES the joined
 * text, its members sorted and joined by «=», and every other member carries `''` (drawn with no letter). The merge is
 * by LABEL only: every point keeps its id, position and hover target. 2-D's `buildScene` (ADR-486) and analytic's
 * (ADR-AG-393) both read it, so one coincidence reads the same in both builders (ADR-W-118 B1).
 */
export function mergedLabels(pairs: readonly (readonly [string, string])[]): Map<string, string> {
  const groupOf = new Map<string, string>(); // id → its group's representative
  const find = (x: string): string => {
    let r = x;
    while (groupOf.get(r) !== undefined && groupOf.get(r) !== r) r = groupOf.get(r)!;
    return r;
  };
  for (const [a, b] of pairs) {
    if (!groupOf.has(a)) groupOf.set(a, a);
    if (!groupOf.has(b)) groupOf.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) groupOf.set(rb, ra);
  }
  const members = new Map<string, string[]>();
  for (const id of groupOf.keys()) {
    const r = find(id);
    members.set(r, [...(members.get(r) ?? []), id]);
  }
  const out = new Map<string, string>();
  for (const ids of members.values()) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort();
    out.set(sorted[0], sorted.join('='));
    for (const id of sorted.slice(1)) out.set(id, '');
  }
  return out;
}
