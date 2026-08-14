/**
 * #574 ([ADR-447](../../docs/06-decisions.md#adr-447)) — student-facing descriptions for ANONYMOUS
 * point ids in rendered strings.
 *
 * The honesty rule (docs/17 §6): a message names the student's statements and objects, never internal
 * state. The ADR-123 coincidence notice violated it — «O ו-@f-CA נפלו על אותה נקודה» leaked the
 * incircle machinery's internal foot id (`@…` are the FR-RN-8 hidden-until-used anonymous ids,
 * `~…` the hidden helpers). The coincidence itself was genuine (in the isosceles right triangle the
 * incircle's touch on the hypotenuse IS its midpoint = the circumcentre), so suppressing it would
 * un-explain a visibly surprising drawing — the fix is the WORDING: derive a description from the
 * id's DEFINING OBJECT, at one seam every rendered string can share.
 *
 * The load-bearing derivation: a `foot` dropped FROM a circle's CENTRE onto a segment is that
 * circle's TOUCH POINT on it (tangency = the perpendicular from the centre) — which is exactly what
 * the incircle macro's three feet are. Everything else falls back by kind, and an unknown anonymous
 * kind still never leaks its id.
 *
 * Returns an i18n `{ key, params }` (the display layer owns words); null for ordinary student-named
 * ids, which render as themselves.
 */
import type { Construction, Id } from '@/engine';

/** `@…` are the FR-RN-8 hidden-until-used anonymous ids, `~…` the hidden helpers — machinery-minted either way. */
export const isAnonymousId = (id: Id): boolean => id.startsWith('@') || id.startsWith('~');

/**
 * #581 (ADR-447 Am. 1, operator ruling): a coincidence notice where EITHER member is a point the
 * MACHINERY minted is not shown at all — the notice exists (ADR-123) to explain why two points the
 * STUDENT KNOWS merged, and only a student-named pair keeps it. Display-only: the geometric
 * allowance is untouched, and the `anonPointDescriptor` seam below stays for the other consumers
 * (violations, future leaks).
 */
export const visibleCoincidences = <T extends [Id, Id]>(pairs: T[]): T[] =>
  pairs.filter(([a, b]) => !isAnonymousId(a) && !isAnonymousId(b));

export function anonPointDescriptor(id: Id, c: Construction): { key: string; params?: Record<string, string> } | null {
  if (!id.startsWith('@') && !id.startsWith('~')) return null;
  const o = c.objects.find((x) => x.id === id);
  const isCentreOf = (pid: Id) => c.objects.some((x) => x.kind === 'circle' && x.center === pid);
  if (o?.kind === 'foot') {
    return { key: isCentreOf(o.from) ? 'describe.touchOn' : 'describe.footOn', params: { seg: `${o.a}${o.b}` } };
  }
  if (isCentreOf(id)) return { key: 'describe.circleCentre' };
  if (o?.kind === 'line-intersection') return { key: 'describe.lineCross' };
  return { key: 'describe.helperPoint' };
}
