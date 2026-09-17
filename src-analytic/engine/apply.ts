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
import { resolveCurve } from './curves';
import { curveParentOf, parentsOf, type DerivedRule } from './derived';
import { constraintCurveRefs, constraintRefs } from './solve';
import { isGenericNoun, namesOption, rightAngleAt, shapeRow } from './shapes';
import { evalExpr, type Env } from './expr';
import {
  EMPTY_CONSTRUCTION,
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
   * «האלכסון הראשי» in a shape whose noun distinguishes no principal diagonal (#1070).
   *
   * A kite has one — its axis of symmetry is a fact about the figure. A plain quadrilateral, a
   * parallelogram and a rhombus do not, and picking one would assert a distinction the question
   * never made. The message names the endpoints form instead.
   */
  | 'undistinguished-diagonal'
  /** A stated given the solve could not satisfy — reported, never drawn as if it held. */
  | 'unsatisfiable';

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

export type ApplyOutcome =
  | { ok: true; next: Construction; effect: LineEffect }
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
export function statedName(id: Id): string {
  const m = /^(?:line|circle)-(.+)$/.exec(id);
  return m ? m[1] : id;
}

/**
 * The object kinds that HAVE a shape — what an `on-curve` or a curve direction may name (#1150).
 *
 * A stated equation, a circle given by its centre, a line built through a point: each resolves to a
 * curve at evaluation, and each is a legitimate carrier. A POINT is not, and neither is a polygon —
 * naming one where a curve belongs is the same mistake as naming a curve that does not exist.
 */
const CURVE_BEARING: ReadonlySet<string> = new Set(['curve', 'circle-at', 'line-at']);

/** The probe environment for restatement comparison — see `sameNumbers`. */
const PROBE_ENVS: Env[] = [
  { a: 1.7, b: 2.3, k: 1.3, m: 0.7, n: 2.1, p: 1.9, r: 1.1, t: 2.7 },
  { a: 3.1, b: 1.1, k: 2.9, m: 1.3, n: 0.9, p: 3.3, r: 2.3, t: 1.3 },
];

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

export function applyFact(c: Construction, f: Fact): ApplyOutcome {
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
            return {
              ok: true,
              effect: 'created',
              next: {
                ...c,
                objects: c.objects.map((o) => (o.id === f.id ? { ...prior, stated: true } : o)),
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
      return {
        ok: true,
        effect: 'created',
        next: {
          ...c,
          objects: [...c.objects, { kind: 'curve', id: f.id, label: f.label, curve: f.curve, stated: f.stated }],
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
      const missing = constraintRefs(f.k).find((id) => {
        const o = objectById(c, id);
        return !o || !isPositional(o);
      });
      if (missing !== undefined) {
        return { ok: false, error: { code: 'unknown-reference', detail: statedName(missing) } };
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
        return { ok: false, error: { code: 'unknown-reference', detail: statedName(missingCurve) } };
      }
      // Restating the same constraint adds nothing — M1's absorb, so a later section of a question
      // may repeat a given without it counting twice against the figure's freedom.
      const dup = c.constraints.some((k) => JSON.stringify(k) === JSON.stringify(f.k));
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
      const id = `line-${a}${b}`;
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
        return { ok: false, error: { code: 'unknown-reference', detail: statedName(f.centre) } };
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
        return { ok: false, error: { code: 'unknown-reference', detail: statedName(f.through) } };
      }
      const prior = objectById(c, f.id);
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
          objects: [...c.objects, { kind: 'line-at', id: f.id, through: f.through, dir: f.dir, perp: f.perp }],
        },
      };
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
        return { ok: false, error: { code: 'unknown-reference', detail: statedName(f.id) } };
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
      const kindOf = (o: GeoObject): string | null => {
        if (o.kind === 'circle-at') return 'circle';
        if (o.kind !== 'curve') return null;
        if (o.curve.kind) return o.curve.kind;
        const probe = resolveCurve(o.curve, PROBE_ENVS[0]);
        return probe.ok ? probe.curve.kind : null;
      };
      const matches = c.objects.filter((o) => kindOf(o) === f.kind);
      if (matches.length !== 1) return { ok: false, error: { code: 'ambiguous-shape', detail: f.src } };
      return applyFact(c, { t: 'constraint', k: { t: 'on-curve', id: f.id, curve: matches[0].id }, src: f.src });
    }

    case 'tangent-of': {
      const circles = c.objects.filter((o) => o.kind === 'circle-at');
      if (circles.length !== 1) return { ok: false, error: { code: 'ambiguous-shape', detail: f.src } };
      const circle = circles[0] as Extract<GeoObject, { kind: 'circle-at' }>;
      return applyAll(
        c,
        f.axes.map((axis) => ({
          t: 'constraint' as const,
          k: { t: 'tangent-axis' as const, centre: circle.centre, r: circle.r, axis },
          src: f.src,
        })),
      );
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
      const host = objectById(c, f.id);
      if (!host || !isPositional(host)) {
        return { ok: false, error: { code: 'unknown-reference', detail: statedName(f.id) } };
      }
      const rings = c.objects.filter((g) => g.kind === 'polygon' && g.vertices.includes(f.id));
      if (rings.length !== 1) {
        return { ok: false, error: { code: 'ambiguous-angle', detail: f.src } };
      }
      const ring = (rings[0] as PolygonObject).vertices;
      const i = ring.indexOf(f.id);
      // The angle AT a vertex of a ring is the one between its two NEIGHBOURS — the figure's own
      // convention, and the only reading that is right for a quadrilateral as well as a triangle.
      const prev = ring[(i - 1 + ring.length) % ring.length];
      const next = ring[(i + 1) % ring.length];
      return applyFact(c, { t: 'constraint', k: rightAngleAt(f.id, prev, next), src: f.src });
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
        f.sel.kind === 'axis-side' || f.sel.kind === 'crossing-distinct'
          ? [f.sel.id]
          : f.sel.kind === 'distinct'
            ? f.sel.ids
            : [f.sel.id, f.sel.a, f.sel.b];
      for (const id of refs) {
        const o = objectById(c, id);
        if (!o || !isPositional(o)) {
          return { ok: false, error: { code: 'unknown-reference', detail: statedName(id) } };
        }
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
      const refs =
        f.t === 'derived' ? parentsOf(f.rule) : f.t === 'segment' ? [f.a, f.b] : f.vertices;

      /**
       * A rule may name a CURVE as its parent (#1059), and that reference is checked here for the
       * same reason the point references are: «מעגל O שמשוואתו …» minting a centre of a circle the
       * figure does not have would be a point defined in terms of nothing.
       */
      const curveRef = f.t === 'derived' ? curveParentOf(f.rule) : null;
      if (curveRef !== null) {
        const o = objectById(c, curveRef);
        if (!o || o.kind !== 'curve') {
          return { ok: false, error: { code: 'unknown-reference', detail: statedName(curveRef) } };
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
          return { ok: false, error: { code: 'unknown-reference', detail: statedName(id) } };
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
}

/** The replay fold: facts in, figure-defining construction out. Pure over the ordered list. */
export function fold(facts: readonly Fact[]): FoldResult {
  let c = EMPTY_CONSTRUCTION;
  const errors: Array<ApplyError | null> = [];
  const effects: Array<LineEffect | null> = [];
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
  facts.forEach((f, i) => {
    const before = c.constraints;
    const out = applyFact(c, f);
    if (out.ok) {
      c = out.next;
      // Appended AND replaced: #1049’s choice collapse swaps a constraint in place, and the
      // replacement belongs to the line that named the seat, not to the line that opened it.
      c.constraints.forEach((k, at) => {
        if (before[at] === k && constraintFact[at] !== undefined) return;
        constraintFact[at] = i;
      });
      errors.push(null);
      effects.push(out.effect);
    } else {
      errors.push(out.error);
      effects.push(null);
    }
  });
  return { construction: c, errors, effects, constraintFact };
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
