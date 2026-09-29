/**
 * The apply boundary — the ONE place that decides whether a statement creates something new or
 * says something about what already exists.
 *
 * This is **M1 — existing-id lowering** ([docs/17](../../docs/17-design-rules.md)), and it is here
 * on day one deliberately: [ADR-AG-003](../../docs/06c-decisions-analytic.md#adr-ag-003) records
 * that a bagrut question arrives in SECTIONS, that the fact list accumulates across all of them,
 * and that section ב routinely restates or names what section א established. Without a single
 * apply-boundary decision, every second section of every question is a false conflict — and
 * retrofitting it per parser rule is exactly the drift docs/17 forbids.
 *
 * V0 dispositions are deliberately narrow, but the BOUNDARY is complete: a restatement that agrees
 * is absorbed (no duplicate row, no re-creation), one that disagrees is refused by naming the
 * conflicting STATEMENT rather than internal state. Richer lowerings — a restatement becoming a
 * constraint that drives a free figure — attach to this same function when the constraint layer
 * lands, and nowhere else.
 */
import { fitConic } from './conic';
import { bareLineName, lineIdOf, nameReading, numeralCurveId, numeralTwin, refKindOf, statedName, type RefKind } from './names';
import { parabolaDirectrix, resolveCurve } from './curves';
import { parseLengthExpr } from './lengths';
import { curveParentsOf, parentsOf, type DerivedRule } from './derived';
import { sameDerivation } from './sameDerivation';
import { constraintCurveRefs, constraintRefs, dirRefs, isAngleRef, sameConstraint, type AngleName, type AngleRef } from './solve';
import { displacedAssumption, isGenericNoun, namesOption, rightAngleAt, ringsNamed, shapeRow } from './shapes';
import { evalExpr, symbolsOf, type Env, type Expr } from './expr';
import { RESERVED_SYMBOLS } from './carriers';
import {
  EMPTY_CONSTRUCTION,
  inDomain,
  circleDefPoints,
  curveByName,
  diameterCircleId,
  isPositional,
  namesObject,
  objectById,
  type Construction,
  type Curve,
  type CurveObject,
  type Domain,
  type Fact,
  type GeoObject,
  type Id,
  type PointObject,
  type PolygonObject,
} from './types';

export type ApplyErrorCode =
  /** A restatement that contradicts what the figure already holds. */
  | 'conflicting-restatement'
  /** A name used for two different kinds of object. */
  | 'name-kind-clash'
  /**
   * A statement that refers to a point the figure does not have (#1028).
   *
   * «M אמצע AB» before `A` exists is not a reason to invent `A` — an auto-created vertex would be a
   * position the question never gave ([ADR-052](../../docs/06-decisions.md#adr-052)), and it would
   * silently spend a letter the student is about to use themselves (the ADR-297 class). Refusing
   * here is also what guarantees a parent always precedes its dependent, which is why evaluation
   * needs no topological sort (`carriers.ts` `depsPrecedeDependents`).
   */
  | 'unknown-reference'
  /**
   * A named object that cannot exist in this figure at all (#1058).
   *
   * Distinct from `unsatisfiable`, which is a given the solve could not MEET. This one is a construct
   * whose definition has no answer here — a concave quadrilateral's diagonal meet, three collinear
   * points' circumcentre — in a figure with no freedom left to try elsewhere.
   */
  | 'does-not-exist'
  /**
   * The student PINNED the coordinates, and in that order they do not make the shape they named
   * (#1170) — «A(0,0) B(4,0) C(1,1) D(1,0)» then «מרובע ABCD», where A, D and B are collinear so
   * the "quadrilateral" is a triangle with a spare vertex; or four pinned points written in a
   * bow-tie order, where the ring crosses itself.
   *
   * Distinct from every neighbour above. `unsatisfiable` is a given the solve could not MEET, and
   * there is nothing here the solve failed at — the figure is exactly what was asked for.
   * `does-not-exist` is a construct with no answer in this figure. This one is the NOUN: a shape
   * word promises a ring, and these points are not that ring.
   *
   * It fires only where `reportedDof === 0`. With the polygon-noun preference inside the
   * configuration search (ADR-AG-080), a figure that still has freedom never arrives carrying a
   * ring fault — it found a valid configuration. So this is always about coordinates the student
   * wrote, never about a search that ran out.
   */
  | 'ring-contradicts-noun'
  /**
   * «זווית B ישרה» where the vertex alone does not name an angle (#1049).
   *
   * A vertex names an angle only when the figure says which two rays meet there. With no shape
   * through the point — or with more than one — the honest answer is to say so and name the
   * format that IS unambiguous («זווית ABC ישרה»), rather than pick a pair of rays and assert a
   * given the student never gave.
   */
  | 'ambiguous-angle'
  /**
   * «שטח הדלתון הוא 24» with no kite in the figure, or with two of them (#1049).
   *
   * The contextual half of `ambiguous-angle`, and the same discipline: a reference that names no
   * single object is answered by saying so, never by picking one.
   */
  | 'ambiguous-shape'
  /**
   * A numeral name written in the OTHER notation from the one the figure already uses — «ישר I» when
   * the line is «ישר 1» (operator ruling 2026-09-29, ADR-AG-170 Am. 2). «1» and «I» are ONE name, so
   * this is never a second object; and it is never silently merged either: the student is asked to
   * keep one notation. `detail` is the numeral they typed, `holder` the one in use, `expected` the kind.
   */
  | 'numeral-notation'
  /**
   * «האלכסון הראשי» in a shape whose noun distinguishes no principal diagonal (#1070).
   *
   * A kite has one — its axis of symmetry is a fact about the figure. A plain quadrilateral, a
   * parallelogram and a rhombus do not, and picking one would assert a distinction the question
   * never made. The message names the endpoints form instead.
   */
  | 'undistinguished-diagonal'
  /**
   * NAMING SOMETHING THAT ALREADY HAS A NAME (#1153).
   *
   * «P מרכז המעגל I» then «O מרכז המעגל I» minted a SECOND point on top of the first, and a
   * third naming minted a third — three letters stacked on one position, no fault, nothing said.
   * A position carries at most one name, so the second naming is refused and the message names the
   * holder: *"the centre of the circle is already called P"*.
   *
   * Operator ruling, 2026-09-17: refuse and name the holder; renaming is an explicit action the
   * student takes, never a silent substitution.
   */
  | 'already-named'
  /**
   * The two PARSER refusals a construction can also reach at M1 (#1464, #1324), with the parser's own
   * messages: «מעגל AAB» names the same point twice (`repeated-vertex`), and «BD קוטר במעגל I» over a circle
   * known only by its equation is understood but has no centre point to state the midpoint of (`out-of-scope`).
   */
  | 'repeated-vertex'
  | 'out-of-scope'
  /**
   * A STATED value substituted into a symbol whose domain it violates (#1432 amendment 1) — «רדיוס
   * המעגל הוא -3», «שרדיוסו 0». The radius symbol carries `{min: 0, minOpen}` and the substitution
   * used to drop it unchecked, so the circle vanished with no message. Checked at the ONE seam every
   * stated-value substitution passes (`substituteStated`), for any domained symbol; `domain` carries
   * the bound for the locale to word.
   */
  | 'out-of-domain'
  /** A stated given the solve could not satisfy — reported, never drawn as if it held. */
  | 'unsatisfiable';

/**
 * WHICH OBJECT a contextual reference needed, and how many the figure holds (#1432 amendment 1).
 *
 * `ambiguous-shape` used to carry only the sentence, so every contextual refusal — «רדיוס המעגל הוא
 * 5» with no circle, «F מוקד הפרבולה» with no parabola — taught the kite-area example the message was
 * written for. The host KIND is what picks the remedy (name the circle, draw the parabola first);
 * `need` is 2 for the crossing of two unnamed curves, else 1. Absent for the polygon-noun sites
 * (area, meet), whose kite example is the right remedy.
 */
export interface HostRef {
  kind: 'circle' | 'parabola' | 'ellipse' | 'line' | 'polygon';
  found: number;
  need?: number;
  /**
   * How the student can call each object FOUND, when there are several named curves to choose from
   * (#1514 pre-play, merged into this one seam): its name («I», «II») or, unnamed, its equation — both
   * of which the operand resolver reads back — so the refusal names them and shows the student's own
   * sentence with a name in it («P על הפרבולה I»).
   */
  candidates?: string[];
}

export interface ApplyError {
  code: ApplyErrorCode;
  /** The student's own words, so the message can name the STATEMENT and never internal state. */
  detail: string;
  /**
   * For a clash: WHAT the name already holds, as a stable token the locale renders (#1046).
   *
   * «השם כבר משמש עצם מסוג אחר» told the student they had picked a bad name. They had not — `M` is
   * a perfectly good name, already taken by something they themselves defined, and the message
   * sent them to fix the letter instead of showing them the collision. A refusal that misdescribes
   * the problem is worse than one that is merely narrow.
   *
   * A TOKEN, never a sentence: the engine stays language-free, and He/En render it in `App.tsx`.
   */
  existing?: ExistingKind;
  /**
   * WHAT KIND of object the statement expected to find (#1179).
   *
   * #1145 fixed which WORD a refusal quotes (`l7`, not `line-l7`); this is the sentence around it.
   * One point-shaped string served every missing reference, so a student who wrote «הישר l7» was told
   * «הנקודה l7 עדיין לא הוגדרה» — the right word in the wrong sentence, which sends them off to define
   * a POINT called `l7`. #1150's new curve check made that path far easier to reach, which is why it
   * surfaced on the first play.
   *
   * A TOKEN, never a sentence — the same contract `existing` already has (#1046): the engine stays
   * language-free and the locale picks the noun, which matters more in Hebrew than in English because
   * the gender carries through the whole sentence («הנקודה … הוגדרה» vs «הישר … הוגדר»).
   */
  expected?: RefKind;
  /**
   * WHO ALREADY HOLDS the position a naming tried to claim (#1153).
   *
   * The student's own letter for it — «מרכז המעגל כבר נקרא P» — so the refusal SHOWS them the
   * collision instead of telling them their letter was bad. A name, never a sentence: the engine
   * stays language-free and the locale builds the message around it.
   */
  holder?: Id;
  /**
   * The THREE-LETTER name an ambiguous one-letter angle needs (#1407, ADR-AG-158) — «ACB» for «זווית C»
   * when more than two edges meet at C. Read off the first shape through the vertex (else its first two
   * edges), rays sorted, so the student's own line with the letter replaced by this name is a line the tool
   * builds. Absent when FEWER than two edges meet there: there is no pair of rays to teach, and inventing one
   * would be a guess.
   */
  example?: string;
  /** For `ambiguous-shape`: the kind the reference needed and how many the figure holds (#1432 am. 1). */
  host?: HostRef;
  /** For `out-of-domain`: the bound the stated value violates (#1432 am. 1). */
  domain?: Domain;
}

/** How a found curve can be called in a sentence — its name, or (unnamed) its equation. */
function callable(o: GeoObject): string {
  if (o.kind === 'curve' && o.id.startsWith('curve-')) return o.label.eqSrc ?? '';
  if (o.kind === 'circle-thru' && o.name) return o.name;
  return statedName(o.id);
}

/**
 * THE ONE REFUSAL for a contextual reference that found `found` objects of `kind` where it needed
 * `need` (default 1) — #1432's host seam, which #1514's ambiguous-curve refusal now rides: pass the
 * objects themselves and, when more than one was found, the refusal carries how to CALL each.
 */
function noHost(detail: string, kind: HostRef['kind'], found: number | readonly GeoObject[], need?: number): ApplyError {
  const n = typeof found === 'number' ? found : found.length;
  const candidates = typeof found === 'number' || n < 2 ? [] : found.map(callable).filter((x) => x !== '');
  return {
    code: 'ambiguous-shape',
    detail,
    host: { kind, found: n, ...(need !== undefined ? { need } : {}), ...(candidates.length ? { candidates } : {}) },
  };
}

/**
 * THE ONE SEAM A STATED VALUE PASSES ON ITS WAY INTO A DOMAINED SYMBOL (#1432 amendment 1).
 *
 * A symbol declared with a domain — a circle's free radius `r_O` (> 0), a parameter «a > 0» — may
 * be REPLACED by a value the student states. The replacement is only honest if the value lies in
 * the domain: «רדיוס המעגל הוא -3» substituted −3 for a symbol that promised a positive radius, and
 * the circle vanished from the canvas with no message. So every such substitution asks here first:
 *
 * - a CONSTANT is checked exactly — outside the domain is `out-of-domain`, naming the statement;
 * - a lone PARAMETER («שרדיוסו a») inherits the domain: it is merged into that parameter's own
 *   declaration (the `param` merge «a הוא פרמטר» · «a>0» already uses), and an empty intersection
 *   («a<0» · «שרדיוסו a») is refused — the parameter can then never make the value admissible;
 * - any other parametric expression is judged at the probe environments: admissible at none of
 *   them is refused; admissible at some is accepted, because the domain of `2a` is not a thing this
 *   seam can carry back onto `a` (named in ADR-AG-169 am. 1 as not built).
 *
 * ONE domain predicate (`inDomain`, `types.ts`) serves both judges of a radius: this seam judges a
 * STATED value, so it calls it with the default floor 0 — the exact bound, «0» is not > 0; the
 * solve's judge (`openBoundFloor`, #1504 am. 1) passes the solver resolution, because a SOLVED value
 * parked within it of the bound is the bound. Same predicate, the floor says whose number it is.
 *
 * Returns the construction with the parameter narrowed (or unchanged), or the refusal.
 */
function admitStated(
  c: Construction,
  domain: Domain | undefined,
  value: Expr,
  src: string,
): { ok: true; next: Construction } | { ok: false; error: ApplyError } {
  if (!domain || (domain.min === undefined && domain.max === undefined && !domain.exclude?.length)) return { ok: true, next: c };
  const refuse = { ok: false as const, error: { code: 'out-of-domain' as const, detail: src, domain } };
  const syms = symbolsOf(value).filter((s) => !RESERVED_SYMBOLS.has(s));
  if (syms.length === 0) {
    return inDomain(domain, evalExpr(value, {})) ? { ok: true, next: c } : refuse;
  }
  if (value.kind === 'sym') {
    // The ONE domain merge («a הוא פרמטר» · «a>0»), not a second copy of it.
    const r = applyFact(c, { t: 'param', sym: value.name, domain, src });
    if (!r.ok) return r;
    const merged = r.next.params.find((p) => p.sym === value.name)?.domain;
    const empty =
      merged?.min !== undefined &&
      merged.max !== undefined &&
      (merged.min > merged.max || (merged.min === merged.max && (merged.minOpen || merged.maxOpen)));
    return empty ? refuse : { ok: true, next: r.next };
  }
  const somewhere = PROBE_ENVS.some((env) => inDomain(domain, evalExpr(value, env)));
  return somewhere ? { ok: true, next: c } : refuse;
}

/**
 * The kind of object an id names, read from the prefix the PARSER minted (#1179).
 *
 * Curves are prefixed so that a circle and a point may both be called `I`; points are bare. So the id
 * alone answers this at every refusal site, and no call site has to remember to say — which is what
 * keeps the next site that is handed a curve id from repeating the defect.
 *
 * An ANONYMOUS curve (`curve-<hash>`) gets the kind-free wording: it has no name the student wrote, so
 * there is no noun that would be true.
 */
// The table itself lives in `names.ts` (#1514 pre-play): it knew `line-`/`circle-` only, so a named
// parabola was called a POINT and printed as its raw id. Re-exported so every caller keeps its import.
export { refKindOf, statedName, type RefKind } from './names';

/**
 * The refusal for a numeral name typed in the notation the figure does NOT use (ruling 2026-09-29),
 * or null when `id` has no twin. Asked at the two places a numeral name meets the figure: where it
 * fails to resolve (`unknownRef`) and where it is minted (the top of `applyFact`).
 */
function notationMix(c: Construction, id: Id): ApplyError | null {
  const twin = numeralTwin(c.objects.map((o) => o.id), id);
  return twin ? { code: 'numeral-notation', detail: statedName(id), holder: statedName(twin), expected: refKindOf(id) } : null;
}

/**
 * A line's NAME TOKENS as the student wrote them (#1350): the name in its id («l3» of `line-l3`) and its
 * display name with the line noun stripped («ישר 3» → «3»), so a line narrowed from an anonymous one
 * still answers. Only LINES — «מעגל 3» is a different noun and reads as a different thing — and an
 * anonymous curve's hash is no name at all.
 */
function lineTokens(id: Id, shown: string | undefined, isLine: boolean): string[] {
  if (!isLine) return [];
  const out = new Set<string>();
  if (refKindOf(id) === 'line') out.add(statedName(id));
  if (shown) out.add(bareLineName(shown));
  return [...out];
}
const objectLineTokens = (o: GeoObject): string[] =>
  o.kind === 'line-at'
    ? lineTokens(o.id, o.name, true)
    : o.kind === 'curve'
      ? lineTokens(o.id, o.label.name, refKindOf(o.id) === 'line' || curveKindOf(o) === 'line')
      : [];
const factLineTokens = (f: Fact): string[] =>
  f.t === 'line-at'
    ? lineTokens(f.id, f.name, true)
    : f.t === 'curve'
      ? lineTokens(f.id, f.label.name, refKindOf(f.id) === 'line' || f.curve.kind === 'line' || f.label.kind === 'line')
      : [];

/**
 * THE OTHER LINE THIS NAME READS AS (#1350, ADR-AG-183) — the question beside #1342's `already-named`,
 * one axis over. That one asks *"does the figure hold THIS LINE under another name?"* (identity by
 * content); this asks *"does the figure hold ANOTHER LINE under a name the student reads as this one?"*
 * (identity by reading). The taken-name check compared TOKENS, so «הישר l3» then «הישר 3» recorded two
 * lines both called "3" with nothing said.
 *
 * Answered only for a name NEW to the figure — a name already held is a restatement, which is its own
 * id's business (`known`, a promotion, or `conflicting-restatement`) — and compared through
 * `nameReading`, so no pair gets a rule of its own.
 */
function readingTwin(c: Construction, f: Fact): ApplyNotice | undefined {
  if (f.t !== 'curve' && f.t !== 'line-at') return undefined;
  const incoming = factLineTokens(f);
  const readings = new Set(incoming.map(nameReading).filter((r): r is string => r !== null));
  if (readings.size === 0) return undefined;
  const others = c.objects.filter((o) => o.id !== f.id).map((o) => objectLineTokens(o));
  if (others.some((tokens) => tokens.some((t) => incoming.includes(t)))) return undefined;
  for (const tokens of others) {
    const hit = tokens.find((t) => {
      const r = nameReading(t);
      return r !== null && readings.has(r);
    });
    if (hit) return { code: 'name-reads-as', detail: incoming[0], holder: hit };
  }
  return undefined;
}

/** The one refusal for "the figure has no such thing", naming it the student's way and by its kind. */
function unknownRef(c: Construction, id: Id): ApplyError {
  return notationMix(c, id) ?? { code: 'unknown-reference', detail: statedName(id), expected: refKindOf(id) };
}

/**
 * The figure's DISTINCT EDGES at a vertex — every drawn segment and every shape side through it, one entry per
 * other end (#1407 ruling, 2026-09-27). The port of 2-D's `pointNeighbors` (`src/engine/step.ts`): a side
 * stated twice, by two shapes or by a shape and a segment, is ONE edge, because it is one line on the page.
 * Sorted, so a caller that reads a pair off it gets the ray order the parser gives the three-letter twin.
 */
function edgesAt(c: Construction, v: Id): Id[] {
  const out = new Set<Id>();
  for (const o of c.objects) {
    if (o.kind === 'segment') {
      if (o.a === v && o.b !== v) out.add(o.b);
      else if (o.b === v && o.a !== v) out.add(o.a);
    } else if (o.kind === 'polygon') {
      const ring = o.vertices;
      ring.forEach((p, i) => {
        if (p !== v) return;
        for (const q of [ring[(i - 1 + ring.length) % ring.length], ring[(i + 1) % ring.length]]) {
          if (q !== v) out.add(q);
        }
      });
    }
  }
  return [...out].sort();
}

/**
 * A lone VERTEX resolved to the angle it names in this figure (#1049, #1407) — the ONE resolver behind
 * «זווית B ישרה», «זווית C = 60» and «∠B = ∠C».
 *
 * 2-D's rule (`src/parser/parse.ts`, the bare-vertex angle: `nb.length !== 2` → `ambiguous-angle`), by
 * operator ruling on #1407 (2026-09-27): a lone vertex names an angle exactly when the figure draws TWO
 * distinct edges at it — {@link edgesAt}, the union over every shape and segment. How many SHAPES hold the
 * vertex is not the question: after «משולש ABC» · «מרובע ABCD», B has BA and BC in both, so «זווית B» can
 * only be ∠ABC. With more than two edges (C there: CA, CB, CD) the vertex has several angles, and the
 * refusal names a real one in three letters (`example`): the first shape's angle through the vertex, else
 * the first two edges. With fewer than two there are no arms yet, and it refuses with no example — any pair
 * would be a guess. A name that is already three letters passes through untouched.
 */
function resolveAngleName(
  c: Construction,
  n: AngleName,
  src: string,
): { ok: true; ref: AngleRef } | { ok: false; error: ApplyError } {
  if (isAngleRef(n)) return { ok: true, ref: n };
  const host = objectById(c, n.v);
  if (!host || !isPositional(host)) return { ok: false, error: unknownRef(c, n.v) };
  const edges = edgesAt(c, n.v);
  if (edges.length === 2) return { ok: true, ref: { v: n.v, a: edges[0], b: edges[1] } };
  let taught: [Id, Id] | null = null;
  if (edges.length > 2) {
    const ring = (c.objects.find((g) => g.kind === 'polygon' && g.vertices.includes(n.v)) as PolygonObject | undefined)
      ?.vertices;
    if (ring) {
      const i = ring.indexOf(n.v);
      const pair = [ring[(i - 1 + ring.length) % ring.length], ring[(i + 1) % ring.length]].sort();
      taught = [pair[0], pair[1]];
    } else {
      taught = [edges[0], edges[1]];
    }
  }
  return {
    ok: false,
    error: {
      code: 'ambiguous-angle',
      detail: src,
      ...(taught ? { example: `${statedName(taught[0])}${statedName(n.v)}${statedName(taught[1])}` } : {}),
    },
  };
}

/** What a name already holds, in terms the student can recognise — see `ApplyError.existing`. */
export type ExistingKind =
  | 'point'
  | 'free'
  | 'segment'
  | 'polygon'
  | `curve:${string}`
  /** A circle stated by its CENTRE rather than by an equation (#1060). */
  | 'circle-at'
  | 'line-at'
  /** A circle COMPUTED from points (#1464). */
  | 'circle-thru'
  | `derived:${string}`;

export function existingKindOf(o: GeoObject): ExistingKind {
  switch (o.kind) {
    case 'curve':
      return `curve:${o.label.kind}`;
    case 'derived':
      return `derived:${o.rule.t}`;
    case 'circle-at':
      return 'circle-at';
    case 'line-at':
      return 'line-at';
    case 'circle-thru':
      return 'circle-thru';
    default:
      return o.kind;
  }
}

/**
 * What a statement DID — the third answer the submit path was missing (#1045).
 *
 * `applyFact` has distinguished "created something" from "said something about what exists" since
 * V0, but as a boolean `absorbed`, and the `true` side covered two genuinely different events:
 *
 *  - **`known`** — the figure already held exactly this. Nothing changed. The student is right and
 *    should be told so, and the line must NOT be recorded: a row that contributed nothing is noise
 *    in the fact list, which is also the save file and the counter's source.
 *  - **`narrowed`** — «a הוא פרמטר» then «a<13». Absorbed into the existing declaration, but it DID
 *    add information, so it is a real given and belongs in the list. Calling this "already known"
 *    would be a lie about the student's own statement.
 *
 * Told apart explicitly rather than by comparing `next` with `c` for reference identity, which
 * happens to work today and would break the first time a no-op branch rebuilt its object.
 */
export type LineEffect = 'created' | 'known' | 'narrowed';

/**
 * SOMETHING THE STUDENT SHOULD BE TOLD ABOUT A STATEMENT THAT LANDED (#1350, ADR-AG-183) — never a
 * refusal: the statement is accepted and this rides along with it.
 *
 * `name-reads-as`: the line just named («הישר 3») reads, to a student, as the name of a DIFFERENT line
 * the figure already holds («l3»). Both are kept — the exam prints both conventions (operator ruling
 * 2026-09-22) — and the student is told they are two lines. `detail` is the new line's name as written,
 * `holder` the existing line's; both are the student's own tokens, never an id.
 */
export interface ApplyNotice {
  code: 'name-reads-as';
  detail: string;
  holder: string;
}

export type ApplyOutcome =
  | { ok: true; next: Construction; effect: LineEffect; notice?: ApplyNotice }
  | { ok: false; error: ApplyError };

/**
 * THE NAME THE STUDENT WROTE, from the id the parser minted (#1145, #1150).
 *
 * Curves get a prefixed id — «מעגל I» becomes `circle-I`, «הישר l7» becomes `line-l7` — so that a
 * circle and a point may both be called `I` without colliding. That prefix is internal, and it was
 * reaching the student: refusing «O מרכז המעגל Z» reported the detail **`circle-Z`**, a word they
 * never typed, and #1150's new curve check would have reported `line-l7` the same way.
 *
 * CLAUDE.md, *Honesty invariants*: **error messages name the conflicting statement, never internal
 * state.** A student told their sentence mentions `circle-Z` will look for `circle-Z` in it.
 *
 * Applied at EVERY `unknown-reference` site rather than at the two that were reported: it is the
 * identity function on an id that carries no prefix — a point is just `A` — so a uniform call cannot
 * be wrong, and the next site to be given a curve id inherits the fix.
 *
 * An ANONYMOUS curve (`curve-<hash>`) is deliberately left alone: there is no student name to
 * recover, and printing the hash's tail would be a different wrong word rather than the right one.
 */
// `statedName` — see `names.ts`, the one table (re-exported above).

/**
 * The object kinds that HAVE a shape — what an `on-curve` or a curve direction may name (#1150).
 *
 * A stated equation, a circle given by its centre, a line built through a point: each resolves to a
 * curve at evaluation, and each is a legitimate carrier. A POINT is not, and neither is a polygon —
 * naming one where a curve belongs is the same mistake as naming a curve that does not exist.
 */
const CURVE_BEARING: ReadonlySet<string> = new Set(['curve', 'circle-at', 'line-at', 'circle-thru']);

/** The probe environment for restatement comparison — see `sameNumbers`. */
const PROBE_ENVS: Env[] = [
  { a: 1.7, b: 2.3, k: 1.3, m: 0.7, n: 2.1, p: 1.9, r: 1.1, t: 2.7 },
  { a: 3.1, b: 1.1, k: 2.9, m: 1.3, n: 0.9, p: 3.3, r: 2.3, t: 1.3 },
];

/**
 * WHAT KIND OF CURVE an object is — one answer for every contextual reference (#1057, #1324).
 *
 * The kind of an ANONYMOUS conic is not declared — it comes from the FIT (02c R6: the noun is optional
 * "because the fit already knows the kind"). So «x²/9 + y²/4 = 1» carries no `curve.kind` at all, and
 * matching on the declaration alone would find no ellipse in a figure that plainly has one. Resolved
 * against a PROBE environment, the same device `sameNumbers` uses: a conic's KIND does not turn on the
 * value of its parameters in any form the corpus writes. A circle stated by its centre or computed from
 * points IS a circle, however it was stated.
 *
 * Lifted out of `on-kind` when «BD קוטר במעגל» needed the same question (#1324): a second copy that read
 * the declaration only missed «(x-3)^2+(y-4)^2=9» — measured — and treated the figure as circle-less.
 */
function curveKindOf(o: GeoObject): string | null {
  if (o.kind === 'circle-at' || o.kind === 'circle-thru') return 'circle';
  // A line CONSTRUCTED through a point is a line, however it was stated (#1501; the `on-curve`
  // M1 arm carried this as a local special case before it lived here).
  if (o.kind === 'line-at') return 'line';
  if (o.kind !== 'curve') return null;
  if (o.curve.kind) return o.curve.kind;
  const probe = resolveCurve(o.curve, PROBE_ENVS[0]);
  return probe.ok ? probe.curve.kind : null;
}

/**
 * WHICH EXISTING CURVE this equation denotes, if any (#1429 — the ADR-AG-023/#1342 identity
 * class at the operand boundary). Resolved numerically at the probe environments, like every
 * identity question here: two spellings of one equation are one curve, and a parameterised
 * equation matches only a curve that agrees at EVERY probe. Only equation-stated objects can
 * match — a `circle-at`'s equation is wherever the solve put it, which is not an identity.
 */
function resolveCurveByEq(c: Construction, eq: unknown): Id | null {
  if (!eq) return null;
  const close = (v: number, w: number) => Math.abs(v - w) <= 1e-9 * Math.max(1, Math.abs(v), Math.abs(w));
  const same = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
    a.kind === b.kind &&
    Object.entries(a).every(([key, v]) => typeof v !== 'number' || (typeof b[key] === 'number' && close(v, b[key] as number)));
  for (const o of c.objects) {
    if (o.kind !== 'curve') continue;
    const match = PROBE_ENVS.every((env) => {
      const mine = resolveCurve({ eq } as typeof o.curve, env);
      const theirs = resolveCurve(o.curve, env);
      return mine.ok && theirs.ok && same(mine.curve as unknown as Record<string, unknown>, theirs.curve as unknown as Record<string, unknown>);
    });
    if (match) return o.id;
  }
  return null;
}

/**
 * Do two expressions denote the same value? Compared NUMERICALLY at several parameter probes
 * rather than structurally, because `2a` and `a+a` are the same given written two ways and a
 * student who restates a fact in different words has not contradicted anything. Two probes make an
 * accidental agreement vanishingly unlikely without pretending to be a symbolic comparison.
 */
function sameNumbers(a: unknown, b: unknown): boolean {
  const ea = a as Parameters<typeof evalExpr>[0];
  const eb = b as Parameters<typeof evalExpr>[0];
  return PROBE_ENVS.every((env) => {
    const va = evalExpr(ea, env);
    const vb = evalExpr(eb, env);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return false;
    return Math.abs(va - vb) <= 1e-9 * Math.max(1, Math.abs(va), Math.abs(vb));
  });
}

/**
 * THE ID GATE — one rule for every object kind, enumerating none of them.
 *
 * For every fact that names an object, `f.t` **is** the kind that fact would create: the `Fact`
 * discriminants minus `param` are exactly the {@link GeoObject} kinds. So "does this name already
 * belong to something else?" is one comparison, and it cannot go stale when a kind is added.
 *
 * It is written this way because the previous version did go stale. Each case asked only about the
 * kinds it happened to know — the point case checked for a curve and nothing else — so when #1028
 * added `derived`, `segment` and `polygon`, a `derived` object was invisible to it. Stating
 * «M מפגש התיכונים במשולש ABC» and then «M(3,c)» produced **two objects called M**, both drawn, with
 * no refusal: the figure had two points with one name, and every later reference to `M` bound to
 * whichever came first. That is [ADR-043](../../docs/06-decisions.md#adr-043)'s hand-listed-kind-sets
 * defect, which `carriers.ts` was built to prevent and which slipped in here because a predicate is
 * not an exhaustive switch.
 */
function priorOf(
  c: Construction,
  f: Fact,
): { same: GeoObject } | { clash: true; prior: GeoObject } | null {
  if (!namesObject(f)) return null;
  const prior = objectById(c, f.id);
  if (!prior) return null;
  // The clash carries the object it collided with, so the refusal can say what the name holds
  // rather than only that the name is taken (#1046).
  return prior.kind === f.t ? { same: prior } : { clash: true, prior };
}

/**
 * Apply several facts as ONE statement (#1070).
 *
 * The resolved-reference kinds — «זווית B ישרה», «שטח הדלתון הוא 24», «משוואת האלכסון הראשי» —
 * all work the same way: M1 works out what the sentence names, and then the sentence means
 * exactly what the spelled-out form would have meant. Applying the spelled-out FACTS, rather than
 * duplicating what they do, is what guarantees the two phrasings cannot drift apart.
 *
 * The effect is the same rollup `derive` does per line, and for the same reason: a statement that
 * created anything counted, one that only narrowed narrowed, and one whose every part was already
 * known is the only case where dropping the row is honest.
 */
function applyAll(c: Construction, facts: readonly Fact[]): ApplyOutcome {
  let next = c;
  let effect: LineEffect = 'known';
  for (const f of facts) {
    const out = applyFact(next, f);
    if (!out.ok) return out;
    next = out.next;
    if (out.effect === 'created') effect = 'created';
    else if (out.effect === 'narrowed' && effect !== 'created') effect = 'narrowed';
  }
  return { ok: true, next, effect };
}

/**
 * Which CARRIERS is this point already constrained to lie on?
 *
 * Two constraint kinds put a point on a curve, and both must count (#1114). A line named by two points
 * lowers to `on-line-2pt`, not to `on-curve` — measured on the reported figure, where every crossing
 * carried `on-line-2pt(P, A, B)` beside `on-curve(P, circle-I)`. A first version of this check looked at
 * `on-curve` alone, saw one carrier per point instead of two, and never fired.
 *
 * The `line2pt:` key is synthetic and order-independent, so «the line AB» and «the line BA» are one
 * carrier rather than two.
 */
function carriersOfPoint(c: Construction, id: string): string[] {
  const out: string[] = [];
  for (const k of c.constraints) {
    if (k.t === 'on-curve' && (k as { id: string }).id === id) out.push((k as { curve: string }).curve);
    else if (k.t === 'on-line-2pt' && (k as { id: string }).id === id) {
      const pair = k as { a: string; b: string };
      out.push(`line2pt:${[pair.a, pair.b].sort().join(',')}`);
    }
  }
  return out;
}

/** A carrier's kind — `null` when it is not one this bound knows about. */
function carrierKind(c: Construction, carrier: string): string | null {
  if (carrier.startsWith('line2pt:')) return 'line';
  const o = c.objects.find((x) => x.id === carrier);
  if (!o || o.kind !== 'curve') return null;
  const cu = (o as { curve?: { kind?: string } }).curve;
  return cu?.kind ?? null;
}

/**
 * How many points two curves of these kinds can share — Bézout, capped at what this product draws.
 *
 * `null` means "no useful bound", and then nothing is refused: a bound that is not certain must never
 * turn into a refusal, because refusing a satisfiable figure is the worse defect of the two.
 */
function maxCrossings(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const isConic = (k: string) => k === 'circle' || k === 'ellipse' || k === 'parabola';
  if (a === 'line' && b === 'line') return 1;
  if ((a === 'line' && isConic(b)) || (isConic(a) && b === 'line')) return 2;
  if (isConic(a) && isConic(b)) return 4;
  return null;
}

/**
 * Apply one fact — `applyStatement`'s verdict, plus what the student should be TOLD about a statement
 * that landed (#1350). The notice is decided here, once, for every fact that names a line, because a
 * named line is minted by several arms (a stated equation, a line through a point) and each one's
 * answer is the same question.
 */
export function applyFact(c: Construction, f: Fact): ApplyOutcome {
  const out = applyStatement(c, f);
  if (!out.ok || out.effect === 'known') return out;
  const notice = readingTwin(c, f);
  return notice ? { ...out, notice } : out;
}

function applyStatement(c: Construction, f: Fact): ApplyOutcome {
  // NAMING a numeral curve in the other notation («נתון ישר I …» after «ישר 1») — the mint half of
  // ruling 2; the reference half is `unknownRef`. Only a NEW id can mix: restating «ישר 1» is its own id.
  if ((f.t === 'curve' || f.t === 'circle-thru' || f.t === 'line-at') && !objectById(c, f.id)) {
    const mix = notationMix(c, f.id);
    if (mix) return { ok: false, error: mix };
  }
  switch (f.t) {
    case 'param': {
      const prior = c.params.find((p) => p.sym === f.sym);
      if (prior) {
        // A re-declaration NARROWS: «a הוא פרמטר» then «נתון כי a<13» is the corpus's own
        // two-step, not a contradiction. Intersect the domains.
        const merged = {
          sym: f.sym,
          domain: {
            ...prior.domain,
            ...f.domain,
            min: pickTighter(prior.domain.min, f.domain.min, Math.max),
            max: pickTighter(prior.domain.max, f.domain.max, Math.min),
            minOpen: prior.domain.minOpen || f.domain.minOpen,
            maxOpen: prior.domain.maxOpen || f.domain.maxOpen,
            exclude: [...(prior.domain.exclude ?? []), ...(f.domain.exclude ?? [])],
          },
        };
        /**
         * The one absorption that can still ADD something (#1045).
         *
         * «a הוא פרמטר» then «a<13» is absorbed into the existing declaration and the domain is
         * strictly tighter afterwards — that is a real given, it belongs in the fact list, and
         * telling the student "already known" would be false. «a הוא פרמטר חיובי» twice is not.
         * The two are told apart by asking whether the merge changed the domain at all.
         */
        const changed = JSON.stringify(normalizeDomain(merged.domain)) !== JSON.stringify(normalizeDomain(prior.domain));
        return {
          ok: true,
          effect: changed ? 'narrowed' : 'known',
          next: { ...c, params: c.params.map((p) => (p.sym === f.sym ? merged : p)) },
        };
      }
      return { ok: true, effect: 'created', next: { ...c, params: [...c.params, { sym: f.sym, domain: f.domain }] } };
    }

    case 'point': {
      /**
       * ANCHORING a free vertex — M1 lowering, and what makes ENTRY ORDER not matter
       * ([02c R19](../../docs/02c-requirements-analytic.md), the 2-D tool's M2).
       *
       * «משולש ABC» then «A(6,4)» is not a student re-creating `A`; it is them *placing* the `A`
       * they already named. So the coordinates CONSUME the vertex's two degrees of freedom, exactly
       * as if they had been given first — the figure ends the same whichever order the sentences
       * arrive in, which is how every exam paragraph is actually written.
       *
       * It is an exact substitution, not a solve: two coordinates consume two DOF and nothing is
       * left to search for. The object is replaced IN PLACE so it keeps its position in the list,
       * which is what keeps `depsPrecedeDependents` true for anything already referring to it.
       */
      const standing = objectById(c, f.id);
      if (standing && standing.kind === 'free') {
        return {
          ok: true,
          effect: 'created',
          next: {
            ...c,
            objects: c.objects.map((o) =>
              o.id === f.id ? { kind: 'point', id: f.id, x: f.x, y: f.y } : o,
            ),
          },
        };
      }

      /**
       * A COORDINATE STATEMENT about a point that already exists (#1046, #1040).
       *
       * Operator, 2026-09-15: *"how would i be able to say that the x value of M is 3 if it refuses
       * to draw M again. it should know I am referring to the existing M"*.
       *
       * #1038 was right that a second `M` must not be created, and wrong about what the sentence
       * MEANS. The student did not name a different object; they made a statement about this one,
       * which is exactly what M1 is for — a command that would create an object whose id already
       * exists lowers to CONSTRAINTS on the existing object (docs/17 §M1). This function’s own
       * docblock reserved the slot: *"richer lowerings … attach to this same function when the
       * constraint layer lands, and nowhere else."* It has landed.
       *
       * ONE disposition, not two. The issue proposed splitting on determinacy — a CLAIM to verify
       * when the point is determined, a CONSTRAINT to solve when it is not — and the constraint kind
       * covers both: on a determined figure the solve has nothing left to move, the residual stays
       * non-zero, and #1062 reports it as unsatisfiable, naming the statement. That is the verify
       * half for free, with no second mechanism to keep in step with the first.
       *
       * A `free` vertex is NOT this case — it is handled above, by substitution, because two
       * coordinates consume its two degrees of freedom exactly and nothing is left to search for.
       */
      const standingDerived = objectById(c, f.id);
      if (standingDerived && standingDerived.kind === 'derived') {
        return applyFact(c, { t: 'constraint', k: { t: 'coord', id: f.id, x: f.x, y: f.y }, src: f.src });
      }

      const found = priorOf(c, f);
      if (found && 'clash' in found) {
        return {
          ok: false,
          error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(found.prior) },
        };
      }
      const prior = found?.same as PointObject | undefined;
      if (prior) {
        // M1: a statement about an EXISTING point.
        if (sameNumbers(prior.x, f.x) && sameNumbers(prior.y, f.y)) {
          return { ok: true, effect: 'known', next: c }; // agrees — absorbed, no duplicate row
        }
        return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      return {
        ok: true,
        effect: 'created',
        next: { ...c, objects: [...c.objects, { kind: 'point', id: f.id, x: f.x, y: f.y }] },
      };
    }

    case 'curve': {
      const found = priorOf(c, f);
      if (found && 'clash' in found) {
        return {
          ok: false,
          error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(found.prior) },
        };
      }
      const prior = found?.same as CurveObject | undefined;
      if (prior) {
        /**
         * A kind CLAIMED twice, differently, is a contradiction. A kind not claimed at all is not
         * (#1037): «הישר x-y+2=0» and the bare «x-y+2=0» are the same line stated two ways, and the
         * second one names no family because [02c R6](../../docs/02c-requirements-analytic.md) says
         * it need not. Comparing `undefined` against `'line'` would turn the absence of a claim into
         * a conflicting claim, and the student would be told their own restatement contradicts them.
         *
         * When it IS a contradiction, it names what the id already holds (#1046).
         */
        if (prior.curve.kind && f.curve.kind && prior.curve.kind !== f.curve.kind) {
          return {
            ok: false,
            error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) },
          };
        }
        if (sameCurve(prior.curve, f.curve)) {
          /**
           * PROMOTION (#1076) — the same curve, now stated.
           *
           * «נקודה B על הישר y=x» minted `y=x` as a carrier; «y=x» on its own line is the student
           * asking for the line itself. Because ids are content-derived (ADR-AG-023) these are ONE
           * object, so the second sentence is not a new curve — it is a change of what the first one
           * IS, and the figure visibly gains a line. Answering «כבר ידוע» here would be the #1045
           * mechanism firing on a line that really did something.
           *
           * The promotion is one-way. A stated curve is never demoted by a later carrier mention,
           * because the student already asked to see it and nothing they said withdraws that.
           */
          if (f.stated && !prior.stated) {
            /**
             * THE PROMOTION CARRIES THE LABEL (#1149).
             *
             * `{ ...prior, stated: true }` kept the CARRIER's label and threw away the stated
             * sentence's, so a promoted line lost the `kind` and `eqSrc` the student had just
             * written — and `words()` can name an anonymous curve only by its equation. The result
             * was two identical figures behaving differently: lines stated outright offered their
             * crossing ring, and the same lines reached as carriers first offered none.
             *
             * A promoted carrier must be indistinguishable from a curve stated outright, so the
             * incoming label wins — except for a NAME the prior already holds, which is the
             * student's own and cannot be erased by an anonymous restatement.
             */
            const label = { ...prior.label, ...f.label, name: prior.label.name || f.label.name };
            return {
              ok: true,
              effect: 'created',
              next: {
                ...c,
                objects: c.objects.map((o) => (o.id === f.id ? { ...prior, label, stated: true } : o)),
              },
            };
          }
          return { ok: true, effect: 'known', next: c };
        }
        /**
         * Same id, different equation, and now that ids are content-derived (#1026) that can only
         * mean one thing: a NAMED curve being restated inconsistently — «הישר AC» given twice with
         * two equations. A second anonymous parabola no longer reaches here at all, because it no
         * longer shares an id with the first.
         */
        return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      /**
       * ONE LINE, ONE ROW (#1342) — the CURVE arm of #1153's «one position, one name».
       *
       * `priorOf` compares **ids only**, and an anonymous curve's id is content-derived from its
       * equation TEXT (ADR-AG-023) while a named one's is its name. So one equation stated under two
       * identities was two objects: «נתון הישר 1: 2x-y+8=0» then «נתון הישר 2x-y+8=0» drew two stacked
       * lines, put two rows in the panel, and offered the same line twice in a crossing ring — with no
       * fault. The same for two names, and for the same line written in slope form.
       *
       * `sameCurve` — the equation-identity predicate, probe-environment based — already lived in this
       * file, but was only ever consulted AFTER an id match, to tell a contradiction from a repeat.
       * Nothing asked *"does the figure already hold THIS LINE under another id?"* That question is
       * asked here, once, for every curve, so no rule needs a case of its own.
       *
       * What happens next is decided by what the second statement ADDS — never by which spelling it
       * used:
       *
       *  - **nothing new** ⇒ `known`, absorbed; the submit gate answers «כבר ידוע»;
       *  - **a NAME for an anonymous line** ⇒ `narrowed`: the existing object gains `label.name`.
       *    Its id is deliberately NOT rewritten — constraints already hold it — and `curveByName`
       *    matches `label.name` as well as the id, so every by-name reference resolves;
       *  - **a SECOND name for a named line** ⇒ refused `already-named`, naming the holder. A line has
       *    one name, which is #1153's rule and not a new one.
       *
       * `line-at` (a free line through a point) is deliberately out of scope: it is not an equation,
       * so there is nothing for `sameCurve` to compare.
       */
      /**
       * ONLY A STATED DECLARATION JOINS THE SCAN, and that is a measured boundary, not caution.
       *
       * A CARRIER is not an object the student asked to see — «נקודה P על הישר y=x» mints `y=x` with
       * `stated: false` purely so the membership has something to hold, and **the very next fact of that
       * same line references it by id**. Absorbing it into an existing `l2: y=x` therefore deleted the id
       * P's membership was about, and P stopped existing (measured: #1048's honesty-gate row went red).
       * A carrier is also invisible — not drawn, no panel row, no crossing ring — so it is none of the
       * three things this issue is about. The incoming side is what is tested, because that is the fact
       * whose id may still be referenced; a stated line absorbed INTO a carrier is the #1076 promotion
       * and is safe, since references to a stated line go by name.
       */
      const twin = f.stated
        ? c.objects.find(
            (o): o is CurveObject => o.kind === 'curve' && o.id !== f.id && identicalCurve(o.curve, f.curve),
          )
        : undefined;
      if (twin) {
        const incoming = f.label.name;
        const held = twin.label.name;
        if (incoming && held && incoming !== held) {
          return { ok: false, error: { code: 'already-named', detail: f.src, holder: held } };
        }
        /**
         * The #1149 promotion rule, reached by the other door: a line first minted as a CARRIER and
         * now stated outright (or now named) visibly gains something, so it is not «כבר ידוע». The
         * incoming label wins except for a name the prior already holds — the student's own.
         */
        if ((incoming && !held) || (f.stated && !twin.stated)) {
          const label = { ...twin.label, ...f.label, name: held || incoming };
          return {
            ok: true,
            effect: incoming && !held ? 'narrowed' : 'created',
            next: {
              ...c,
              objects: c.objects.map((o) =>
                o.id === twin.id ? { ...twin, label, stated: twin.stated || f.stated } : o,
              ),
            },
          };
        }
        return { ok: true, effect: 'known', next: c };
      }

      /**
       * THE BARE FORM TAKES THE EXTENT THE OBJECT ALREADY HAS (#1234).
       *
       * «משוואת CE היא x-3y=0» writes no noun, so it says nothing about whether the student means the
       * infinite line or the median they already drew. Measured on the operator's own sequence, it
       * minted `line-CE` BESIDE the existing `seg-CE` — one name, two drawn objects, with
       * `faults: []` — and the spurious crossing rings followed from the twin.
       *
       * The decision belongs HERE and nowhere else: `parseLine(raw)` takes no figure context, so the
       * rule that recognises the sentence structurally cannot know whether `seg-CE` exists. This case
       * already looks the figure up through `priorOf`; asking one more question of it costs nothing.
       *
       * An existing segment over the same two points ⇒ the equation is a CONDITION on that segment,
       * and the line it lies on is an undrawn carrier. Nothing existing ⇒ the line is what the
       * student gets, which is the behaviour this form always had.
       */
      const inheritedStated =
        f.inheritExtent && segmentOverSameEnds(c, f.id) ? false : f.stated;
      return {
        ok: true,
        effect: 'created',
        next: {
          ...c,
          objects: [...c.objects, { kind: 'curve', id: f.id, label: f.label, curve: f.curve, stated: inheritedStated }],
        },
      };
    }

    /**
     * The three REFERENCE kinds (#1028). They share one shape: every id they name must already be a
     * positional object, and the statement is idempotent under M1 when it says the same thing again.
     */
    /**
     * A CONSTRAINT names points and creates none. Like a reference it may not invent one — «שטח
     * המשולש ABC הוא 20» before ABC exists is a statement about nothing.
     */
    case 'constraint': {
      /**
       * AN EQUATION OPERAND RESOLVES TO THE CURVE IT DENOTES (#1429, the ADR-AG-023/#1342
       * identity class). «…עם המעגל (x-3)²+(y-4)²=9» while circle I carries that equation is a
       * reference to CIRCLE I, not a second circle — so an `on-curve` carrying its equation is
       * matched against the figure's equation curves first, minted `stated: false` only when
       * nothing matches, and the spelling fields are stripped so the applied constraint is the
       * same statement however the curve was named. This is also what retires the
       * `curve-anon…` `unknown-reference` leak (#1145's class): the id now always exists.
       */
      if (f.k.t === 'on-curve' && f.k.eqSrc !== undefined) {
        const { eqSrc, eq, ...bare } = f.k;
        const resolved = resolveCurveByEq(c, eq) ?? f.k.curve;
        let host = c;
        if (resolved === f.k.curve && !objectById(c, resolved) && eq) {
          const mint = applyFact(c, {
            t: 'curve',
            id: resolved,
            label: { name: '', eqSrc },
            curve: { eq: eq as Parameters<typeof resolveCurve>[0]['eq'] },
            stated: false,
            src: f.src,
          });
          if (!mint.ok) return mint;
          host = mint.next;
        }
        return applyFact(host, { t: 'constraint', k: { ...bare, curve: resolved }, src: f.src });
      }
      const missing = constraintRefs(f.k).find((id) => {
        const o = objectById(c, id);
        return !o || !isPositional(o);
      });
      if (missing !== undefined) {
        return { ok: false, error: unknownRef(c, missing) };
      }
      /**
       * …AND THE CURVES IT NAMES (#1150). Same rule, the half that was missing.
       *
       * «נקודה D היא חיתוך של l7 ו- l8» on a figure with no `l7` lowered to two `on-curve`
       * constraints, passed this boundary in silence because `constraintRefs` answers only about
       * POINTS, and could not be measured at evaluation — so `D` was drawn as an ordinary free point
       * at a sampled position while the data panel one column over read `D = –`. The canvas asserted
       * a position the panel admitted was undetermined, and the student's defining clause had
       * vanished without a word.
       *
       * The tool already knew how to say this: an ASK naming an object the figure does not have
       * answers «אין בשרטוט …» (#1111). This is the FACT lane finally getting the same check.
       *
       * The detail is the student's own name for the curve — `l7`, never an internal id.
       */
      const missingCurve = constraintCurveRefs(f.k).find((id) => {
        const o = objectById(c, id);
        return !o || !CURVE_BEARING.has(o.kind);
      });
      if (missingCurve !== undefined) {
        return { ok: false, error: unknownRef(c, missingCurve) };
      }
      /**
       * A tangent-LINE must name a LINE (#1501). The residual answers "cannot be judged" for a
       * curve of another kind, and an unjudged constraint is a given that vanished in silence —
       * the same honesty hole #1150 closed for a curve that does not exist. «משיק ל-x^2+y^2=9»
       * is a circle-to-circle tangency, which is its own capability, refused BY NAME until it is
       * built.
       */
      if (f.k.t === 'tangent-line' && f.k.line.kind === 'curve') {
        const o = objectById(c, f.k.line.id);
        if (o && curveKindOf(o) !== 'line') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      }
      /**
       * A STATEMENT MEETS THE TOOL'S OWN ASSUMPTION (#1159) — decided before the duplicate absorb,
       * because to the absorb the two look identical, and that is the whole defect.
       *
       * «טרפז ABCD» lowers to an ASSUMED parallel pair. Two things can then happen, and neither is a
       * restatement:
       *
       *  - the student names THAT pair — «AB מקביל ל-CD». The constraint stops being the tool's guess
       *    and becomes their given. Nothing about the figure changes and the freedom does not drop,
       *    which is precisely why the entailment gate called it «already follows» — a sentence that
       *    is false, because it followed from a pair the TOOL picked. It is `narrowed`: the figure is
       *    unchanged and its commitment is not.
       *  - the student names the OTHER pair — «BC מקביל ל-AD». The assumption yields to them. Keeping
       *    both drew a PARALLELOGRAM at every seed, silently, on a figure the student called a
       *    trapezoid.
       *
       * Both pairs STATED is a parallelogram the student asked for, and is left alone: the second
       * statement finds no assumption to displace (the first already pinned it) and records normally.
       */
      if (f.k.t === 'relation' && !f.k.assumed) {
        const pins = c.constraints.findIndex((k) => k.t === 'relation' && k.assumed && sameConstraint(k, f.k));
        if (pins >= 0) {
          const pinned = [...c.constraints];
          pinned[pins] = f.k; // the student's own constraint, with no `assumed` mark
          return { ok: true, effect: 'narrowed', next: { ...c, constraints: pinned } };
        }
        const yields = displacedAssumption(c, f.k);
        if (yields >= 0) {
          const moved = c.constraints.filter((_, i) => i !== yields);
          return { ok: true, effect: 'created', next: { ...c, constraints: [...moved, f.k] } };
        }
      }

      // Restating the same constraint adds nothing — M1's absorb, so a later section of a question
      // may repeat a given without it counting twice against the figure's freedom. Compared by what
      // the constraint SAYS (#1159): «AB ∥ CD» and «AB ∥ DC» are one statement, and used to get two
      // different answers depending on which letter the student wrote first.
      const dup = c.constraints.some((k) => sameConstraint(k, f.k));
      if (dup) return { ok: true, effect: 'known', next: c };

      /**
       * A PAIR OF CURVES HAS ONLY SO MANY CROSSINGS (#1114).
       *
       * «נקודת החיתוך» lowers to two `on-curve` constraints, so naming a third crossing of one
       * line×conic pair is representable — and it used to build. Measured on the reported figure, the
       * damage is worse than a stacked point: naming `R` did not merely put it on top of `P`, it
       * dragged `Q` there too, collapsing three distinct names onto one location.
       *
       *   P(0.92, 1.84)  Q(3.48, 6.96)          ← two crossings, correct
       *   P(0.92, 1.84)  Q(0.92, 1.84)  R(0.92, 1.84)   ← after naming a third
       *
       * **This is a COUNTING argument, not a sampling one**, which is why it is refused here rather
       * than left to the freedom gate in `derive`. A straight meets a conic in at most two points at
       * ANY configuration, with any amount of freedom, so a third such sentence cannot hold under any
       * seed — the "vacuously never" reasoning ADR-AG-008 / #1058 used. No seed search is involved and
       * no satisfiable figure can be wrongly refused, so #1071's general question stays open and
       * `derive`'s `reportedDof === 0` gate is deliberately untouched.
       *
       * The cap comes from the curve KINDS alone, never from their parameters — which is what lets
       * this live at apply time, before anything is evaluated.
       */
      if (f.k.t === 'on-curve' || f.k.t === 'on-line-2pt') {
        const subject = (f.k as { id: string }).id;
        const arriving = f.k.t === 'on-curve'
          ? (f.k as { curve: string }).curve
          : `line2pt:${[(f.k as { a: string }).a, (f.k as { b: string }).b].sort().join(',')}`;
        for (const other of carriersOfPoint(c, subject)) {
          if (other === arriving) continue;
          const cap = maxCrossings(carrierKind(c, other), carrierKind(c, arriving));
          if (cap === null) continue;
          const named = c.objects.filter((o) => {
            if (o.id === subject) return false;
            const on = carriersOfPoint(c, o.id);
            return on.includes(other) && on.includes(arriving);
          }).length;
          if (named >= cap) {
            return { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
          }
        }
      }
      /**
       * The student CONSUMING a discrete degree of freedom (#1049).
       *
       * «משולש ישר-זווית ABC» carries a choice over three seats; «זווית B ישרה» names one of them.
       * Adding it as an ordinary constraint would leave the choice in place, and two seeds out of
       * three would then draw a figure whose right angle sits somewhere else while the student's own
       * sentence says otherwise. So the choice is REPLACED by the option they named — exactly what a
       * coordinate does to a continuous degree of freedom.
       *
       * It reports `narrowed`, not `created`: the constraint count is unchanged and what moved is the
       * freedom, which is the same answer «a<13» gives after «a הוא פרמטר».
       */
      const seat = c.constraints.findIndex(
        (k) => k.t === 'choice' && k.options.some((o) => namesOption(o, f.k)),
      );
      if (seat >= 0) {
        const collapsed = [...c.constraints];
        collapsed[seat] = f.k;
        return { ok: true, effect: 'narrowed', next: { ...c, constraints: collapsed } };
      }
      return { ok: true, effect: 'created', next: { ...c, constraints: [...c.constraints, f.k] } };
    }

    /**
     * «זווית B ישרה» — the vertex alone, resolved against the figure (#1049).
     *
     * `B` names an angle only when the figure says which two rays meet there, so this is the one
     * fact whose constraint is built HERE rather than in the parser. The rays come from the shape
     * that has `B` as a vertex; where there is no such shape, or more than one, the honest answer is
     * to refuse and name the format the student can use instead — never to pick a pair of rays.
     */
    /**
     * «שטח הדלתון הוא 24» — the noun resolved against what the student has drawn (#1049).
     *
     * Exactly the `right-angle` shape: a contextual reference is unambiguous when the figure holds
     * ONE shape of that noun, and a guess otherwise. Refusing the ambiguous case is what makes the
     * unambiguous one safe.
     */
    /**
     * «אלכסוני המרובע נפגשים בנקודה O» — the shape resolved from the figure (#1070).
     *
     * The same contextual resolution as `area-of`, keyed on ARITY rather than on a noun, because
     * the sentence names the construct («האלכסונים») and not the shape. One quadrilateral in the
     * figure makes it unambiguous; none or several makes it a refusal, never a pick.
     */
    case 'meet-of': {
      const rings = c.objects.filter(
        (o) => o.kind === 'polygon' && o.vertices.length === f.arity,
      ) as PolygonObject[];
      if (rings.length !== 1) return { ok: false, error: { code: 'ambiguous-shape', detail: f.src } };
      const v = rings[0].vertices;
      const rule: DerivedRule =
        f.role === 'diagonals'
          ? { t: 'diagonals', v: [v[0], v[1], v[2], v[3]] }
          : ({ t: f.role, v: [v[0], v[1], v[2]] } as DerivedRule);
      return applyFact(c, { t: 'derived', id: f.id, rule, src: f.src });
    }

    /**
     * «משוואת האלכסון הראשי היא y=2x» — the diagonal the NOUN distinguishes (#1070).
     *
     * Only some quadrilaterals have a principal diagonal: a kite does, because its axis of
     * symmetry is a geometric fact about the figure. A plain «מרובע», a parallelogram and a rhombus
     * do not, and there the phrase has no referent — refused by name, because choosing one would
     * assert a distinction the question never made (ADR-052 in vocabulary form).
     *
     * Once resolved it is the ORDINARY line-by-name statement, applied as the facts the spelled-out
     * «משוואת האלכסון AC היא y=2x» would have produced, so ADR-AG-026`s incidences come with it.
     */
    case 'diagonal-eq': {
      const rings = c.objects.filter(
        (o) => o.kind === 'polygon' && !!o.noun && !!shapeRow(o.noun)?.principalDiagonal,
      ) as PolygonObject[];
      if (rings.length !== 1) {
        return { ok: false, error: { code: 'undistinguished-diagonal', detail: f.src } };
      }
      const ring = rings[0];
      const [p, q] = shapeRow(ring.noun!)!.principalDiagonal!(ring.vertices);
      // The SECONDARY diagonal is the other one: the two vertices the principal does not join.
      const [a, b] = f.principal ? [p, q] : ring.vertices.filter((x) => x !== p && x !== q);
      const id = lineIdOf(`${a}${b}`);
      return applyAll(c, [
        // STATED (#1076): the student asked for this diagonal by giving its equation, so it is part
        // of the figure they are drawing, not a carrier minted to hold something else.
        { t: 'curve', id, label: { name: `${a}${b}`, kind: 'line' }, curve: { kind: 'line', eq: f.eq }, stated: true, src: f.src },
        { t: 'declare', id: a, src: f.src },
        { t: 'declare', id: b, src: f.src },
        { t: 'constraint', k: { t: 'on-curve', id: a, curve: id }, src: f.src },
        { t: 'constraint', k: { t: 'on-curve', id: b, curve: id }, src: f.src },
      ]);
    }

    /**
     * A circle on a CENTRE POINT (#1060).
     *
     * The centre must already be a point — the `declare` that precedes this fact makes sure of
     * it — and the circle is an ordinary object from there on. Restating it is absorbed, like
     * every other construction, so «נתון מעגל O» twice is one circle.
     */
    case 'circle-at': {
      const centre = objectById(c, f.centre);
      if (!centre || !isPositional(centre)) {
        return { ok: false, error: unknownRef(c, f.centre) };
      }
      const prior = objectById(c, f.id);
      if (prior) {
        if (prior.kind !== 'circle-at') {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
        }
        return { ok: true, effect: 'known', next: c };
      }
      return {
        ok: true,
        effect: 'created',
        next: { ...c, objects: [...c.objects, { kind: 'circle-at', id: f.id, centre: f.centre, r: f.r }] },
      };
    }

    /**
     * «דרך P עובר ישר מקביל ל AB» — a line CONSTRUCTED through a point (#1093).
     *
     * Written as the exact parallel of `circle-at` above, because it is one: a positional anchor the
     * figure must already hold, a name-clash check, and an idempotent restatement. What it is NOT is
     * a statement about an existing line — the sentence creates the line, which is why this is an
     * object kind rather than a constraint.
     *
     * The direction's own referents are NOT resolved here. `dirRefs` feeds the dependency walk in
     * `carriers.ts`, and a direction naming something absent surfaces there as the vacancy it is —
     * the same division `circle-at` keeps between its centre (checked here, because the object
     * cannot exist without it) and its radius symbol (resolved at evaluate time).
     */
    case 'line-at': {
      const through = objectById(c, f.through);
      if (!through || !isPositional(through)) {
        return { ok: false, error: unknownRef(c, f.through) };
      }
      const prior = objectById(c, f.id);
      /**
       * «הישר l3 עובר דרך N» — an EXISTING line through a point is an incidence, not a second line (#1281, M1).
       *
       * A free-direction `line-at` states only "this line passes through that point". When the named line
       * already exists — stated by its equation, or built through another point — the sentence is a statement
       * ABOUT it and lowers to the point's incidence: the exam's «ישר 3 עובר דרך הנקודה N», which is what pins
       * the parameter of a line `(k+1)x+2y-12+5k=0`. It used to be refused as a name clash (an equation line)
       * or absorbed as `known` while N was never put on the line (a line-at through another point).
       */
      if (prior && f.dir.k === 'free') {
        const isLine = curveKindOf(prior) === 'line'; // a `line-at` answers 'line' here too (#1501)
        if (isLine) {
          if (prior.kind === 'line-at' && prior.through === f.through) return { ok: true, effect: 'known', next: c };
          return applyFact(c, { t: 'constraint', k: { t: 'on-curve', id: f.through, curve: prior.id }, src: f.src });
        }
      }
      if (prior) {
        if (prior.kind !== 'line-at') {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
        }
        return { ok: true, effect: 'known', next: c };
      }
      return {
        ok: true,
        effect: 'created',
        next: {
          ...c,
          objects: [
            ...c.objects,
            { kind: 'line-at', id: f.id, through: f.through, dir: f.dir, perp: f.perp, ...(f.name ? { name: f.name } : {}) },
          ],
        },
      };
    }

    /**
     * «מעגל ABD» · «נתון מעגל שקוטרו BD» — a circle COMPUTED from points (#1464, #1324, ADR-AG-160).
     *
     * The third constructive curve, with `circle-at`'s and `line-at`'s discipline: every point it is
     * defined from must already exist (never invented — #1028), a name already holding another kind is a
     * clash, and a restatement is absorbed. The points must be DIFFERENT: «מעגל AAB» names no circle, and
     * saying so here names the sentence rather than drawing a vacancy the student cannot explain.
     */
    case 'circle-thru': {
      const pts = circleDefPoints(f.def);
      for (const id of pts) {
        const p = objectById(c, id);
        if (!p || !isPositional(p)) return { ok: false, error: unknownRef(c, id) };
      }
      if (new Set(pts).size !== pts.length) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const prior = objectById(c, f.id);
      if (prior) {
        if (prior.kind !== 'circle-thru') {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
        }
        return { ok: true, effect: 'known', next: c };
      }
      return {
        ok: true,
        effect: 'created',
        next: { ...c, objects: [...c.objects, { kind: 'circle-thru', id: f.id, def: f.def, ...(f.name ? { name: f.name } : {}) }] },
      };
    }

    /**
     * «BD קוטר במעגל» — which circle, answered from the construction (#1324; 2-D's `circleOnDiameter` /
     * `diameter` precedence, ported as a decision).
     *
     * - A DEFINING phrase («שקוטרו», «במעגל חדש», "with diameter"), or no circle to attach to: the
     *   sentence CREATES the circle on the diameter — the bagrut opener.
     * - A circle named, or the one circle in the figure: the sentence is ABOUT it (M1). Lowered exactly:
     *   a circle on a centre point → both ends on it and the centre at their midpoint; a circle through
     *   three points two of which are the ends → the right angle at the third (Thales, both directions);
     *   the circle already on this diameter → known. A circle known only by its equation has no centre
     *   point to state the midpoint of, and is refused BY NAME (`out-of-scope`) — never dropped.
     * - Several circles and none named: refused as ambiguous, never a pick.
     */
    case 'diameter-of': {
      for (const id of [f.a, f.b]) {
        const p = objectById(c, id);
        if (!p || !isPositional(p)) return { ok: false, error: unknownRef(c, id) };
      }
      if (f.a === f.b) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      // By the fit, not the declaration (`curveKindOf`): «(x-3)^2+(y-4)^2=9» declares no kind and IS a circle.
      const isCircle = (o: GeoObject) => curveKindOf(o) === 'circle';
      let host: GeoObject | undefined;
      if (f.circle !== undefined) {
        host = objectById(c, numeralCurveId('circle', f.circle)) ?? objectById(c, `circle-at-${f.circle}`) ?? curveByName(c, f.circle);
        if (!host || !isCircle(host)) return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else if (!f.define) {
        const circles = c.objects.filter(isCircle);
        if (circles.length > 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
        host = circles[0];
      }
      if (!host) {
        const [a, b] = [f.a, f.b];
        return applyFact(c, { t: 'circle-thru', id: diameterCircleId(a, b), def: { t: 'diameter', a, b }, src: f.src });
      }
      const on = (id: Id): Fact => ({ t: 'constraint', k: { t: 'on-curve', id, curve: host!.id }, src: f.src });
      if (host.kind === 'circle-at') {
        return applyAll(c, [
          on(f.a),
          on(f.b),
          { t: 'constraint', k: { t: 'derived-at', id: host.centre, rule: { t: 'midpoint', a: f.a, b: f.b } }, src: f.src },
        ]);
      }
      if (host.kind === 'circle-thru') {
        if (host.def.t === 'diameter') {
          const same = [host.def.a, host.def.b].sort().join() === [f.a, f.b].sort().join();
          if (same) return { ok: true, effect: 'known', next: c };
        } else if (host.def.pts.includes(f.a) && host.def.pts.includes(f.b)) {
          const third = host.def.pts.find((p) => p !== f.a && p !== f.b)!;
          return applyFact(c, { t: 'constraint', k: rightAngleAt(third, f.a, f.b), src: f.src });
        }
      }
      return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
    }

    /**
     * «המעגל משיק לציר ה-x» — the circle resolved from the figure (#1060).
     *
     * The same contextual resolution as `area-of` and `meet-of`: one circle makes it unambiguous,
     * none or several makes it a refusal rather than a pick.
     */
    /**
     * «הנקודה A נמצאת על האליפסה» — the curve resolved by its KIND (#1057).
     *
     * The fourth contextual reference, and the same discipline as the other three: one curve of
     * that kind makes it unambiguous, none or several makes it a refusal. The corpus never puts
     * two conics of a kind in one figure, so refusing costs nothing a real question asks for.
     *
     * A `circle-at` counts as a circle: it IS one, however it was stated.
     */
    case 'on-kind': {
      const point = objectById(c, f.id);
      if (!point || !isPositional(point)) {
        return { ok: false, error: unknownRef(c, f.id) };
      }
      /**
       * The kind of an ANONYMOUS conic is not declared — it comes from the FIT (02c R6: the noun is
       * optional "because the fit already knows the kind"). So «x²/9 + y²/4 = 1» carries no
       * `curve.kind` at all, and matching on the declaration alone would find no ellipse in a figure
       * that plainly has one.
       *
       * Resolved against a PROBE environment, the same device `sameNumbers` uses here: a conic's KIND
       * does not turn on the value of its parameters in any form the corpus writes.
       */
      const matches = c.objects.filter((o) => curveKindOf(o) === f.kind);
      if (matches.length !== 1) return { ok: false, error: noHost(f.src, f.kind, matches) };
      return applyFact(c, { t: 'constraint', k: { t: 'on-curve', id: f.id, curve: matches[0].id }, src: f.src });
    }

    case 'crossing-kind': {
      // «E נקודת החיתוך של הישרים» (#1429): WHICH two is the figure's answer — exactly two of the
      // kind lower to the incidences the spelled-out sentence carries; anything else refuses. The
      // `on-kind` rule, one arity up, resolved by the same fit-level kind test.
      const point = objectById(c, f.id);
      if (!point || !isPositional(point)) return { ok: false, error: unknownRef(c, f.id) };
      const pair = c.objects.filter((o) => curveKindOf(o) === f.kind);
      if (pair.length !== 2) return { ok: false, error: noHost(f.src, f.kind, pair.length, 2) };
      return applyAll(
        c,
        pair.map((o) => ({ t: 'constraint' as const, k: { t: 'on-curve' as const, id: f.id, curve: o.id }, src: f.src })),
      );
    }

    case 'tangent-of': {
      let host: GeoObject | undefined;
      if (f.circle !== undefined) {
        // The line-first order names its circle — «הישר l1 משיק למעגל M» (#1501). The same lookup
        // chain as `diameter-of`: a numeral id, a centre-letter id, or the student's own name.
        host =
          objectById(c, numeralCurveId('circle', f.circle)) ??
          objectById(c, `circle-at-${f.circle}`) ??
          curveByName(c, f.circle);
        if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else {
        // By the fit, not the declaration: «המעגל» about an equation circle still finds ITS circle,
        // and the honest answer below is `out-of-scope`, not "which circle?" (#1501).
        const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
        if (circles.length !== 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
        host = circles[0];
      }
      /**
       * Tangency pins the RADIUS against the CENTRE, so it needs a circle that has both to pull
       * on. A circle known only by its equation, or computed from its points, has neither free —
       * the given cannot be honoured, and it is refused BY NAME (`out-of-scope`), never dropped
       * (the `diameter-of` rule, one case up).
       */
      if (host.kind !== 'circle-at') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      const circle = host;
      return applyAll(c, [
        ...f.axes.map((axis) => ({
          t: 'constraint' as const,
          k: { t: 'tangent-axis' as const, centre: circle.centre, r: circle.r, axis },
          src: f.src,
        })),
        ...(f.lines ?? []).map((line) => ({
          t: 'constraint' as const,
          k: { t: 'tangent-line' as const, centre: circle.centre, r: circle.r, line },
          src: f.src,
        })),
      ]);
    }

    case 'radius-of': {
      // The tangent-of name→circle chain, so the family cannot drift (#1432). A creation sentence
      // («נתון מעגל O שרדיוסו 5») names its own circle by id, so no name lookup can pick another.
      let host: GeoObject | undefined;
      if (f.circleId !== undefined) {
        host = objectById(c, f.circleId);
        if (!host) return { ok: false, error: unknownRef(c, f.circleId) };
      } else if (f.circle !== undefined) {
        host = objectById(c, numeralCurveId('circle', f.circle)) ?? objectById(c, `circle-at-${f.circle}`) ?? curveByName(c, f.circle);
        if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else {
        const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
        if (circles.length !== 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
        host = circles[0];
      }
      if (host.kind === 'circle-at') {
        const r = host.r as { kind?: string; name?: string };
        if (r && r.kind === 'sym' && r.name) {
          /**
           * The radius was FREE and the student just gave it — the sym is SUBSTITUTED with the
           * stated value and its parameter retired (when nothing else reads it), so the DOF cue
           * drops by exactly the freedom the sentence consumed. A substitution rather than a
           * solver row: the radius is not solved for, it is now a given, and replay reapplies
           * this deterministically (the fold is pure over the fact list).
           *
           * The value passes the symbol's DOMAIN first (am. 1): «רדיוס המעגל הוא -3» is refused
           * naming the statement, where it used to be substituted and the circle silently vanished.
           */
          const sym = r.name;
          const admitted = admitStated(c, c.params.find((p) => p.sym === sym)?.domain, f.value, f.src);
          if (!admitted.ok) return admitted;
          const base = admitted.next;
          /**
           * EVERYWHERE the symbol stands, not only on the circle (am. 1): a tangency stated with the
           * circle («נתון מעגל O משיק לציר ה-x») carries `r_O` in its own constraint, and replacing the
           * radius on the object alone left that constraint solving a different, still-free radius —
           * the circle drawn at r = 5 while the tangency held for some other r.
           */
          const objects = substituteSym(base.objects, sym, f.value);
          const constraints = substituteSym(base.constraints, sym, f.value);
          const restText = JSON.stringify({ objects, constraints });
          const params = restText.includes(`"${sym}"`) ? base.params : base.params.filter((p) => p.sym !== sym);
          return { ok: true, next: { ...base, objects, constraints, params }, effect: 'narrowed' };
        }
        // A radius already carried by the object: a RESTATEMENT, judged at the probes.
        return sameNumbers(host.r, f.value)
          ? { ok: true, next: c, effect: 'known' }
          : { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      if (host.kind === 'curve') {
        // An equation circle's radius is determined by its equation — the sentence is a claim.
        const agrees = PROBE_ENVS.every((env) => {
          const rc = resolveCurve(host!.kind === 'curve' ? host!.curve : { eq: undefined as never }, env);
          const v = evalExpr(f.value as Parameters<typeof evalExpr>[0], env);
          return rc.ok && rc.curve.kind === 'circle' && Number.isFinite(v) && Math.abs(rc.curve.r - v) <= 1e-9 * Math.max(1, rc.curve.r, Math.abs(v));
        });
        return agrees
          ? { ok: true, next: c, effect: 'known' }
          : { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      // A computed circle (circle-thru): its radius follows from solved points, which this
      // boundary cannot see — refused by name, never silently dropped.
      return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
    }

    case 'focus-of': {
      // THE parabola, exactly as «O מרכז המעגל» resolves the circle — the centre's pattern (#1432).
      // On a point that already exists («F(2,0)» first, or «מוקד הפרבולה הוא (2,0)», whose parser
      // mints the point) the derived fact lowers to the `derived-at` constraint (M1): a fixed parabola
      // judges it, a parameterised one is PINNED by it — «y²=2px» with focus (2,0) solves p = 4.
      const parabolas = c.objects.filter((o) => curveKindOf(o) === 'parabola');
      if (parabolas.length !== 1) return { ok: false, error: noHost(f.src, 'parabola', parabolas.length) };
      return applyFact(c, { t: 'derived', id: f.id, rule: { t: 'parabola-focus', curve: parabolas[0].id }, src: f.src });
    }

    case 'directrix-eq': {
      const parabolas = c.objects.filter((o) => curveKindOf(o) === 'parabola');
      if (parabolas.length !== 1) return { ok: false, error: noHost(f.src, 'parabola', parabolas.length) };
      const host = parabolas[0];
      if (host.kind !== 'curve') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      /**
       * The claim is judged LINE AGAINST LINE (am. 1): the parabola's own directrix
       * (`parabolaDirectrix`, the one derivation the ask and the panel print from) against the
       * stated line, as homogeneous triples — proportional means the same line, whatever its
       * orientation, so no branch here assumes the directrix is vertical. Computed per probe: a
       * directrix that MOVES across probes is parameter-dependent — pinning the parameter from the
       * directrix is not built, and the honest answer is a loud refusal, never a false «conflict».
       */
      const own: Array<[number, number, number]> = [];
      let agrees = true;
      for (const env of PROBE_ENVS) {
        const pc = resolveCurve(host.curve, env);
        const gl = resolveCurve({ eq: f.eq }, env);
        if (!pc.ok || pc.curve.kind !== 'parabola' || !gl.ok || gl.curve.kind !== 'line') {
          return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
        }
        const d = parabolaDirectrix(pc.curve);
        if (d.kind !== 'line') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
        own.push([d.a, d.b, d.c]);
        if (!sameLineTriple([d.a, d.b, d.c], [gl.curve.a, gl.curve.b, gl.curve.c])) agrees = false;
      }
      if (!sameLineTriple(own[0], own[1])) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      return agrees
        ? { ok: true, next: c, effect: 'known' }
        : { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
    }

    case 'perimeter-of': {
      /**
       * «היקף המשולש הוא 12» / «ההיקף הוא 12» — the ring resolved from the figure (am. 1), the
       * `area-of` discipline: one matching polygon lowers to the SIDE SUM «AB+BC+CA=12» would carry
       * (the same `length-eq` constraint, so the perimeter is a real given consuming a DOF, and the
       * ask «היקף ABC» — which delegates to that sum — reads it back); anything else refuses naming
       * the host. A generic noun («משולש») matches every ring of its arity; «מצולע» or no noun, any ring.
       */
      const rings = ringsNamed(c.objects, f.noun) as PolygonObject[];
      if (rings.length !== 1) return { ok: false, error: noHost(f.src, 'polygon', rings.length) };
      const v = rings[0].vertices;
      const left = parseLengthExpr(v.map((a, i) => `${a}${v[(i + 1) % v.length]}`).join('+'));
      if (!left) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      return applyFact(c, { t: 'constraint', k: { t: 'length-eq', left, right: { expr: f.value, terms: [] } }, src: f.src });
    }

    case 'tangent-circles': {
      // The same name→circle chain as `tangent-of`/`diameter-of`: a numeral id, a centre-letter
      // id, or the student's own name — one chain, so the family cannot drift (#1504).
      const byName = (name: string): GeoObject | undefined =>
        objectById(c, numeralCurveId('circle', name)) ?? objectById(c, `circle-at-${name}`) ?? curveByName(c, name);
      const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
      let a: GeoObject | undefined;
      let b: GeoObject | undefined;
      if (f.a !== undefined) {
        a = byName(f.a);
        if (!a || curveKindOf(a) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.a)) };
      }
      if (f.b !== undefined) {
        b = byName(f.b);
        if (!b || curveKindOf(b) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.b)) };
      }
      if (!a || !b) {
        // The contextual readings: «המעגל משיק למעגל K» means the one OTHER circle; «המעגלים
        // משיקים» means the exactly two. Anything else is a genuine "which circles?".
        const rest = circles.filter((o) => o !== a && o !== b);
        const need = (a ? 0 : 1) + (b ? 0 : 1);
        // The host rides the refusal (#1432 am. 1): one name missing its partner is the circle none/many
        // remedy; «המעגלים משיקים» over the wrong count is the unnamed-PAIR remedy.
        if (rest.length !== need) return { ok: false, error: noHost(f.src, 'circle', rest.length, need === 2 ? 2 : undefined) };
        if (!a) a = rest.shift();
        if (!b) b = rest.shift();
      }
      // A circle is not tangent to itself — one circle named twice (or the contextual reading
      // landing back on the named one) has no configuration.
      if (a === b) return { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
      /**
       * Tangency pins each RADIUS against each CENTRE, so BOTH circles need both to pull on —
       * the `tangent-of` rule, applied twice. An equation circle or a computed `circle-thru` is
       * refused by name (`out-of-scope`), never dropped.
       */
      if (a!.kind !== 'circle-at' || b!.kind !== 'circle-at') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      const mk = (branch: 'external' | 'internal') => ({
        t: 'tangent-circle' as const,
        centre: a!.centre,
        r: a!.r,
        other: b!.centre,
        otherR: b!.r,
        branch,
      });
      // A branch word collapses the choice (the «זווית B ישרה» pattern); without one, BOTH
      // touches are admissible and «הציגו תצורה אחרת» cycles them (ADR-052, #1049).
      const k = f.branch ? mk(f.branch) : { t: 'choice' as const, options: [mk('external'), mk('internal')] };
      // «…בנקודה T» names the touch point — determined by the two circles, so a derived point (amendment 1).
      const touch = f.at
        ? [{ t: 'derived' as const, id: f.at, rule: { t: 'touch-point' as const, a: a!.id, b: b!.id }, src: f.src }]
        : [];
      return applyAll(c, [{ t: 'constraint', k, src: f.src }, ...touch]);
    }

    case 'area-of': {
      const rings = c.objects.filter(
        (o) => o.kind === 'polygon' && o.noun === f.noun,
      ) as PolygonObject[];
      if (rings.length !== 1) {
        return { ok: false, error: { code: 'ambiguous-shape', detail: f.src } };
      }
      return applyFact(c, { t: 'constraint', k: { t: 'area', ids: rings[0].vertices, value: f.value }, src: f.src });
    }

    case 'right-angle': {
      const at = resolveAngleName(c, { v: f.id }, f.src);
      if (!at.ok) return at;
      return applyFact(c, { t: 'constraint', k: rightAngleAt(f.id, at.ref.a, at.ref.b), src: f.src });
    }

    /**
     * «זווית C = 60» · «∠B = ∠C» — the `right-angle` resolution with a value (#1407, ADR-AG-158).
     *
     * Each lone vertex goes through the one resolver above, and the line then lowers to exactly the
     * constraint its three-letter twin lowers to in the parser — so «זוית C=200» after «משולש ABC» is the
     * same `unsatisfiable` refusal «זווית ACB = 200» is, never a second meaning of the sentence.
     */
    case 'vertex-angle': {
      const left = resolveAngleName(c, f.left, f.src);
      if (!left.ok) return left;
      if (f.rhs.t === 'value') {
        return applyFact(c, { t: 'constraint', k: { t: 'angle', at: left.ref, value: f.rhs.value }, src: f.src });
      }
      const right = resolveAngleName(c, f.rhs.of, f.src);
      if (!right.ok) return right;
      return applyFact(c, {
        t: 'constraint',
        k: { t: 'angle-ratio', left: left.ref, right: right.ref, k: f.rhs.k },
        src: f.src,
      });
    }

    /** Introduce a named but unplaced point; harmless and absorbed if it already exists. */
    case 'declare': {
      const o = objectById(c, f.id);
      if (o) {
        if (isPositional(o)) return { ok: true, effect: 'known', next: c };
        return {
          ok: false,
          error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(o) },
        };
      }
      return { ok: true, effect: 'created', next: { ...c, objects: [...c.objects, { kind: 'free', id: f.id }] } };
    }

    /** A selector names a point and constrains nothing — it filters configurations after the solve. */
    case 'selector': {
      /**
       * Every point the selector names must exist — the subject, and for a `between` selector the two
       * endpoints it is measured against (#1073). A selector that silently judged nothing because one
       * of its points was missing would be a given that vanished.
       */
      const refs =
        f.sel.kind === 'axis-side' || f.sel.kind === 'crossing-distinct' || f.sel.kind === 'crossing-nth'
          ? [f.sel.id]
          : f.sel.kind === 'distinct'
            ? f.sel.ids
            : f.sel.kind === 'sign'
              ? dirRefs(f.sel.q.u)
              : f.sel.kind === 'coord-compare'
                ? // Both points of «x_B > x_D» must exist (#1462); a value names none.
                  [f.sel.id, ...('point' in f.sel.rhs ? [f.sel.rhs.point] : [])]
                : [f.sel.id, f.sel.a, f.sel.b];
      for (const id of refs) {
        const o = objectById(c, id);
        if (!o || !isPositional(o)) {
          return { ok: false, error: unknownRef(c, id) };
        }
      }
      // A sign about a NAMED line refers to a line the figure must have (#1323) — the #1150 rule for
      // the curve half of a reference, applied to the selector that names one.
      if (f.sel.kind === 'sign' && f.sel.q.u.k === 'curve') {
        const o = objectById(c, f.sel.q.u.id);
        if (!o || !CURVE_BEARING.has(o.kind)) return { ok: false, error: unknownRef(c, f.sel.q.u.id) };
      }
      // Compared structurally: the union's members have different shapes, and a field-by-field test
      // would have to be extended by hand for each new kind — the drift ADR-043 names.
      const dup = c.selectors.some((s) => JSON.stringify(s) === JSON.stringify(f.sel));
      if (dup) return { ok: true, effect: 'known', next: c };
      return {
        ok: true,
        effect: 'created',
        next: { ...c, selectors: [...c.selectors, f.sel] },
      };
    }

    case 'derived':
    case 'segment':
    case 'polygon': {
      /**
       * A DERIVATION RESTATED ABOUT A POINT THAT EXISTS IS A CONSTRAINT ON IT (#1320, ADR-AG-144).
       *
       * Operator, 2026-09-21: *"can I define points A and point B and say that point M is [the
       * midpoint]?"* — where M is already the y-axis crossing, which is exactly what the 572 exam needs:
       * M carries TWO roles, and the equality of the two is what fixes the second line's direction.
       *
       * This is #1046's converse. That ruling made «M(3,c)» about an existing derived M a statement
       * rather than a name clash, and built the coordinate direction; the derived direction was left
       * as the clash, on the reading that "M is the centroid" after M exists is a second DEFINITION.
       * The exam says otherwise: stated about an existing point, a derivation is a CONDITION the figure
       * must meet, and refusing it loses a given. So it lowers to `derived-at`, whose residual is the
       * rule's own closed form — for EVERY `DerivedRule`, at the M1 boundary, so no rule has to learn
       * this and the midpoint is not special-cased. A stated point with coordinates gets the same
       * treatment: with nothing left to move, a false restatement is `unsatisfiable`, naming the
       * sentence (#1062's check, the verify half for free).
       *
       * Ordering is preserved, not hidden: the FIRST sentence about M still defines it, and this one
       * constrains it — «M אמצע AB» then «M נקודת החיתוך …» reads the other way and #1113's crossing rule
       * declares M, which is absorbed, then adds its incidences. Either order reaches the same figure.
       */
      if (f.t === 'derived') {
        const standing = objectById(c, f.id);
        // The SAME derivation restated is absorbed, as it always was (#1045) — a condition that repeats
        // the definition adds nothing and must not count as a new given.
        if (standing && standing.kind === 'derived' && sameReference(standing, f)) {
          return { ok: true, effect: 'known', next: c };
        }
        if (standing && isPositional(standing)) {
          return applyFact(c, { t: 'constraint', k: { t: 'derived-at', id: f.id, rule: f.rule }, src: f.src });
        }
      }
      const refs =
        f.t === 'derived' ? parentsOf(f.rule) : f.t === 'segment' ? [f.a, f.b] : f.vertices;

      /**
       * A rule may name a CURVE as its parent (#1059), and that reference is checked here for the
       * same reason the point references are: «מעגל O שמשוואתו …» minting a centre of a circle the
       * figure does not have would be a point defined in terms of nothing.
       */
      for (const curveRef of f.t === 'derived' ? curveParentsOf(f.rule) : []) {
        const o = objectById(c, curveRef);
        // A centre names an equation curve; a touch point names two circles of any construction (#1504).
        const ok = f.t === 'derived' && f.rule.t === 'touch-point' ? !!o && curveKindOf(o) === 'circle' : !!o && o.kind === 'curve';
        if (!ok) {
          return { ok: false, error: unknownRef(c, curveRef) };
        }
      }

      /**
       * DECLARATION vs REFERENCE — the distinction #1017 turns on, and it is not a softening of
       * #1028's `unknown-reference` refusal.
       *
       * «M אמצע AB» REFERS to `A` and `B`: inventing them would place positions the question never
       * gave ([ADR-052](../../docs/06-decisions.md#adr-052)) and spend letters the student is about
       * to use ([ADR-297](../../docs/06-decisions.md#adr-297)). It still refuses.
       *
       * «משולש ABC» **introduces** `A`, `B` and `C` — that is what a shape noun is for. The honest
       * answer is a vertex with two free degrees of freedom: drawn somewhere, moving under «הציגו
       * תצורה אחרת», counted in the DOF cue. Refusing here would make the student place three points
       * before they could name the triangle, which inverts how every exam sentence is written.
       *
       * **Segments moved to the declaration side** (#1074). They sat with the references on the
       * reading that «הקטע AB» is about points under discussion — and the operator's ruling on
       * «הישר AB» (2026-09-15: *"introduce them with dof"*) settles the general question the other
       * way: NAMING a thing introduces its points, REFERRING to one does not. «הקטע EF» names a
       * segment; «M אמצע AB» refers to two points while naming a third. #1028's refusal is
       * untouched, and the tests that lock it are all midpoint tests, which is the distinction
       * showing through.
       *
       * Refusing here forced a student to place both endpoints before they could name the segment,
       * which inverts how every exam sentence is written — the same argument that made a shape noun
       * introduce its vertices.
       */
      const declares = f.t === 'polygon' || f.t === 'segment';
      let base = c;
      for (const id of refs) {
        const o = objectById(base, id);
        if (o && isPositional(o)) continue;
        if (o) {
          return {
            ok: false,
            error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(o) },
          };
        }
        if (!declares) {
          // Named in the student's own words, never as internal state: the message says WHICH point.
          return { ok: false, error: unknownRef(c, id) };
        }
        base = { ...base, objects: [...base.objects, { kind: 'free', id }] };
      }
      c = base;

      const found = priorOf(c, f);
      if (found && 'clash' in found) {
        return {
          ok: false,
          error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(found.prior) },
        };
      }
      const prior = found?.same;
      if (prior) {
        // M1: restating the same construction is absorbed — no duplicate row, no re-creation. This
        // is what lets a later section of a question name what an earlier one established.
        if (sameReference(prior, f)) {
          /**
           * A restatement may still TELL US WHAT THE RING IS (#1049).
           *
           * «מרובע ABCD» then «דלתון ABCD» is the same ring — the id is identical — and the second
           * sentence is not a duplicate: it says the quadrilateral is a kite, which is what makes
           * «האלכסון הראשי» meaningful later. The constraints the noun carries arrive as their own
           * facts and are absorbed or not on their own merits; this only records the naming.
           *
           * One-way, like every other promotion here: a later «מרובע ABCD» does not un-kite it.
           */
          const moreSpecific =
            f.t === 'polygon' &&
            !!f.noun &&
            !isGenericNoun(f.noun) &&
            prior.kind === 'polygon' &&
            (!prior.noun || isGenericNoun(prior.noun));
          if (moreSpecific) {
            return {
              ok: true,
              effect: 'narrowed',
              next: {
                ...c,
                objects: c.objects.map((o) => (o.id === f.id ? { ...prior, noun: f.noun } : o)),
              },
            };
          }
          return { ok: true, effect: 'known', next: c };
        }
        return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }

      /**
       * ONE POSITION, ONE NAME (#1153) — the invariant, at the figure rather than in one rule.
       *
       * Measured before this: «P מרכז המעגל I» · «O מרכז המעגל I» · «T מרכז המעגל I» left
       * THREE points stacked at (3,4) with no fault — the class #1113 already reported once and #1126
       * measured again on curves. Putting the check in the centre rule would be the patch shape and
       * would guarantee a fourth occurrence, so it sits where EVERY derived naming is minted: the
       * seven `DerivedRule` kinds (midpoint, centroid, incentre, orthocentre, circumcentre, diagonals,
       * circle-centre) all pass through here.
       *
       * The test is STRUCTURAL, not positional: two objects deriving the same thing the same way ARE
       * the same point, exactly and with no tolerance. That also scopes it correctly — «A(3,4)» and
       * «B(3,4)» are two independent statements that merely coincide, which is a different question
       * and deliberately NOT answered here (see the ADR; escalated to the operator).
       */
      if (f.t === 'derived') {
        const holder = c.objects.find(
          (o) => o.kind === 'derived' && o.id !== f.id && sameDerivation(o.rule, f.rule),
        );
        if (holder) {
          return { ok: false, error: { code: 'already-named', detail: f.src, holder: statedName(holder.id) } };
        }
      }

      const made: GeoObject =
        f.t === 'derived'
          ? { kind: 'derived', id: f.id, rule: f.rule }
          : f.t === 'segment'
            ? { kind: 'segment', id: f.id, a: f.a, b: f.b }
            : { kind: 'polygon', id: f.id, vertices: f.vertices, noun: f.noun };
      return { ok: true, effect: 'created', next: { ...c, objects: [...c.objects, made] } };
    }
  }
}

/**
 * Do an existing reference object and a restating fact say the same thing?
 *
 * The answer differs by kind, and the reason is where the DEFINITION lives:
 *
 *  - a **segment** and a **polygon** carry a canonical id — `seg-` over the sorted endpoints,
 *   `poly-` over the smallest rotation/reflection of the vertex ring — so the id *is* the
 *   definition. Two of them sharing an id are the same figure by construction, and «משולש ABC» /
 *   «משולש ACB» must absorb rather than conflict. A comparison of the raw vertex order here would
 *   reject the same triangle written the other way round;
 *  - a **derived** point's id is the letter the STUDENT chose, which says nothing about the rule, so
 *   `M אמצע AB` and `M אמצע AC` genuinely conflict and the rule has to be compared.
 *
 * Caller has already established that the ids match.
 */
function sameReference(prior: GeoObject, f: Fact): boolean {
  if (prior.kind === 'derived' && f.t === 'derived') {
    return JSON.stringify(prior.rule) === JSON.stringify(f.rule);
  }
  return prior.kind === 'segment' || prior.kind === 'polygon';
}

/** Replace every `{ kind: 'sym', name: sym }` inside `x` with `value` — a structural substitution. */
function substituteSym<T>(x: T, sym: string, value: Expr): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.kind === 'sym' && o.name === sym && Object.keys(o).length === 2) return value;
      return Object.fromEntries(Object.entries(o).map(([k, w]) => [k, walk(w)]));
    }
    return v;
  };
  return walk(x) as T;
}

/** Two lines as homogeneous triples: the same line when the triples are proportional. */
function sameLineTriple(u: [number, number, number], v: [number, number, number]): boolean {
  const nu = Math.hypot(...u);
  const nv = Math.hypot(...v);
  if (nu < 1e-12 || nv < 1e-12) return false;
  const cross = (i: number, j: number) => u[i] * v[j] - u[j] * v[i];
  return Math.max(Math.abs(cross(0, 1)), Math.abs(cross(0, 2)), Math.abs(cross(1, 2))) <= 1e-9 * nu * nv;
}

function pickTighter(
  a: number | undefined,
  b: number | undefined,
  choose: (x: number, y: number) => number,
): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return choose(a, b);
}

/**
 * Two equations describe the same curve when their conic coefficient vectors are PROPORTIONAL —
 * `2x+4y−6=0` and `x+2y−3=0` are one line, and the exam restates in whichever scaling reads best.
 * Compared at parameter probes, like `sameNumbers`, for the same reason.
 */
function sameCurve(a: Curve, b: Curve): boolean {
  // Same rule as the clash above (#1037): two DIFFERENT claimed families are different curves, but
  // an unclaimed family agrees with whatever the other one claimed. Identity is the equation; the
  // kind is an expectation the classifier will settle either way.
  if (a.kind && b.kind && a.kind !== b.kind) return false;
  return PROBE_ENVS.every((env) => {
    const ka = fitConic(a.eq, env);
    const kb = fitConic(b.eq, env);
    if (!ka || !kb) return false;
    const va = [ka.A, ka.B, ka.C, ka.D, ka.E, ka.F];
    const vb = [kb.A, kb.B, kb.C, kb.D, kb.E, kb.F];
    const na = Math.hypot(...va);
    const nb = Math.hypot(...vb);
    if (na < 1e-12 || nb < 1e-12) return false;
    // Proportional up to sign: |cos| between the two coefficient vectors is 1.
    const dot = va.reduce((s, x, i) => s + (x / na) * (vb[i] / nb), 0);
    return Math.abs(Math.abs(dot) - 1) <= 1e-9;
  });
}

/**
 * IS THIS THE SAME CURVE OBJECT? — a STRICTER question than `sameCurve`'s (#1342).
 *
 * `sameCurve` answers *"does the student's restatement contradict what this id already holds?"*, and it
 * is only ever asked of a curve whose id ALREADY matched. Its `|cos|` test is right for that: it is
 * comparing two spellings of one object, so it only has to survive floating-point noise.
 *
 * Scanning the whole figure for a twin is a different question, and `|cos|` is the wrong instrument
 * for it — it is QUADRATIC near 1, so it squashes genuine differences into the noise band. Measured:
 *
 * ```
 *   2x-y+8=0   vs  y=2x+8           0            same line, two spellings
 *   x-y=0      vs  y=x              2.2e-16      same line, machine epsilon
 *   y=x        vs  y=1.000001x      1.25e-13     DIFFERENT lines, 1e-6 apart in slope
 *   y=0        vs  y=0.00001x       5.0e-11      DIFFERENT lines (#1235's own rows)
 * ```
 *
 * Three orders of margin, on a metric that shrinks the thing being measured — and [#1235](https://github.com/dcodish/geo_builder/issues/1235)
 * has already RULED that lines this close are distinct and must offer a crossing ring. So the twin scan
 * compares the NORMALIZED coefficient vectors component by component, resolved for sign, which is
 * LINEAR in the difference: the same pairs then read 1e-16 against 7e-7 and 1e-5 — nine orders of
 * margin instead of three, and #1235's ruling is untouched because `sameCurve` is not modified.
 */
const IDENTICAL_COEF_TOL = 1e-12;

function identicalCurve(a: Curve, b: Curve): boolean {
  if (a.kind && b.kind && a.kind !== b.kind) return false;
  return PROBE_ENVS.every((env) => {
    const ka = fitConic(a.eq, env);
    const kb = fitConic(b.eq, env);
    if (!ka || !kb) return false;
    const va = [ka.A, ka.B, ka.C, ka.D, ka.E, ka.F];
    const vb = [kb.A, kb.B, kb.C, kb.D, kb.E, kb.F];
    const na = Math.hypot(...va);
    const nb = Math.hypot(...vb);
    if (na < 1e-12 || nb < 1e-12) return false;
    const ua = va.map((x) => x / na);
    const ub = vb.map((x) => x / nb);
    // An equation and its negation are one curve, so the sign of the whole vector is free — resolve it
    // from the dominant component rather than trying both and hoping.
    const lead = ua.reduce((best, x, i) => (Math.abs(x) > Math.abs(ua[best]) ? i : best), 0);
    const sign = ua[lead] * ub[lead] < 0 ? -1 : 1;
    return ua.every((x, i) => Math.abs(x - sign * ub[i]) <= IDENTICAL_COEF_TOL);
  });
}

export interface FoldResult {
  construction: Construction;
  /** Per-fact outcome, positionally — the fact list renders refusals in place. */
  errors: Array<ApplyError | null>;
  /**
   * Per-fact EFFECT, positionally — what each statement actually did (#1045).
   *
   * Parallel to  and  wherever that is non-null, so a caller reads exactly one of
   * the two for any fact. Carried out of the fold because the decision belongs to  and
   * every surface that reports it — the fact list, the counter, the notice — must read the same
   * answer rather than each re-deriving one.
   */
  effects: Array<LineEffect | null>;
  /** Per construction constraint, the index of the FACT that added it — see `fold` (#1079). */
  constraintFact: number[];
  /** Per-fact NOTICE, positionally (#1350) — what a statement that landed should tell the student. */
  notices: Array<ApplyNotice | null>;
}

/**
 * The replay fold: facts in, figure-defining construction out. Pure over the ordered list.
 *
 * `groupOf[i]` is the LINE each fact came from (`derive`'s `owner`); a caller with no lines treats
 * every fact as its own line. Two things happen beyond the in-order pass (#1242, ADR-AG-133):
 *
 * 1. **Deferral, to a fixpoint.** A fact that failed at its position is retried against
 *    the completed construction until nothing more lands — «AD גובה לצלע BC» typed before «משולש ABC»
 *    fails only because `B` and `C` do not exist YET, and once the triangle declares them the two
 *    constraints hold exactly as they do in the other order. The 2-D twin is ADR-104, and the operator's
 *    ruling is the same sentence in both products: *the diagram should either respect all input or
 *    refuse to build.* A genuinely unresolvable reference keeps failing and keeps its error.
 *
 *    #1340 (ADR-AG-156, the analytic half of ADR-W-089): the retry takes EVERY failed fact whose
 *    re-apply now succeeds, creating or not. It used to take only the kinds that create nothing (a
 *    `NON_CREATING` list), so «M אמצע AB» typed above «A(0,0)» · «B(4,0)» stayed red while the
 *    crossing typed above its lines built. The list carried ADR-104's stranding limit, which belongs to
 *    the IN-ORDER pass (a creating fact moved later would leave the facts between seeing a figure
 *    without its object); it cannot occur here, because a fact that referenced the new object before
 *    it existed is itself failed and is retried after it, in list order, pass after pass. ADR-AG-013
 *    still holds: an object can only land once every object it references exists, so the construction
 *    stays in dependency order and evaluation still needs no topological sort.
 * 2. **The LINE is the unit of application.** If any fact of a line still fails after the fixpoint,
 *    NONE of that line's facts survive: the fold re-runs without that line, and every one of its facts
 *    carries the line's error. Before this a line lowering to five facts could land three and drop two,
 *    leaving a segment `AD` on the canvas that asserted nothing in a row that read as accepted. Removing
 *    a line can strand a later line that leaned on its partial objects, so this too runs to a fixpoint
 *    (the atomic-group poisoning of the 2-D fold). A clean list pays exactly one pass.
 */
export function fold(facts: readonly Fact[], groupOf?: readonly number[]): FoldResult {
  const group = groupOf ?? facts.map((_, i) => i);
  const excluded = new Map<number, ApplyError>(); // line → the error that faulted it
  for (;;) {
    const r = foldPass(facts, (i) => !excluded.has(group[i]));
    let newly = 0;
    r.errors.forEach((e, i) => {
      if (e && !excluded.has(group[i])) {
        excluded.set(group[i], e);
        newly++;
      }
    });
    if (newly === 0) {
      // Every fact of a faulted line carries the line's error, so a per-line rollup sees one refusal
      // and a positional reader sees no fact of that line as having landed.
      facts.forEach((_, i) => {
        const e = excluded.get(group[i]);
        if (e) {
          r.errors[i] = e;
          r.effects[i] = null;
          r.notices[i] = null;
        }
      });
      return r;
    }
  }
}

/** One fold over the facts `include` admits: the in-order pass, then the deferral fixpoint. */
function foldPass(facts: readonly Fact[], include: (i: number) => boolean): FoldResult {
  let c = EMPTY_CONSTRUCTION;
  const errors: Array<ApplyError | null> = facts.map(() => null);
  const effects: Array<LineEffect | null> = facts.map(() => null);
  const notices: Array<ApplyNotice | null> = facts.map(() => null);
  /**
   * Which FACT put each constraint in the construction (#1079).
   *
   * Recorded HERE, where constraints are applied, rather than read off the parser’s facts — which
   * is what `derive` used to do, and why a constraint synthesised inside `applyFact` could not be
   * blamed on any line. Four sentence kinds build their constraints at M1 because only M1 knows
   * what they refer to («זווית B ישרה», «שטח הדלתון הוא 24», «אלכסוני המרובע נפגשים בנקודה O»,
   * «משוואת האלכסון הראשי»), and every one of them was therefore unreportable: an unsatisfiable
   * given was DETECTED and silently dropped, and the figure was shown contradicting it.
   *
   * Comparing the CONSTRUCTION before and after each fact covers a nested apply without knowing
   * anything about it, so a future resolved reference is attributed with nothing to remember.
   */
  const constraintFact: number[] = [];
  const commit = (i: number, next: Construction, effect: LineEffect, notice?: ApplyNotice) => {
    const before = c.constraints;
    c = next;
    // Appended AND replaced: #1049’s choice collapse swaps a constraint in place, and the
    // replacement belongs to the line that named the seat, not to the line that opened it.
    c.constraints.forEach((k, at) => {
      if (before[at] === k && constraintFact[at] !== undefined) return;
      constraintFact[at] = i;
    });
    errors[i] = null;
    effects[i] = effect;
    notices[i] = notice ?? null;
  };
  facts.forEach((f, i) => {
    if (!include(i)) return;
    const out = applyFact(c, f);
    if (out.ok) commit(i, out.next, out.effect, out.notice);
    else errors[i] = out.error;
  });
  // The deferral fixpoint: retry every still-failed fact — creating or not (#1340) — against the construction the
  // later facts completed. Bounded by the fact count; a pass that lands nothing ends it. A fact is not
  // retried against the very construction it last failed on (nothing changed, so nothing can differ).
  const failedOn = new Map<number, Construction>();
  for (let pass = 0; pass < facts.length; pass++) {
    let progressed = false;
    facts.forEach((f, i) => {
      if (!include(i) || !errors[i]) return;
      if (failedOn.get(i) === c) return;
      const out = applyFact(c, f);
      if (out.ok) {
        commit(i, out.next, out.effect, out.notice);
        progressed = true;
      } else {
        errors[i] = out.error;
        failedOn.set(i, c);
      }
    });
    if (!progressed) break;
  }
  return { construction: c, errors, effects, constraintFact, notices };
}

/**
 * A domain in comparable form — see the `narrowed` vs `known` decision in `applyFact`.
 *
 * Spelled out rather than comparing the objects directly because the merge builds a fresh object
 * with the same keys in a different order, and `exclude` accumulates duplicates that mean nothing.
 */
function normalizeDomain(d: Domain): Record<string, unknown> {
  return {
    min: d.min ?? null,
    max: d.max ?? null,
    minOpen: d.minOpen ?? false,
    maxOpen: d.maxOpen ?? false,
    exclude: [...new Set(d.exclude ?? [])].sort((a: number, b: number) => a - b),
  };
}

/**
 * Does the figure already hold a SEGMENT over the two points a curve id names (#1234)?
 *
 * `line-CE` and `seg-CE` are different ids by design, so the twin is not a collision the id space
 * catches. The question the bare «משוואת CE היא …» actually asks is whether the student has already
 * given `CE` an extent, and a drawn segment over `C` and `E` is that answer whatever its own id
 * happens to be — so the endpoints are compared, never the string.
 */
function segmentOverSameEnds(c: Construction, curveId: Id): boolean {
  const m = /^line-([A-Z][0-9₀-₉]?)([A-Z][0-9₀-₉]?)$/.exec(curveId);
  if (!m) return false;
  const [, a, b] = m;
  return c.objects.some(
    (o) => o.kind === 'segment' && ((o.a === a && o.b === b) || (o.a === b && o.b === a)),
  );
}
