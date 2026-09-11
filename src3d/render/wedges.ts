/**
 * THE VERTEX WEDGES OF A FIGURE — one collection, two readers (#937, ADR-3D-233).
 *
 * A vertex arc is keyed by its WEDGE: the vertex plus the unordered pair of ray DIRECTIONS. Every
 * producer of a vertex angle feeds the same map — the stated values (`vangle` scalar pins, which are
 * driving givens, and recorded shared-apex angle claims, `paramGivens` included) and the #94 named-angle
 * MARKERS («∠SDB» / «∠SDB = α», a pedagogical arc carrying a label and no number) — so a corner that
 * carries both a name and a value is ONE entry and draws ONE arc.
 *
 * This collection was inline in `buildScene3`. It moved here whole, unchanged, when #937 needed a
 * SECOND reader: the fact list has to know which valued parameters actually COMPETE with a letter on
 * some surface, and for the arc lane that question is exactly *"is there a wedge holding both a label
 * and a deg?"*. Re-deriving it beside the renderer would be the second enumeration docs/17 §3 forbids —
 * and it would go stale the first time a new producer learned to feed a wedge, because nothing would
 * force the copy to be updated.
 *
 * The identity rules are the ones ADR-3D-227 (#928) settled and are not restated here:
 *
 *  - a wedge is its vertex plus its two ray DIRECTIONS, not its point ids, so «∠EAS = α» and
 *    «∠BAS = 40» with E on AB are one physical corner rather than two stacked rings;
 *  - matching is a TOLERANCE predicate (±1.5° per ray), never a rounded key — rounding puts a hard
 *    quantization boundary mid-wedge, so two rays of one corner a hair apart key differently and
 *    double-draw (the regression 2-D's F7/REN-9 records);
 *  - a wedge whose points do not resolve falls back to id identity, so nothing about the unresolvable
 *    case changes.
 */
import { angleMarkText, type Construction3, type Id, type Positions3 } from '../engine/types';
import { dot3, norm3, normalize3, sub3, type Vec3 } from '../engine/vec3';

export interface Wedge {
  vertex: Id;
  p: Id;
  q: Id;
  u1: Vec3 | null;
  u2: Vec3 | null;
  /** The stated value, when some given fixed this corner. */
  deg?: number;
  /** What the arc SHOWS — the expression the student wrote («2α»), `''` for a bare `∠SDB` marker.
   *  Composed by `angleMarkText`; never the bare letter when a coefficient was stated (#986). */
  label?: string;
  /** The BINDING letter behind that expression («α»), or undefined when the marker names none.
   *  Separate from `label` for the same reason the mark separates `coef` from `label`: one is for the
   *  student to read, the other is an identity other machinery matches on — and #986 is what happens
   *  when a consumer reaches for the wrong one. */
  sym?: string;
}

const RAY_TOL = Math.cos((1.5 * Math.PI) / 180); // ±1.5° per ray, the 2-D tolerance
const rayNear = (a: Vec3, b: Vec3) => dot3(a, b) >= RAY_TOL;

/** Collect the figure's vertex wedges, merging the producers that name the same physical corner. */
export function collectWedges(c: Construction3, positions: Positions3): Wedge[] {
  /** The wedge's two unit rays from the drawn positions, or null when it has none to compare. */
  const raysOf = (vertex: Id, p: Id, q: Id): [Vec3, Vec3] | null => {
    const v = positions.get(vertex), pp = positions.get(p), qq = positions.get(q);
    if (!v || !pp || !qq) return null;
    const a = sub3(pp, v), b = sub3(qq, v);
    return norm3(a) < 1e-9 || norm3(b) < 1e-9 ? null : [normalize3(a), normalize3(b)];
  };
  const wedges: Wedge[] = [];
  const wedgeOf = (vertex: Id, p: Id, q: Id) => {
    const d = raysOf(vertex, p, q);
    const same = (w: Wedge) =>
      w.vertex === vertex &&
      (d && w.u1 && w.u2
        ? (rayNear(w.u1, d[0]) && rayNear(w.u2, d[1])) || (rayNear(w.u1, d[1]) && rayNear(w.u2, d[0]))
        : (w.p === p && w.q === q) || (w.p === q && w.q === p));
    let w = wedges.find(same);
    if (!w) wedges.push((w = { vertex, p, q, u1: d?.[0] ?? null, u2: d?.[1] ?? null }));
    return w;
  };
  for (const sp of c.scalarPins) if (sp.kind === 'vangle') wedgeOf(sp.vertex, sp.p, sp.q).deg ??= sp.deg;
  for (const cl of c.claims) if (cl.type === 'angle-seg-eq' && cl.a1 === cl.a2) wedgeOf(cl.a1, cl.b1, cl.b2).deg ??= cl.deg;
  for (const mk of c.angleMarks) {
    const w = wedgeOf(mk.vertex, mk.p, mk.q);
    // #986: the arc shows the EXPRESSION, not the binding letter — «2α», not «α» — while `sym` keeps
    // the letter for the machinery that matches on it (the #937 chip below).
    w.label ??= angleMarkText(mk);
    w.sym ??= mk.label;
  }
  return wedges;
}

/**
 * #937 — THE SYMBOLS WHOSE TWO FORMS COMPETE ON THE CANVAS ARC.
 *
 * The operator's ruling is that a chip exists *"only when displays compete"*, and that *"compete"* is
 * a property of a **surface**: an angle's letter and value compete on the arc; a coordinate's compete
 * in the data panel; a symbol nothing renders competes nowhere and gets no chip.
 *
 * For this surface the predicate is structural and needs no second replay: a wedge holding BOTH a
 * label and a `deg` is exactly a corner that renders the letter while the value is absent and the
 * value once it arrives (that is what `degText` does). So it self-extends — any future producer that
 * feeds a wedge both forms competes automatically, with no list of kinds to keep up to date.
 *
 * A wedge whose label is `''` (a bare `∠SDB` marker) names no parameter and contributes nothing: there
 * is no letter for the student to switch back to.
 */
export function competingArcSymbols(wedges: readonly Wedge[]): Set<string> {
  const out = new Set<string>();
  // #986: the SYMBOL, not the displayed expression — a set containing «2α» would match no fact's letter
  // and the chip would quietly stop appearing for every coefficient mark.
  for (const w of wedges) if (w.deg !== undefined && w.sym) out.add(w.sym);
  return out;
}
