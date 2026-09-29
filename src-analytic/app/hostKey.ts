import { fmtAnalytic } from '../format';

/**
 * WHICH SENTENCE TELLS THE STUDENT A ROLE HAS NO HOST (#1432 amendment 1).
 *
 * A contextual reference — «רדיוס המעגל הוא 5», «F מוקד הפרבולה», «המעגל משיק לציר ה-x», «ההיקף» —
 * that finds none of its object, or several, used to be refused with the kite-area example
 * («שטח הדלתון ABCD הוא 24»), whatever the sentence was about. The remedy is decided by the HOST the
 * reference needed (the engine's `HostRef`): name the circle, draw the parabola first, write the
 * vertices. One chooser for the refusal (`errHost.*`) and the ask row (`askHost.*`), so the two
 * surfaces cannot word the same absence differently.
 */
export interface HostLike {
  kind: string;
  found: number;
  need?: number;
}

export function hostKey(surface: 'errHost' | 'askHost', host: HostLike): string {
  const arity = (host.need ?? 1) > 1 ? 'pair' : host.found === 0 ? 'none' : 'many';
  return `${surface}.${arity}.${host.kind}`;
}

/**
 * The bound a refused value broke, in the student's words (#1432 am. 1) — «גדול מ-0» for a radius. The
 * engine carries the DOMAIN as numbers (it holds no locale); this is the one place that words it.
 */
export function rangeText(d: { min?: number; minOpen?: boolean; max?: number; maxOpen?: boolean; exclude?: number[] }, t: (k: string, o?: Record<string, unknown>) => string): string {
  const parts: string[] = [];
  if (d.min !== undefined) parts.push(t(d.minOpen ? 'range.gt' : 'range.ge', { v: fmtAnalytic(d.min) }));
  if (d.max !== undefined) parts.push(t(d.maxOpen ? 'range.lt' : 'range.le', { v: fmtAnalytic(d.max) }));
  for (const e of d.exclude ?? []) parts.push(t('range.ne', { v: fmtAnalytic(e) }));
  return parts.join(t('range.and'));
}
