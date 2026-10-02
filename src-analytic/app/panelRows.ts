import type { Derivation } from '../engine/derive';
import { isKnowledge, knownCurve, settled, type Figure, type Knowledge } from '../engine/evaluate';
import { VERTICAL_TOL, verticality } from '../engine/lines';
import { lineAngleOf } from './lineAngle';
import { isDirectionSymbol, paramRegister, usedSymbols } from '../engine/carriers';
import { type Construction, type ParamDecl, positionalOf } from '../engine/types';
import { exprText, symbolsOf, type Expr } from '../engine/expr';
import { curveEquationText } from './curveText';
import { isolateRtlName } from '../../shell/bidi';

/**
 * WHICH CURVES THE DATA PANEL LISTS (#1250) — one decision, in one place, so a lock can CALL it.
 *
 * This lived inline in `App.tsx` as `curves.filter((c) => c.stated)`. It is extracted rather than
 * widened in place because a test written against an inline filter has to re-implement it, and a
 * test that reproduces the decision it guards stays green through the change that kills the feature
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
 *
 * ## The rule, and why it is not `stated`
 *
 * Operator ruling, 2026-09-19: *"if we say that a point is on a line, we dont draw the line but if we
 * specifically mention a line, we should have its equation."*
 *
 * So there are two different questions, and they now have different answers:
 *
 * - **the canvas** asks `stated` — is this line DRAWN? («משוואת הצלע CE» draws only the segment)
 * - **the panel** asks this — was this line MENTIONED?
 *
 * They coincided until [ADR-AG-111](../../docs/06c-decisions-analytic.md) made a mentioned line
 * undrawn for the first time, and the equation a student had just written vanished from the one place
 * they check what the tool understood.
 *
 * ## `label.name` IS "mentioned", and not by coincidence
 *
 * A line the student made the SUBJECT of a sentence is one they referred to by name. A line minted
 * only to hold a point — #1078's «B על הישר y=x» — has nothing to call it, and #1078's objection was
 * exactly that: *"there is no way to know what it belongs to"*. That ruling is preserved here, not
 * reversed: an anonymous carrier still gets no row.
 *
 * A second flag (`drawn` beside `listed`) was considered and rejected: it would have to be set
 * correctly at every mint site, while the name already answers truthfully at all of them.
 */

/** The shape both the panel and its locks need — deliberately narrower than `CurveObject`. */
export interface PanelCurve {
  stated: boolean;
  label: { name: string };
}

/** Does this curve get an equation row? */
export const panelListsCurve = (c: PanelCurve): boolean => c.stated || c.label.name !== '';

/**
 * WHAT THE DATA PANEL KNOWS (#1289) — the panel's own knowledge gates, as one callable decision.
 *
 * The parameter, point and equation rows decided `known`/`unknown` inline in `App.tsx`, each calling
 * `isKnowledge` / `knownCurve` itself. A corpus invariant over "what the panel prints as unknown" could
 * then only REPRODUCE those calls, and a lock that reproduces its subject stays green through the change
 * that breaks it ([ADR-W-053](../../docs/06w-decisions-workspace.md)). So the decisions live here, the
 * panel renders from them, and `panel-freedom-invariant-1289.test.ts` asks the same function.
 */
/**
 * A row's verdict. `pending` (#1473, ADR-AG-180) is the page's third state: the configuration pool is
 * still completing after the render, and a value it has so far read as invariant is not yet knowledge —
 * the row shows «בודק…», never the provisional number. Off the page (every lock) the pool is filled
 * first and nothing is ever pending.
 */
export type PanelKnown = Knowledge;

export interface PanelKnowledge {
  /** each non-direction parameter; a symbol nothing reads is never asked of the gate (#1343) */
  readonly params: readonly { sym: string; domain: ParamDecl['domain']; used: boolean; k: PanelKnown }[];
  /** each positional object's coordinates (ADR-AG-003 §2) */
  readonly points: readonly { id: string; x: PanelKnown; y: PanelKnown }[];
  /** each LISTED curve, with its equation when every coefficient is invariant, else null; `pending` = not yet settled (#1473) */
  readonly curves: readonly { id: string; known: ReturnType<typeof knownCurve>; pending: boolean }[];
}

export function panelKnowledge(d: Pick<Derivation, 'construction' | 'figure'>): PanelKnowledge {
  const c = d.construction;
  const used = usedSymbols(c);
  return {
    params: paramRegister(c)
      .filter((p) => !isDirectionSymbol(p.sym))
      .map((p) => {
        const isUsed = used.has(p.sym);
        const k: PanelKnown = isUsed ? isKnowledge(c, (f) => f.env[p.sym] ?? null) : { known: false };
        return { sym: p.sym, domain: p.domain, used: isUsed, k };
      }),
    points: positionalOf(c).map((p) => ({
      id: p.id,
      x: isKnowledge(c, (f) => f.points.find((q) => q.id === p.id)?.x ?? null),
      y: isKnowledge(c, (f) => f.points.find((q) => q.id === p.id)?.y ?? null),
    })),
    curves: d.figure.curves.filter(panelListsCurve).map((cu) => {
      const s = settled(() => knownCurve(c, cu.id));
      return { id: cu.id, known: s.value, pending: s.pending };
    }),
  };
}

/**
 * One row per PAIR of endpoints (#1065).
 *
 * A polygon emits one drawn piece per side, and a student who also states «הקטע AB» would
 * otherwise see `AB` twice. The length is a property of the two points, not of how many things
 * happen to be drawn between them.
 *
 * Moved here from `App.tsx` with the rows' gates (#1473).
 */
export function uniqueSegments<S extends { id: string; ends: [string, string] }>(segments: readonly S[]): S[] {
  const seen = new Set<string>();
  return segments.filter((s) => {
    const key = [...s.ends].sort().join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * THE SLOPE AND LENGTH ROWS' KNOWLEDGE (#1473 — extracted from `App.tsx`, where each row called the gates
 * inline, for the reason `panelKnowledge` was: the #1473 perf lock must CALL the page's synchronous
 * knowledge path, not re-implement it). Per unique drawn segment: is it vertical (judged on the DIRECTION,
 * #1078/#1276 — dy/dx is Infinity there), its slope, its angle with the x-axis (#1322, the ask lane's own
 * `lineAngleOf`) and its length (#1065). Each verdict may be PENDING on the page.
 */
export interface SegmentKnowledge {
  readonly id: string;
  readonly ends: [string, string];
  readonly vertical: PanelKnown;
  readonly slope: PanelKnown;
  readonly angle: ReturnType<typeof lineAngleOf>;
  readonly length: PanelKnown;
}

export function segmentKnowledge(d: Pick<Derivation, 'construction' | 'figure'>): SegmentKnowledge[] {
  const c = d.construction;
  return uniqueSegments(d.figure.segments).map((seg) => {
    const [a, b] = seg.ends;
    const read = (f: Figure) => {
      const p1 = f.points.find((q) => q.id === a);
      const p2 = f.points.find((q) => q.id === b);
      return p1 && p2 ? { dx: p2.x - p1.x, dy: p2.y - p1.y } : null;
    };
    const vertical = isKnowledge(c, (f) => {
      const v = read(f);
      return v === null ? null : verticality(v.dx, v.dy);
    });
    const angle = lineAngleOf(c, read);
    const isVert = vertical.known && vertical.value < VERTICAL_TOL;
    const slope: PanelKnown = isVert
      ? { known: false }
      : isKnowledge(c, (f) => {
          const v = read(f);
          return v === null || Math.abs(v.dx) < 1e-12 ? null : v.dy / v.dx;
        });
    const length = isKnowledge(c, (f) => {
      const v = read(f);
      return v === null ? null : Math.hypot(v.dx, v.dy);
    });
    return { id: seg.id, ends: seg.ends, vertical, slope, angle, length };
  });
}

/**
 * WHAT AN UNFIXED CURVE ROW SAYS (#1023, #1060, #1299; moved here from `App.tsx` by #1659, ADR-AG-203).
 *
 * Its own equation, symbolically, when it has one — and for a circle given by its CENTRE (#1060), the centre
 * and radius it was stated with, because that IS how the student wrote it; a computed circle as what defines
 * it. The dash — the panel's "not determined by the givens" — when there is nothing truthful to say.
 *
 * **An expression that reads a TOOL symbol is not the student's, and is never printed** (#1659). The `θ_`
 * family (`carriers.ts` — a free line's direction, the centre and radius of a circle a tangency sentence
 * created with its centre unnamed) are unknowns the tool made up: the parameter rows already keep them out by
 * `isDirectionSymbol`, and this row printed them raw — «(x − θ_circle-touched.a)² + …». An open curve whose
 * equation is the tool's is exactly "not determined by the givens", so it reads as the dash, the same as every
 * other undetermined row. Asked of the EXPRESSION, never of the object's kind or id, so any future shape the
 * tool creates is covered by the same test. Lived inline in the component, where no lock could call it
 * (ADR-W-053).
 */
export const readsToolSymbol = (e: Expr): boolean => symbolsOf(e).some(isDirectionSymbol);
export function openCurveText(c: Pick<Construction, 'objects'>, id: string): string {
  const o = c.objects.find((q) => q.id === id);
  // #1299 — notation has ONE owner (`curveText.ts`), and it delegates to `lineText` for a line whose
  // coefficients are numbers, so this row and a determined line's row cannot disagree.
  if (o?.kind === 'curve') return readsToolSymbol(o.curve.eq) ? '—' : curveEquationText(o.curve.eq);
  if (o?.kind === 'circle-at') return readsToolSymbol(o.r) ? '—' : `O(${o.centre}), r = ${exprText(o.r)}`;
  // A computed circle (#1464, #1324) is written as what defines it: ⊙ through its points, ⌀ its diameter,
  // and the inscribed circle as the ring it is inscribed in (#1619 B2).
  if (o?.kind === 'circle-thru') {
    if (o.def.t === 'diameter') return `⌀${o.def.a}${o.def.b}`;
    return o.def.t === 'through' ? `⊙${o.def.pts.join('')}` : `○${o.def.pts.join('')}`;
  }
  return '—';
}

/** Does the panel print at least one quantity as UNKNOWN? (the #1289 invariant's right-hand side) */
export const panelShowsUnknown = (pk: PanelKnowledge): boolean =>
  pk.params.some((p) => !p.k.known) ||
  pk.points.some((p) => !p.x.known || !p.y.known) ||
  pk.curves.some((cu) => cu.known === null);

/**
 * WHAT A COMPOSED DATA-PANEL ROW DISPLAYS (#1644, ADR-AG-199) — one function, so a lock can CALL it.
 *
 * The panel's sections are laid out `ltr`, and most rows are pure Latin, which needs nothing. But a
 * row the tree COMPOSES may carry a Hebrew word: the #1036 option set joins its positions with «או»
 * («A = [(3/5, 4/5)] או (4, -2)»), and an unused parameter carries «לא בשימוש». Under the bidi
 * algorithm a European number that follows a right-to-left run takes that run's direction, so the
 * coordinate after «או» was laid out as part of the Hebrew run and read «(2- ,4)» — the operator's
 * *"the −2 is not shown correctly"* (PR #1637 T5, corpus 7/5).
 *
 * **The helper is the LTR-row one, `isolateRtlName` (FSI … PDI), applied to each Hebrew phrase** — the
 * mirror of `isolateLtrRuns`, and the one the design names for Hebrew inside an LTR row (04c, the bidi
 * table; #1344's `namedRow`). Inside an isolate the phrase is skipped when its neighbours resolve, so
 * the digit after «או» finds the row's own Latin letter as its strong neighbour and stays LTR.
 *
 * Two rules keep it from doing harm:
 * - a row with no Hebrew letter is returned exactly as it was — no invisible characters;
 * - a row that ALREADY carries an isolate was composed with its own (the equations row through
 *   `namedRow`, a `t()` string through the i18n post-processor) and is left alone: never nest — an
 *   outer isolate closed by the inner one's PDI is worse than none.
 *
 * Braces first: a subscript the panel writes as `x_B` becomes `x_{B}` for `MathText`.
 */
const HEBREW_PHRASE = /[א-ת][א-ת׳״'"]*(?:\s+[א-ת][א-ת׳״'"]*)*/g;
const ANY_ISOLATE = /[\u2066-\u2069]/;
export const panelRowText = (text: string): string => {
  const braced = text.replace(/([A-Za-z])_([A-Za-z0-9]+)/g, '$1_{$2}');
  return ANY_ISOLATE.test(braced) ? braced : braced.replace(HEBREW_PHRASE, (m) => isolateRtlName(m));
};

/**
 * THE «שיפועים» ROW (#1646, ADR-AG-199) — its parts in a FIXED visual order, each Hebrew part an island.
 *
 * The row is `AB: <slope> · <angle label>: <angle>` in an `ltr` section. The label «זווית עם ציר ה-x»
 * and the vertical verdict «אנכי (אין שיפוע)» are `t()` strings, which the i18n post-processor has
 * ALREADY isolated inside (`ה-` + LRI x PDI). `panelRowText` correctly refuses to re-isolate a row that
 * carries isolates, so the label was laid out loose in the LTR row: its Hebrew reversed with «ה» at the
 * left end and «-x» pushed to its right — «AB: 2 · 63.43° :זווית עם ציר ה-x» as the operator read it.
 *
 * Each part is wrapped WHOLE in `isolateRtlName` (FSI … PDI). That is not nesting in the harmful sense:
 * the string inside is balanced, so its own LRI/PDI pair closes inside the FSI, and the label is one
 * right-to-left island reading «זווית עם ציר ה-x» with «x» after «ה-». A part with no Hebrew letter (a
 * number, «—», the English UI) is untouched. The App renders the result through `panelRowText`, which
 * then sees isolates and only adds braces.
 */
export function slopeRowText(name: string, slope: string, angleLabel: string, angle: string): string {
  return `${name}: ${isolateRtlName(slope)} · ${isolateRtlName(angleLabel)}: ${angle}`;
}
