/**
 * THE NAMING SENTENCE A RESTATED LINE IS OFFERED (#2584, ADR-AG-346; operator ruling 2026-10-27, T32: *"it should refuse to
 * draw second line and say that already exists and offer to rename the line"*).
 *
 * «l2 אנך אמצעי ל-EK» after the unnamed «אנך אמצעי ל-EK» is refused `line-exists`, and the input is pre-filled with
 * «נסמן את האנך האמצעי ל-EK ב-l2» (ADR-W-030's pre-fill: a refusal plus a sentence, never a silent rewrite). The sentence is
 * written from the LINE, not from its row: what builds a constructed line is its identity, so the description is read off
 * the `line-at` — a perpendicular bisector by its segment, any other line through a point by that point and its direction.
 * The caller offers it only when the same submit decision would RECORD it (`decideSubmit`), so the box never holds a
 * sentence the next Enter refuses; a line no description reaches gets the refusal without an offer.
 */
import type { Construction, GeoObject, Id } from '../engine/types';
import type { Direction } from '../engine/solve';
import { objectById } from '../engine/types';

type Lang = 'he' | 'en';

/** The direction a line copies, as the description's tail: «לציר ה-x», «ל-AB», «לישר l1». */
function directionText(c: Construction, d: Direction, lang: Lang): string | null {
  if (d.k === 'axis') return lang === 'he' ? `לציר ה-${d.axis}` : `the ${d.axis}-axis`;
  if (d.k === 'points') return lang === 'he' ? `ל-${d.a}${d.b}` : `${d.a}${d.b}`;
  if (d.k === 'curve') {
    const o = objectById(c, d.id);
    const name = o?.kind === 'curve' ? o.label.name : o?.kind === 'line-at' ? o.name : undefined;
    if (!name) return null;
    return lang === 'he' ? `לישר ${name}` : `the line ${name}`;
  }
  return null;
}

/** The line as a noun phrase a sentence can name it by, or null when no description reaches it. */
export function lineDescription(c: Construction, o: GeoObject, lang: Lang): string | null {
  if (o.kind !== 'line-at') return null;
  const through = objectById(c, o.through);
  if (o.perp && o.dir.k === 'points' && through?.kind === 'derived' && through.rule.t === 'midpoint') {
    const [a, b] = [o.dir.a, o.dir.b];
    return lang === 'he' ? `האנך האמצעי ל-${a}${b}` : `the perpendicular bisector of ${a}${b}`;
  }
  if (through?.kind === 'derived' && through.helper) return null;
  const tail = directionText(c, o.dir, lang);
  if (!tail) return null;
  return lang === 'he'
    ? `הישר העובר דרך ${o.through} ${o.perp ? 'המאונך' : 'המקביל'} ${tail}`
    : `the line through ${o.through} ${o.perp ? 'perpendicular' : 'parallel'} to ${tail}`;
}

/** «נסמן את <the line> ב-<name>» / "denote <the line> by <name>" — the candidate offer, before the record check. */
export function lineOfferCandidate(c: Construction, twin: Id, name: string, lang: Lang): string | null {
  const o = objectById(c, twin);
  const described = o ? lineDescription(c, o, lang) : null;
  if (!described) return null;
  return lang === 'he' ? `נסמן את ${described} ב-${name}` : `denote ${described} by ${name}`;
}
