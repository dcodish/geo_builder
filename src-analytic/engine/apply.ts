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
import { parentsOf } from './derived';
import { evalExpr, type Env } from './expr';
import {
  conicSlotTaken,
  EMPTY_CONSTRUCTION,
  isCurve,
  isPoint,
  isPositional,
  objectById,
  type Construction,
  type Curve,
  type CurveObject,
  type Fact,
  type GeoObject,
  type Id,
  type PointObject,
} from './types';

export type ApplyErrorCode =
  /** A restatement that contradicts what the figure already holds. */
  | 'conflicting-restatement'
  /** A second parabola or a second ellipse — D6: the anonymous conics are one-per-figure. */
  | 'conic-slot-taken'
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
  | 'unknown-reference';

export interface ApplyError {
  code: ApplyErrorCode;
  /** The student's own words, so the message can name the STATEMENT and never internal state. */
  detail: string;
}

export type ApplyOutcome =
  | { ok: true; next: Construction; absorbed: boolean }
  | { ok: false; error: ApplyError };

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
 * Lookup is by ID across the WHOLE object list, not per array, so a name used for two different
 * kinds is caught by one rule rather than by each kind remembering to ask about the others.
 */
function findPoint(c: Construction, id: Id): PointObject | undefined {
  const o = objectById(c, id);
  return o && isPoint(o) ? o : undefined;
}
function findCurve(c: Construction, id: Id): CurveObject | undefined {
  const o = objectById(c, id);
  return o && isCurve(o) ? o : undefined;
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
        return {
          ok: true,
          absorbed: true,
          next: { ...c, params: c.params.map((p) => (p.sym === f.sym ? merged : p)) },
        };
      }
      return { ok: true, absorbed: false, next: { ...c, params: [...c.params, { sym: f.sym, domain: f.domain }] } };
    }

    case 'point': {
      if (findCurve(c, f.id)) {
        return { ok: false, error: { code: 'name-kind-clash', detail: f.src } };
      }
      const prior = findPoint(c, f.id);
      if (prior) {
        // M1: a statement about an EXISTING point.
        if (sameNumbers(prior.x, f.x) && sameNumbers(prior.y, f.y)) {
          return { ok: true, absorbed: true, next: c }; // agrees — absorbed, no duplicate row
        }
        return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      return {
        ok: true,
        absorbed: false,
        next: { ...c, objects: [...c.objects, { kind: 'point', id: f.id, x: f.x, y: f.y }] },
      };
    }

    case 'curve': {
      if (findPoint(c, f.id)) {
        return { ok: false, error: { code: 'name-kind-clash', detail: f.src } };
      }
      const prior = findCurve(c, f.id);
      if (prior) {
        if (prior.curve.kind !== f.curve.kind) {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src } };
        }
        if (sameCurve(prior.curve, f.curve)) return { ok: true, absorbed: true, next: c };
        // The anonymous conics share one id by design (D6), so a DIFFERENT equation under the same
        // id is not a contradiction about one object — it is a second parabola/ellipse, and it is
        // told so. Reporting "conflicting restatement" here would name the wrong problem.
        const code: ApplyErrorCode = conicSlotTaken(c, f.curve.kind)
          ? 'conic-slot-taken'
          : 'conflicting-restatement';
        return { ok: false, error: { code, detail: f.src } };
      }
      if (conicSlotTaken(c, f.curve.kind)) {
        return { ok: false, error: { code: 'conic-slot-taken', detail: f.src } };
      }
      return {
        ok: true,
        absorbed: false,
        next: {
          ...c,
          objects: [...c.objects, { kind: 'curve', id: f.id, label: f.label, curve: f.curve }],
        },
      };
    }

    /**
     * The three REFERENCE kinds (#1028). They share one shape: every id they name must already be a
     * positional object, and the statement is idempotent under M1 when it says the same thing again.
     */
    case 'derived':
    case 'segment':
    case 'polygon': {
      const refs =
        f.t === 'derived' ? parentsOf(f.rule) : f.t === 'segment' ? [f.a, f.b] : f.vertices;
      const missing = refs.find((id) => {
        const o = objectById(c, id);
        return !o || !isPositional(o);
      });
      if (missing !== undefined) {
        // Named in the student's own words, never as internal state: the message says WHICH point.
        return { ok: false, error: { code: 'unknown-reference', detail: missing } };
      }

      const prior = objectById(c, f.id);
      if (prior) {
        if (prior.kind !== f.t) {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src } };
        }
        // M1: restating the same construction is absorbed — no duplicate row, no re-creation. This
        // is what lets a later section of a question name what an earlier one established.
        if (sameReference(prior, f)) return { ok: true, absorbed: true, next: c };
        return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }

      const made: GeoObject =
        f.t === 'derived'
          ? { kind: 'derived', id: f.id, rule: f.rule }
          : f.t === 'segment'
            ? { kind: 'segment', id: f.id, a: f.a, b: f.b }
            : { kind: 'polygon', id: f.id, vertices: f.vertices };
      return { ok: true, absorbed: false, next: { ...c, objects: [...c.objects, made] } };
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
  if (a.kind !== b.kind) return false;
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
}

/** The replay fold: facts in, figure-defining construction out. Pure over the ordered list. */
export function fold(facts: readonly Fact[]): FoldResult {
  let c = EMPTY_CONSTRUCTION;
  const errors: Array<ApplyError | null> = [];
  for (const f of facts) {
    const out = applyFact(c, f);
    if (out.ok) {
      c = out.next;
      errors.push(null);
    } else {
      errors.push(out.error);
    }
  }
  return { construction: c, errors };
}
