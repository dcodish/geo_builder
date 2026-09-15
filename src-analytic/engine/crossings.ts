/**
 * WHERE DRAWN THINGS CROSS, and how to SAY it (#1025).
 *
 * Operator, 2026-09-15: *"when a line we draw crosses another line, we need to see the dashed circle
 * allowing us to create that point"*.
 *
 * ## A crossing offers a SENTENCE, not a point
 *
 * The dot's click does not mint a point. It writes «P נקודת החיתוך של הישר AB עם הישר CD» — exactly
 * what typing that line produces ([ADR-AG-048](../../docs/06c-decisions-analytic.md#adr-ag-048)) — so
 * the student sees what was added, can rename it and can delete it like any other given. Two
 * surfaces, one grammar, which is the rule the ask lane follows too.
 *
 * **That is why a crossing carries the WORDS for each side.** An object with no name the grammar can
 * use — an anonymous conic — has no sentence, so it gets no dot rather than a dot that cannot be
 * acted on. A real limit, and the honest place for it is here rather than in the click handler.
 */
import type { Figure } from './evaluate';
import type { Construction, Id, NumCurve } from './types';
import { objectById } from './types';

export interface Crossing {
  /** Where, in world coordinates. */
  x: number;
  y: number;
  /** The sentence this dot would add, minus the point's name. */
  first: string;
  second: string;
  /** A stable identity, so React keeps the dots still while the figure moves. */
  id: string;
}

/** A tiny line, as `a·x + b·y + c = 0` plus the span it is drawn over. */
interface Straight {
  a: number;
  b: number;
  c: number;
  /** The drawn extent — a segment is bounded, a stated line is not. */
  within: ((x: number, y: number) => boolean) | null;
  words: string;
}

const EPS = 1e-9;

/** How the grammar refers to an object — `null` when it has no name a sentence can use. */
function words(c: Construction, id: Id): string | null {
  const o = objectById(c, id);
  if (!o) return null;
  if (o.kind === 'segment') return `הישר ${o.a}${o.b}`;
  if (o.kind === 'curve') {
    const name = o.label.name;
    if (!name) return null; // an ANONYMOUS conic — #1057's open question, so no dot
    if (o.curve.kind === 'circle' || /^(I|II|III|IV|V)$/.test(name)) return `המעגל ${name}`;
    return `הישר ${name}`;
  }
  return null;
}

/** A drawn segment, as a line plus the bound that makes it a segment. */
function straightOfSegment(s: Figure['segments'][number], c: Construction): Straight | null {
  const w = words(c, s.id) ?? `הישר ${s.ends[0]}${s.ends[1]}`;
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  if (Math.hypot(dx, dy) < EPS) return null;
  return {
    a: dy,
    b: -dx,
    c: dx * s.a.y - dy * s.a.x,
    within: (x, y) => {
      const t = ((x - s.a.x) * dx + (y - s.a.y) * dy) / (dx * dx + dy * dy);
      return t >= -1e-6 && t <= 1 + 1e-6;
    },
    words: w,
  };
}

/** A stated straight line, which is drawn across the whole view. */
function straightOfCurve(id: Id, curve: NumCurve, c: Construction): Straight | null {
  if (curve.kind !== 'line') return null;
  const w = words(c, id);
  if (!w) return null;
  return { a: curve.a, b: curve.b, c: curve.c, within: null, words: w };
}

/** Where two straights meet — `null` when they are parallel, or meet outside what is drawn. */
function meet(p: Straight, q: Straight): { x: number; y: number } | null {
  const det = p.a * q.b - q.a * p.b;
  if (Math.abs(det) < 1e-12) return null; // parallel, or the same line
  const x = (p.b * q.c - q.b * p.c) / det;
  const y = (q.a * p.c - p.a * q.c) / det;
  if (p.within && !p.within(x, y)) return null;
  if (q.within && !q.within(x, y)) return null;
  return { x, y };
}

/**
 * Every crossing of drawn straight pieces that the student could NAME.
 *
 * Straight-to-straight only, for now. A line meets a circle twice and the sentence handles that
 * perfectly well ([ADR-AG-047](../../docs/06c-decisions-analytic.md#adr-ag-047) lists both), but the
 * DOT would then have to say which of the two it is, and that is a second question this does not
 * need to answer to be useful.
 *
 * A crossing that already HAS a point on it is dropped: offering to create what is there would be the
 * tool suggesting the student repeat themselves.
 */
export function crossingsOf(figure: Figure, c: Construction): Crossing[] {
  const straights: Straight[] = [];
  for (const s of figure.segments) {
    const st = straightOfSegment(s, c);
    if (st) straights.push(st);
  }
  for (const cu of figure.curves) {
    if (!cu.stated) continue;
    const st = straightOfCurve(cu.id, cu.curve, c);
    if (st) straights.push(st);
  }

  const out: Crossing[] = [];
  for (let i = 0; i < straights.length; i += 1) {
    for (let j = i + 1; j < straights.length; j += 1) {
      const at = meet(straights[i], straights[j]);
      if (!at) continue;
      // Already a point there? Then there is nothing to offer.
      if (figure.points.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < 1e-6)) continue;
      // The same crossing found twice — two sides of one vertex, say — is one dot.
      const id = `${at.x.toFixed(6)},${at.y.toFixed(6)}`;
      if (out.some((o) => o.id === id)) continue;
      out.push({ ...at, first: straights[i].words, second: straights[j].words, id });
    }
  }
  return out;
}

/** The first letter the figure is not using — the name a click would give the new point. */
export function freeLetter(c: Construction): string {
  const taken = new Set(c.objects.map((o) => o.id));
  for (const ch of 'PQRSTUVWKLMNGHEFABCD') {
    if (!taken.has(ch)) return ch;
  }
  for (let i = 1; i < 10; i += 1) {
    if (!taken.has(`P${i}`)) return `P${i}`;
  }
  return 'Z';
}

/** The sentence a dot would add. */
export const crossingSentence = (x: Crossing, name: string): string =>
  `${name} נקודת החיתוך של ${x.first} עם ${x.second}`;
