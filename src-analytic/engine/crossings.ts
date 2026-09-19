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
import type { Construction, CurveKind, Id, NumCurve } from './types';
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
  /**
   * WHICH root of this pair (#1113) — 0 or 1 for a straight meeting a conic, `undefined` when the
   * pair has only one crossing and there is nothing to disambiguate.
   */
  nth?: number;
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

/**
 * How close two points must be to count as the SAME crossing (#1113).
 *
 * Relative to the figure's own span, never absolute: an absolute 1e-6 states a magnitude the student
 * never gave (ADR-052) and means something different on a figure spanning 3 units than on one
 * spanning 3000 — ADR-AG-021's ruling, which this dedupe had not inherited. Measured symptom: a
 * solved crossing drifted to the fourth decimal and its ring was offered AGAIN although a point was
 * already sitting on it, which is how a third and fourth letter reached one location.
 */
function apart(figure: Figure): number {
  const ps = figure.points;
  if (ps.length < 2) return 1e-9;
  const span = Math.max(
    1e-9,
    Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)),
    Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y)),
  );
  return span * 1e-6;
}

/**
 * The Hebrew noun for each curve family, for a curve with only its equation to go by (#1096).
 *
 * These are the words the grammar's operand reader accepts, so a sentence built from them parses
 * back to the SAME object — «two surfaces, one grammar» (ADR-AG-048), now over conics too.
 */
const CONIC_NOUN: Record<string, string> = {
  line: 'הישר',
  circle: 'המעגל',
  parabola: 'הפרבולה',
  ellipse: 'האליפסה',
};

/**
 * How the grammar refers to an object — `null` when it has no name a sentence can use.
 *
 * `classified` is the kind the FIGURE fitted, which the caller already holds. A bare «y=9» names no
 * family, so the construction object carries none; only the fit knows it is a line, and a caller
 * that has already tested for one should not make this function guess again.
 */
function words(c: Construction, id: Id, classified?: CurveKind): string | null {
  const o = objectById(c, id);
  if (!o) return null;
  if (o.kind === 'segment') return `הישר ${o.a}${o.b}`;
  if (o.kind === 'curve') {
    const name = o.label.name;
    /**
     * A LINE GIVEN BY ITS EQUATION names itself (#1092).
     *
     * Operator, 2026-09-15 (T34): a bare «נתון הישר y=9» drawn across a triangle offered no
     * ring where it visibly crossed two sides. ADR-AG-054's limit — a ring only where the GRAMMAR
     * can name both objects — was right, and this case was on the wrong side of it: #1057's open
     * question is that the NOUN «הפרבולה» is ambiguous between two anonymous conics, and an
     * EQUATION is not ambiguous. It identifies exactly one curve, and `incidenceOn` now reads it
     * back to the same content-derived id, so the offered sentence round-trips.
     *
     * Lines only, deliberately. A conic would need a noun for the sentence («הפרבולה y^2=54x»?),
     * which is #1057's question and not settled by the corpus; lines are the reported case and the
     * corpus's constant one.
     */
    if (!name) {
      /**
       * AN EQUATION NAMES ITS CURVE, whatever kind it is (#1096).
       *
       * Operator ruling, 2026-09-16 on T49: *"i dont agree. I think we need to offer the rings in
       * this case too"* — overriding ADR-AG-054's limit for the conics ADR-AG-049 left out.
       *
       * ADR-AG-056 already established the principle for lines and drew the boundary in the right
       * place: what blocks a sentence is AMBIGUITY, not namelessness. The noun «הפרבולה» is
       * ambiguous between two anonymous parabolas; «הפרבולה y^2=54x» is not. The kind comes
       * from the FIT, because a bare equation declares none (02c R6).
       */
      if (!o.label.eqSrc) return null;
      const noun = CONIC_NOUN[classified ?? o.label.kind ?? o.curve.kind ?? ''];
      return noun ? `${noun} ${o.label.eqSrc}` : null;
    }
    /**
     * A NAMED CIRCLE ALREADY CARRIES ITS NOUN (#1096): the label stored for «נתון מעגל I שמשוואתו …»
     * is «מעגל I», not «I». Prepending the noun again produced «המעגל מעגל I», which the grammar
     * refuses — a latent bug that could not surface while circles were excluded from the crossing
     * search altogether, and did the moment they were let in.
     */
    if (o.curve.kind === 'circle' || /^(I|II|III|IV|V)$/.test(name)) {
      return name.startsWith('מעגל') ? `ה${name}` : `המעגל ${name}`;
    }
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
  // The fit has just said it IS a line; pass that on rather than have `words` re-derive it from a
  // construction object that a bare equation leaves kind-less.
  const w = words(c, id, 'line');
  if (!w) return null;
  return { a: curve.a, b: curve.b, c: curve.c, within: null, words: w };
}

/**
 * WHERE A STRAIGHT MEETS A CONIC (#1096) — up to two points, in closed form.
 *
 * The line is parametrised as `P0 + t·d` (`P0` its point nearest the origin, `d = (−b, a)`), which
 * removes every vertical/horizontal special case: substituting into each canonical conic leaves a
 * QUADRATIC in `t`, and the three canonical forms are the only shapes `NumCurve` admits.
 *
 * A near-zero leading coefficient is the genuinely linear case — a line parallel to a parabola's
 * axis meets it exactly once — and is solved as such rather than divided through, which is where a
 * naive quadratic produces an infinity and draws a ring at the edge of the world.
 */
function meetConic(l: Straight, conic: NumCurve): Array<{ x: number; y: number }> {
  const n2 = l.a * l.a + l.b * l.b;
  if (n2 < EPS) return [];
  const p0 = { x: (-l.a * l.c) / n2, y: (-l.b * l.c) / n2 };
  const d = { x: -l.b, y: l.a };

  let A = 0;
  let B = 0;
  let C = 0;
  if (conic.kind === 'circle') {
    const q = { x: p0.x - conic.cx, y: p0.y - conic.cy };
    A = d.x * d.x + d.y * d.y;
    B = 2 * (d.x * q.x + d.y * q.y);
    C = q.x * q.x + q.y * q.y - conic.r * conic.r;
  } else if (conic.kind === 'ellipse') {
    const ia = 1 / (conic.a * conic.a);
    const ib = 1 / (conic.b * conic.b);
    A = d.x * d.x * ia + d.y * d.y * ib;
    B = 2 * (p0.x * d.x * ia + p0.y * d.y * ib);
    C = p0.x * p0.x * ia + p0.y * p0.y * ib - 1;
  } else if (conic.kind === 'parabola') {
    // y² = 2p·x
    const two = 2 * conic.p;
    A = d.y * d.y;
    B = 2 * p0.y * d.y - two * d.x;
    C = p0.y * p0.y - two * p0.x;
  } else {
    return [];
  }

  const ts: number[] = [];
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) > 1e-12) ts.push(-C / B); // the honestly linear case
  } else {
    const disc = B * B - 4 * A * C;
    if (disc < -1e-9) return []; // misses it
    const root = Math.sqrt(Math.max(disc, 0));
    /**
     * A TANGENCY OFFERS NO RING, deliberately (#1096).
     *
     * It is a real meeting point and a student may well want to name it, but measured, the sentence
     * a ring would offer there does not build: the two incidences are degenerate at a touch and the
     * solve returns `unsatisfiable` even though it lands on the right point. **A ring whose click
     * fails is worse than no ring** — that is ADR-AG-054's whole principle, and it outranks the
     * ruling to offer more rings, which was about anonymous conics and not about tangency.
     *
     * Filed separately rather than papered over here.
     */
    if (root <= 1e-6) return [];
    ts.push((-B + root) / (2 * A));
    ts.push((-B - root) / (2 * A));
  }

  return ts
    .map((t) => ({ x: p0.x + t * d.x, y: p0.y + t * d.y }))
    .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
    // A SEGMENT is bounded; a stated line is not. The same `within` the straight-to-straight path uses.
    .filter((q) => !l.within || l.within(q.x, q.y));
}

/** A drawn conic the student can NAME — the other half of a crossing (#1096). */
interface Conic {
  curve: NumCurve;
  words: string;
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
  const conics: Conic[] = [];
  for (const cu of figure.curves) {
    if (!cu.stated) continue;
    const st = straightOfCurve(cu.id, cu.curve, c);
    if (st) {
      straights.push(st);
      continue;
    }
    // Not a line — a circle, parabola or ellipse. It joins the search if it can be NAMED (#1096).
    const w = words(c, cu.id, cu.curve.kind);
    if (w) conics.push({ curve: cu.curve, words: w });
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

  /**
   * STRAIGHT × CONIC (#1096). A line meets a conic twice, and BOTH are offered: the student can name
   * either, and ADR-AG-047 already lists both solutions with «הציגו תצורה אחרת» moving between them.
   * Which one a click lands on is settled at the click (see `App.tsx`), not here — this module knows
   * where the crossings are, not what a mouse did.
   */
  for (const st of straights) {
    for (const cn of conics) {
      const roots = meetConic(st, cn.curve);
      /**
       * `nth` is the ROOT'S ORDER in this pair, taken before any filtering (#1113) — which is why
       * this is `forEach` over the full root list and not a loop over the survivors. It is what lets
       * the offered sentence say «הראשונה» or «השנייה»; drop a taken crossing first and the
       * remaining one would call itself "the first" and collide with the point already there.
       */
      roots.forEach((at, n) => {
        if (figure.points.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < apart(figure))) return;
        const id = `${at.x.toFixed(6)},${at.y.toFixed(6)}`;
        if (out.some((o) => o.id === id)) return;
        out.push({ ...at, first: st.words, second: cn.words, id, nth: roots.length > 1 ? n : undefined });
      });
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
/**
 * The line a click writes down — and it NAMES ITS ROOT (#1113).
 *
 * The operator's ruling, 2026-09-16: the sentence says which crossing it means rather than a branch
 * index being stored behind the student's back. Without the ordinal both rings of one line×conic pair
 * produced the identical sentence, so the solve settled every one of them on the same root and four
 * clicks put four letters on one point.
 *
 * The words are the grammar's own (`NTH_HE` in the parser accepts them), so a clicked line re-parses
 * to the point that was clicked — ADR-AG-048's «two surfaces, one grammar».
 */
export const crossingSentence = (x: Crossing, name: string): string =>
  `${name} נקודת החיתוך${x.nth === undefined ? '' : x.nth === 0 ? ' הראשונה' : ' השנייה'} של ${x.first} עם ${x.second}`;
/** A point the student may NAME by clicking it — a crossing, or a circle's centre (#1109). */
export interface Namable {
  id: string;
  x: number;
  y: number;
  /** The whole sentence the click would commit, letter included. */
  sentence: string;
}

/**
 * THE CENTRES A STUDENT MAY NAME (#1109).
 *
 * Operator, playing T10/T12: *"when a center of a circle is defined by the equation, it should be
 * clickable so user can assign the center with a letter"*. The `+` mark has been drawn since #1024 and
 * was inert; a crossing in the same figure was clickable and minted a letter, so the affordance existed
 * and the most interesting point on a circle did not have it.
 *
 * **Offered only where there is no name**, which is his ruling: *"the click only names what doesn't have
 * a name"*. Three ways a centre can already be named, all excluded:
 *
 *  - a point already sits there (the student named it earlier, by this route or another);
 *  - the circle was stated BY its centre letter («מעגל O שמשוואתו …», #1059), so the letter IS the name;
 *  - the circle is anonymous, so there is no «המעגל ‹name›» to write — a sentence that cannot round-trip
 *    must not be offered (ADR-AG-048's «two surfaces, one grammar», and ADR-AG-054's rule that a ring
 *    whose click fails is worse than no ring).
 *
 * It travels the crossing's road rather than forking it: the same `Namable` shape, the same `freeLetter`,
 * and the sentence is what the parser reads back — never a point minted behind the grammar's back.
 */
/**
 * WHO OCCUPIES THIS POSITION — the one place that answers it, at the figure's own scale (#1167).
 *
 * `centresOf` has asked this since #1024, to avoid offering a ring where a point already sits. The
 * DESCRIPTION layer never asked it at all, and printed invented letters instead: a circle centred at
 * the origin read «O(0, 0), r = 4» in the panel while «A = (0, 0)» sat directly above it — two
 * letters for one position, one of which the student never created.
 *
 * Extracted rather than copied, because the alternative is a second `Math.hypot` test beside this
 * one with its own idea of "near", and the two would drift the first time the tolerance changed. It
 * is RELATIVE to the figure (`apart`), never absolute — ADR-AG-021's rule, which #1113 installed here
 * and which an absolute epsilon in a second copy would quietly undo.
 */
export function pointAt(figure: Figure, x: number, y: number): string | null {
  const near = apart(figure);
  const hit = figure.points.find((p) => Math.hypot(p.x - x, p.y - y) < near);
  return hit ? hit.id : null;
}

export function centresOf(figure: Figure, letter: string): Namable[] {
  const out: Namable[] = [];
  for (const cu of figure.curves) {
    if (!cu.stated) continue;
    const circle = cu.curve as { kind: string; cx?: number; cy?: number };
    if (circle.kind !== 'circle' || circle.cx === undefined || circle.cy === undefined) continue;

    /**
     * The student's own letter comes from the ID, not from `label.name`.
     *
     * `label.name` is the whole noun phrase — «מעגל I», not «I» — so composing the sentence from it
     * produced «P מרכז המעגל מעגל I», which does not parse. The round-trip assertion caught it, which is
     * exactly what ADR-AG-048's «two surfaces, one grammar» rule is for: an offered sentence the parser
     * cannot read back is a ring whose click fails, and ADR-AG-054 says that is worse than no ring.
     */
    const PREFIX = 'circle-';
    if (!cu.id.startsWith(PREFIX)) continue; // not named the way the grammar refers to a circle
    const name = cu.id.slice(PREFIX.length);
    if (!name) continue;

    // Already named: a point sits on the centre, whatever route put it there. Same question the
    // description layer asks, and now literally the same function (#1167).
    if (pointAt(figure, circle.cx, circle.cy) !== null) continue;

    out.push({
      id: `centre-${cu.id}`,
      x: circle.cx,
      y: circle.cy,
      sentence: `${letter} מרכז המעגל ${name}`,
    });
  }
  return out;
}
