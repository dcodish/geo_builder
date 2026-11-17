/**
 * #2852 (ADR-AG-474) — WHO HOLDS A POINT, and WHICH ROWS A HIDDEN SEGMENT TOUCHES: the analytic answers to the two
 * questions the shared hide decision (`shell/frame/segmentDisplay` `hiddenWith`) cannot ask the figure.
 *
 * Operator, 2026-11-12 (#2852): hiding the height of «גובה המעוין 4.8» should take its «4.8», its knee and the H the
 * tool named for it. Whether H exists only for that height is a question about the CONSTRUCTION — who named it and
 * which lines use it — which the renderer cannot see, so it is decided here and handed in like the knowledge gates.
 */
import { objectDeps } from '../engine/carriers';
import { constraintRefs } from '../engine/solve';
import type { Construction } from '../engine/types';

/**
 * THE POINTS THAT MAY GO WITH A HIDDEN SEGMENT: a letter the TOOL chose (`minted`, the row's «הכלי קרא לנקודה H»), that
 * no other active line uses and that nothing but a segment or a polygon is built from. A letter the student typed is
 * never one of these. `minted[].index` and the construction's `objectLine` / `rowLine` count the same active lines.
 */
export function lonePoints(c: Construction, minted: ReadonlyArray<{ index: number; id: string }>): Set<string> {
  const usedOn = new Map<string, Set<number>>();
  const use = (p: string, line: number | undefined) => {
    if (line === undefined) return;
    const s = usedOn.get(p) ?? new Set<number>();
    s.add(line);
    usedOn.set(p, s);
  };
  /** Points a curve, a circle, a line or another point is built from — those hold it whatever their row. */
  const builtFrom = new Set<string>();
  for (const o of c.objects) {
    for (const p of objectDeps(o)) {
      use(p, c.objectLine?.[o.id]);
      if (o.kind !== 'segment' && o.kind !== 'polygon') builtFrom.add(p);
    }
  }
  for (const k of c.constraints) for (const p of constraintRefs(k)) use(p, c.rowLine?.get(k));
  const out = new Set<string>();
  for (const { id, index } of minted) {
    if (builtFrom.has(id)) continue;
    if ([...(usedOn.get(id) ?? [])].some((line) => line !== index)) continue;
    out.add(id);
  }
  return out;
}

/**
 * THE ROWS A HIDDEN SEGMENT TOUCHES — each shows «מוסתר», and its click shows those segments again: the line that drew
 * the segment itself (a segment of its own, never a polygon whose side it is), and a line that stated its length.
 * Keys are `segKey`s; lines are active indices. Each line maps to the hidden keys it touches.
 */
export function hiddenRowLines(c: Construction, hidden: ReadonlySet<string>): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (hidden.size === 0) return out;
  const mark = (line: number | undefined, k: string) => {
    if (line === undefined) return;
    const ks = out.get(line) ?? [];
    if (!ks.includes(k)) ks.push(k);
    out.set(line, ks);
  };
  const key = (a: string, b: string) => [a, b].sort().join('|');
  for (const o of c.objects) {
    if (o.kind !== 'segment' || !hidden.has(key(o.a, o.b))) continue;
    mark(c.objectLine?.[o.id], key(o.a, o.b));
  }
  for (const k of c.constraints) {
    if (k.t !== 'length-eq') continue;
    const refs = [...new Set(constraintRefs(k))];
    if (refs.length !== 2 || !hidden.has(key(refs[0], refs[1]))) continue;
    mark(c.rowLine?.get(k), key(refs[0], refs[1]));
  }
  return out;
}
