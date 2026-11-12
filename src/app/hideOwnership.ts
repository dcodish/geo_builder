/**
 * #2852 ([ADR-825](../../docs/06-decisions.md#adr-825)) — WHO HOLDS A POINT, and WHICH ROWS A HIDDEN SEGMENT TOUCHES:
 * the 2-D answers to the two questions the shared hide decision (`shell/frame/segmentDisplay` `hiddenWith`) cannot ask
 * the canvas.
 *
 * Operator, 2026-11-12: hiding a height should take its value, its knee and the foot the tool named for it — and never
 * a point the student named («משולש ABC», hide AB: A and B stay). Who named a point and which rows use it are questions
 * about the FACTS, which the renderer cannot see, so they are decided here and handed to `Figure` as a prop.
 */
import { isGeoPoint } from '@/engine/types';
import type { AnyCommand, Construction, Id } from '@/engine';
import { typedLabels } from '@/parser';
import { carriedLabels } from '@/parser/labelAccounting';
import { groupKey, type Fact } from '@/store/geoStore';

/** What a command (or object) names — the labels it carries and its text, read once: `names(id)` asks for a label or an
 *  exact id (an `@` point). */
const namer = (x: unknown): ((id: Id) => boolean) => {
  const labels = carriedLabels([x as AnyCommand]);
  const text = JSON.stringify(x);
  return (id) => labels.has(id) || text.includes(JSON.stringify(id));
};

/**
 * THE POINTS THAT MAY GO WITH A HIDDEN SEGMENT: a point whose letter the student never TYPED (`typedLabels` over every
 * active row — the reader the submit seams already use for "the letters the student typed"), that no more than one row
 * names, and that nothing but a segment or a polygon is built from (a circle, a line or another point holds it).
 */
export function lonePoints(facts: readonly Fact[], c: Construction): Set<Id> {
  const on = facts.filter((f) => f.enabled);
  const typed = new Set(on.flatMap((f) => (f.utterance ? typedLabels(f.utterance) : [])));
  const candidates = c.objects.filter((o) => isGeoPoint(o) && !o.id.startsWith('~') && !typed.has(o.id));
  const out = new Set<Id>();
  if (candidates.length === 0) return out;
  const rowNamers = on.map((f) => ({ row: groupKey(f), names: namer(f.cmd) }));
  const builders = c.objects.filter((x) => x.kind !== 'segment' && x.kind !== 'polygon').map((x) => ({ id: x.id, names: namer(x) }));
  for (const o of candidates) {
    const rows = new Set(rowNamers.filter((r) => r.names(o.id)).map((r) => r.row));
    if (rows.size > 1) continue;
    if (builders.some((x) => x.id !== o.id && x.names(o.id))) continue;
    out.add(o.id);
  }
  return out;
}

/**
 * THE ROWS A HIDDEN SEGMENT TOUCHES — each shows «מוסתר», and its click shows those segments again: a row that drew the
 * segment as a segment of its own («AB = 5», a height), or stated its length. Never the polygon whose side it is. Keyed
 * by the row's group key; each maps to the hidden segment ids it touches.
 */
export function hiddenRowGroups(facts: readonly Fact[], hidden: ReadonlyMap<Id, readonly [Id, Id]>): Map<string, Id[]> {
  const out = new Map<string, Id[]>();
  if (hidden.size === 0) return out;
  const key = (a: Id, b: Id) => [a, b].sort().join('|');
  const byEnds = new Map<string, Id>([...hidden].map(([id, [a, b]]) => [key(a, b), id]));
  for (const f of facts) {
    if (!f.enabled) continue;
    const c = f.cmd;
    if (c.type !== 'segment' && c.type !== 'set-distance') continue;
    const id = byEnds.get(key(c.a, c.b));
    if (!id) continue;
    const ids = out.get(groupKey(f)) ?? [];
    if (!ids.includes(id)) ids.push(id);
    out.set(groupKey(f), ids);
  }
  return out;
}
