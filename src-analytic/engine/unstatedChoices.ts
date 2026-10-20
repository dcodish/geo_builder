/**
 * A CHOICE THE TOOL MADE FOR AN UNSTATED GIVEN IS SAID, FOR AS LONG AS IT IS UNSTATED (#1864,
 * [ADR-AG-267](../../docs/06c-decisions-analytic.md#adr-ag-267)) — 2-D's `unstatedChoices` (ADR-502), ported as a
 * ruling, never as code (the trees share rulings, not modules).
 *
 * Operator, #973: *"add a message that the image doesnt know or assume which of the sides are equal and that the
 * user should specifically say which are equal"*; 2026-09-11: *"we should keep the message up as long as its not
 * defined"* (docs/10 P4). Analytic already HOLDS every such choice — an open `choice` constraint, a region `choice`
 * selector, or a parallel pair marked `assumed` — and nothing read them back to the student.
 *
 * **Pure over the derivation, and structural.** Each choice is classified by WHAT ITS OPTIONS ARE, never by the
 * sentence that opened it, so a noun added to the registry that opens the same kind of choice is said with no
 * second registration:
 *
 *  - `equal-pair` — a constraint `choice` whose every option is one or more equalities between two segments
 *    («משולש שווה שוקיים», and «אורך השוק AB הוא 5» on a plain triangle);
 *  - `axes` — a constraint `choice` whose every option puts each named vertex on the x- or the y-axis
 *    («קודקודי המשולש מונחים על הצירים»);
 *  - `obtuse-vertex` — a region `choice` whose every option is one angle greater than 90° («משולש קהה זווית ABC»);
 *  - `parallel-pair` — a parallel relation still `assumed` (#1159) on a ring whose noun promises one parallel
 *    pair — the analytic twin of 2-D's `trapezoidRingInForce` rule.
 *
 * Every other choice is NOT said: a right angle's seat (withdrawn, ADR-556 — B10), two circles' tangency, a sine's
 * two angles, an inscribed square's placement. Those are the plan's and the operator's lines, not omissions.
 *
 * **"For as long as it is unstated" is the apply step's own structure**: a stated option replaces its choice
 * (#1049), a stated part narrows it (ADR-AG-267), a stated region replaces its region choice, a named pair pins or
 * displaces the assumption (#1159). A choice left with one option is no longer the tool's, and is not said.
 *
 * **"Unstated" is also judged on the configuration POOL** (#2233, [ADR-AG-290](../../docs/06c-decisions-analytic.md#adr-ag-290)):
 * the apply step's narrowing is SYNTACTIC — it removes an option only when a statement names part of it — so a sign
 * («x_A > 0»), an axis side, a coordinate or the geometry itself can leave one option drawable while several stay
 * written. A choice is said only while the admitted configurations (`admittedPool`, the set `isKnowledge` reads) do
 * not AGREE on an option: no option holds in every one. For `axes`, `open` is the vertices whose axis differs across
 * them. While the pool cannot tell (deferred and incomplete on the page, starved, none admitted) the note stays as
 * the written options say — it never flickers off and back on. The assumed parallel pair is NOT judged this way: the
 * assumption is imposed in every configuration, so the pool cannot see its alternative (#2284).
 *
 * **WHICH option is drawn is read off the drawn figure** (#1719's rule, as `statedMeasures` reads it): `drawableAt`
 * may have drawn another seed's configuration, so the seed alone does not say.
 */
import type { Derivation } from './derive';
import { admittedPool, holdsOn, selectorsHold, type Figure } from './evaluate';
import { parseLengthExpr } from './lengths';
import { promisesOneParallelPair } from './shapes';
import { sameConstraint, type Constraint } from './solve';
import { assignmentAt } from './discreteAxes';
import type { Id, Selector } from './types';

/** A segment as two point ids, in the spelling its constraint carries. */
export type Seg = readonly [Id, Id];

export type UnstatedChoice =
  /** Which segments are equal — `pairs` is the drawn option's equalities («AB = AC»; a two-pair option lists both). */
  | { kind: 'equal-pair'; line: number; pairs: Array<readonly [Seg, Seg]> }
  /** Which sides are parallel — the assumed pair, and the LEGS when an equality between the other two sides holds. */
  | { kind: 'parallel-pair'; line: number; parallel: readonly [Seg, Seg]; legs?: readonly [Seg, Seg] }
  /** Which vertex's angle is obtuse — the drawn one. */
  | { kind: 'obtuse-vertex'; line: number; vertex: Id }
  /**
   * Which vertex lies on which axis — the drawn assignment, in the option's vertex order. `open`: the vertices whose
   * axis still differs between the options left (a stated «A על ציר ה-x» narrows the choice, ADR-AG-267), so the
   * line the note teaches is never one the student already typed.
   */
  | { kind: 'axes'; line: number; onX: Id[]; onY: Id[]; open: Id[] };

export type UnstatedChoiceKind = UnstatedChoice['kind'];
/** Runtime list — the wording lock walks it against both locales. */
export const UNSTATED_CHOICE_KINDS: readonly UnstatedChoiceKind[] = ['equal-pair', 'parallel-pair', 'obtuse-vertex', 'axes'];

type Choice = Extract<Constraint, { t: 'choice' }>;
type LengthEq = Extract<Constraint, { t: 'length-eq' }>;

/** A bare segment-to-segment equality («AB = AC»), as its two segments — null for anything else. */
function segmentEquality(k: Constraint): readonly [Seg, Seg] | null {
  if (k.t !== 'length-eq') return null;
  const seg = (le: LengthEq['left']): Seg | null => {
    if (le.terms.length !== 1) return null;
    const t = le.terms[0] as { kind?: string; a?: Id; b?: Id };
    // The expression must be the term itself — «AB = 2AC» is a ratio, not an equal pair.
    if ((t.kind !== undefined && t.kind !== 'length') || !t.a || !t.b || le.expr.kind !== 'sym') return null;
    return [t.a, t.b];
  };
  const l = seg(k.left);
  const r = seg(k.right);
  return l && r ? [l, r] : null;
}

/** An option's members — itself, or the statements an `all` option conjoins. */
const membersOf = (o: Constraint): Constraint[] => (o.t === 'all' ? o.of : [o]);

/** The axis a constraint puts its point on — null when it is not an incidence with a coordinate axis. */
function axisOf(k: Constraint): { id: Id; axis: 'x' | 'y' } | null {
  if (k.t !== 'on-line') return null;
  const { a, b, c } = k as { a: unknown; b: unknown; c: unknown };
  if (c !== 0) return null;
  if (a === 0 && b === 1) return { id: k.id, axis: 'x' };
  if (a === 1 && b === 0) return { id: k.id, axis: 'y' };
  return null;
}

/** An obtuse-angle region — «∠A > 90°» — as its vertex; null for any other selector. */
function obtuseVertexOf(s: Selector): Id | null {
  if (s.kind !== 'sign' || !s.positive || s.q.k !== 'order') return null;
  const { left, right } = s.q;
  if (left.t !== 'angle' || right.t !== 'value' || right.value.kind !== 'num' || right.value.value !== 90) return null;
  return left.at.v;
}

/** The option of a constraint choice the drawn figure took (#1719): the first that holds on it, else the seed's. */
function drawnOption(d: Derivation, k: Choice): Constraint {
  const held = k.options.find((o) => holdsOn(d.construction, o, d.figure));
  if (held) return held;
  // #2381 (ADR-AG-302): THIS choice's own digit of the drawn assignment — `[k]` alone read slot 0's.
  return assignmentAt(d.construction, d.figure.choiceSeed ?? d.seed).picked.get(k) ?? k.options[0];
}

/** The option of a region choice the drawn figure took: the first whose region holds at its positions. */
function drawnRegion(d: Derivation, s: Extract<Selector, { kind: 'choice' }>): Selector {
  const pos = new Map(d.figure.points.map((p) => [p.id, { x: p.x, y: p.y }]));
  const held = s.options.find((o) => selectorsHold({ ...d.construction, selectors: [o] }, pos, d.figure.env));
  if (held) return held;
  return assignmentAt(d.construction, d.figure.choiceSeed ?? d.seed).pickedRegions.get(s) ?? s.options[0];
}

/** The figure's positions, as `selectorsHold` reads them. */
const positionsOf = (f: Figure) => new Map(f.points.map((p) => [p.id, { x: p.x, y: p.y }]));

/**
 * DO THE ADMITTED CONFIGURATIONS AGREE ON AN OPTION? (#2233) — true when one option holds in every one of them: the
 * givens settled the choice, whatever spelling settled it. `null` pool (it cannot tell yet) is never agreement.
 */
function poolAgrees<O>(pool: readonly Figure[] | null, options: readonly O[], holds: (o: O, f: Figure) => boolean): boolean {
  return pool !== null && options.some((o) => pool.every((f) => holds(o, f)));
}

/** The ring an assumed parallel pair belongs to — a declared polygon whose noun promises one parallel pair. */
function trapezoidOf(d: Derivation, k: Extract<Constraint, { t: 'relation' }>): Id[] | null {
  if (k.u.k !== 'points' || k.v.k !== 'points') return null;
  const key = (a: Id, b: Id) => [a, b].sort().join('');
  const sides = [key(k.u.a, k.u.b), key(k.v.a, k.v.b)].sort().join('|');
  for (const o of d.construction.objects) {
    if (o.kind !== 'polygon' || o.vertices.length !== 4 || !promisesOneParallelPair(o.noun)) continue;
    const [a, b, c, e] = o.vertices;
    if ([key(a, b), key(c, e)].sort().join('|') === sides || [key(b, c), key(e, a)].sort().join('|') === sides) return o.vertices;
  }
  return null;
}

export function unstatedChoices(d: Derivation): UnstatedChoice[] {
  const faulted = new Set(d.faults.map((f) => f.index));
  const out: UnstatedChoice[] = [];
  const said = (line: number) => line >= 0 && !faulted.has(line);
  // The pool is read only when a choice is there to judge — once, shared by every choice on the figure.
  let pool: Figure[] | null | undefined;
  const poolOnce = () => (pool === undefined ? (pool = admittedPool(d.construction)) : pool);

  d.construction.constraints.forEach((k, at) => {
    const line = d.constraintLine[at] ?? -1;
    if (!said(line)) return;

    if (k.t === 'choice' && k.options.length > 1) {
      const equalities = k.options.map((o) => membersOf(o).map(segmentEquality));
      if (equalities.every((ms) => ms.length > 0 && ms.every((m) => m !== null))) {
        if (poolAgrees(poolOnce(), k.options, (o, f) => holdsOn(d.construction, o, f))) return;
        const pairs = membersOf(drawnOption(d, k)).map((m) => segmentEquality(m)!);
        out.push({ kind: 'equal-pair', line, pairs });
        return;
      }
      const axes = k.options.map((o) => membersOf(o).map(axisOf));
      if (axes.every((ms) => ms.length > 0 && ms.every((m) => m !== null))) {
        const drawn = membersOf(drawnOption(d, k)).map((m) => axisOf(m)!);
        const axisIn = (ms: Array<{ id: Id; axis: 'x' | 'y' } | null>, id: Id) => ms.find((m) => m!.id === id)?.axis;
        const written = drawn.map((m) => m.id).filter((id) => new Set(axes.map((ms) => axisIn(ms, id))).size > 1);
        const figs = poolOnce();
        // The pool's reading: per configuration, the option it holds (its first, as `drawnOption` reads it); a vertex
        // is open while two configurations put it on different axes. A configuration holding none is no evidence.
        const open =
          figs === null
            ? written
            : written.filter((id) => {
                const seen = new Set<'x' | 'y' | undefined>();
                for (const f of figs) {
                  const at = k.options.findIndex((o) => holdsOn(d.construction, o, f));
                  if (at >= 0) seen.add(axisIn(axes[at], id));
                }
                return seen.size > 1;
              });
        if (open.length === 0) return;
        out.push({ kind: 'axes', line, onX: drawn.filter((m) => m.axis === 'x').map((m) => m.id), onY: drawn.filter((m) => m.axis === 'y').map((m) => m.id), open });
      }
      return;
    }

    if (k.t === 'relation' && k.rel === 'parallel' && k.assumed) {
      const ring = trapezoidOf(d, k);
      if (!ring || k.u.k !== 'points' || k.v.k !== 'points') return;
      const parallel: readonly [Seg, Seg] = [[k.u.a, k.u.b], [k.v.a, k.v.b]];
      // The legs are the OTHER opposite pair, in 2-D's spelling (AD, BC); said when an equality between them holds as
      // a given — the isosceles trapezoid's own, or one the student stated (2-D's `legsStated`, measured at 403efe66).
      const [a, b, c, e] = ring;
      const pairAB = [a, b].sort().join('') === [k.u.a, k.u.b].sort().join('') || [a, b].sort().join('') === [k.v.a, k.v.b].sort().join('');
      const legs: readonly [Seg, Seg] = pairAB ? [[a, e], [b, c]] : [[a, b], [e, c]];
      const legsEqual: Constraint = {
        t: 'length-eq',
        left: parseLengthExpr(legs[0].join(''))!,
        right: parseLengthExpr(legs[1].join(''))!,
      };
      const stated = d.construction.constraints.some((q) => sameConstraint(q, legsEqual));
      out.push(stated ? { kind: 'parallel-pair', line, parallel, legs } : { kind: 'parallel-pair', line, parallel });
    }
  });

  d.construction.selectors.forEach((s, at) => {
    const line = d.selectorLine[at] ?? -1;
    if (!said(line) || s.kind !== 'choice' || s.options.length < 2) return;
    if (!s.options.every((o) => obtuseVertexOf(o) !== null)) return;
    if (poolAgrees(poolOnce(), s.options, (o, f) => selectorsHold({ ...d.construction, selectors: [o] }, positionsOf(f), f.env))) return;
    out.push({ kind: 'obtuse-vertex', line, vertex: obtuseVertexOf(drawnRegion(d, s))! });
  });

  return out.sort((x, y) => x.line - y.line);
}
