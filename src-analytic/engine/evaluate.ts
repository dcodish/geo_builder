/**
 * Construction → figure. Pure, deterministic in the seed.
 *
 * The one design decision worth stating: an unpinned parameter is a **free DOF sampled inside its
 * domain**, not a fixed default ([ADR-052](../../docs/06-decisions.md#adr-052) carried over
 * verbatim). The figure must be drawable before `a` is pinned, so a value is chosen — but it
 * changes with the seed, which is what "show another configuration" cycles. A parameter that never
 * moved would be a given the question never gave, which is this codebase's cardinal sin.
 *
 * The domain is honoured HERE, at sampling time, which is D7 kind 1: a value outside it was never
 * a candidate, so `a > 0` never produces a negative sample and never has to report a failure.
 */
import { paramRegister } from './carriers';
import { evalRule, type Pt } from './derived';
import { resolveCurve, curveExtent, type Box } from './curves';
import type { ClassifyResult } from './conic';
import { evalExpr, type Env } from './expr';
import { inDomain, type Construction, type Domain, type Id, type CurveLabel, type NumCurve } from './types';

export interface FigurePoint {
  id: Id;
  x: number;
  y: number;
}

export interface FigureCurve {
  id: Id;
  label: CurveLabel;
  curve: NumCurve;
}

/**
 * An object that produced no drawable geometry, WITH the reason (#896).
 *
 * The reason is the whole point. `vacant` is not an error — an empty circle at this parameter
 * value is a legitimate state the domain filter needs to observe. The scope reasons are refusals,
 * and `derive` turns exactly those into a fault the student sees. Carrying only the id, as this
 * did, made the two indistinguishable and so made the refusal unreportable.
 */
export interface Vacancy {
  id: Id;
  reason: Extract<ClassifyResult, { ok: false }>['reason'];
}

/** A drawn straight piece — a stated segment, or one side of a polygon (#1028). Carried as resolved
 *  endpoints so the renderer never looks a vertex up. */
export interface FigureSegment {
  id: Id;
  a: Pt;
  b: Pt;
}

export interface Figure {
  env: Env;
  points: FigurePoint[];
  curves: FigureCurve[];
  segments: FigureSegment[];
  /** Objects that do not exist at this parameter value — named, never silently dropped. */
  vacant: Vacancy[];
}

// ---------------------------------------------------------------------------
// Sampling a parameter inside its domain
// ---------------------------------------------------------------------------

/** A tiny deterministic hash → [0,1). Same seed, same figure; different seed, different figure. */
function jitter(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A value strictly inside the domain. The bounded case takes an interior point; a half-bounded
 * domain steps away from its bound; unbounded lands near 1..4. Excluded values are stepped over.
 */
export function sampleParam(d: Domain, seed: number, salt: number): number {
  const u = jitter(seed, salt);
  let v: number;
  if (d.min !== undefined && d.max !== undefined) {
    // Stay off both ends so an OPEN bound is never hit and a closed one is never sat on.
    v = d.min + (0.2 + 0.6 * u) * (d.max - d.min);
  } else if (d.min !== undefined) {
    v = d.min + 1 + 3 * u;
  } else if (d.max !== undefined) {
    v = d.max - 1 - 3 * u;
  } else {
    v = 1 + 3 * u;
  }
  for (let guard = 0; guard < 8 && !inDomain(d, v); guard += 1) v += 0.37;
  return v;
}

/**
 * The parameter assignment for a seed — the figure's free DOFs, resampled by "another
 * configuration".
 *
 * The register comes from {@link paramRegister}, which reads the OBJECTS and not only the F11
 * declarations (#1014). Sampling the declarations alone meant `y²=2ax` with no «a הוא פרמטר» — a
 * catalog entry — left `a` unbound, evaluated to `NaN`, and drew nothing while saying nothing. An
 * unstated magnitude is a free DOF ([ADR-052](../../docs/06-decisions.md#adr-052)), so it is
 * sampled; a declaration narrows its domain rather than granting it existence.
 */
export function sampleEnv(c: Construction, seed = 0): Env {
  const env: Record<string, number> = {};
  paramRegister(c).forEach((p, i) => {
    env[p.sym] = sampleParam(p.domain, seed, i + 1);
  });
  return env;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluate(c: Construction, seed = 0): Figure {
  const env = sampleEnv(c, seed);
  const points: FigurePoint[] = [];
  const curves: FigureCurve[] = [];
  const segments: FigureSegment[] = [];
  const vacant: Vacancy[] = [];

  // One walk over the OBJECTS, in the order the student stated them. Two things make a single
  // forward pass correct:
  //   - the environment is complete before it starts (every parameter assigned) — the
  //     object→parameter layer, `carriers.ts` `symbolDeps`;
  //   - a parent always PRECEDES its dependent, because `apply` refuses a statement naming an
  //     object that does not exist yet — so declaration order is a valid topological order and a
  //     cycle is unreachable (`carriers.ts` `depsPrecedeDependents`, asserted in the suite).
  const placed = new Map<Id, Pt>();
  const at = (id: Id): Pt | null => placed.get(id) ?? null;

  for (const o of c.objects) {
    switch (o.kind) {
      case 'point': {
        const x = evalExpr(o.x, env);
        const y = evalExpr(o.y, env);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push({ id: o.id, x, y });
          placed.set(o.id, { x, y });
        }
        // A point whose coordinates do not evaluate is absent at this parameter value, never a
        // scope refusal — there is no such thing as an out-of-scope point.
        else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
      case 'curve': {
        const res = resolveCurve(o.curve, env);
        if (res.ok) curves.push({ id: o.id, label: o.label, curve: res.curve });
        else vacant.push({ id: o.id, reason: res.reason });
        break;
      }
      case 'derived': {
        // `null` means a parent was vacant at this parameter value, or the configuration is
        // degenerate (three collinear points have no circumcentre). Both are honest vacancies —
        // "not at this value" — never a point drawn at NaN and never a fallback position.
        const p = evalRule(o.rule, at);
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          points.push({ id: o.id, x: p.x, y: p.y });
          placed.set(o.id, p);
        } else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
      case 'segment': {
        const a = at(o.a);
        const b = at(o.b);
        if (a && b) segments.push({ id: o.id, a, b });
        else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
      case 'polygon': {
        const vs = o.vertices.map(at);
        if (vs.every((v): v is Pt => v !== null)) {
          // Drawn as its closed ring of sides. The renderer stays a pure consumer: it is handed
          // screen-ready pairs, never asked to look a vertex up.
          for (let i = 0; i < vs.length; i += 1) {
            segments.push({ id: `${o.id}-${i}`, a: vs[i], b: vs[(i + 1) % vs.length] });
          }
        } else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
    }
  }
  return { env, points, curves, segments, vacant };
}

// ---------------------------------------------------------------------------
// Knowledge — the honesty gate the data panel binds
// ---------------------------------------------------------------------------

/**
 * Is a quantity KNOWLEDGE, or one sample's accident? Evaluated across several seeds: a value that
 * agrees everywhere is invariant over the free parameters and may be printed; one that moves may
 * not ([ADR-AG-003](../../docs/06c-decisions-analytic.md#adr-ag-003) §2 — with values shown in the
 * panel, this gate carries the whole honesty boundary, so it is the one function in the tree that
 * most deserves its tests).
 */
export function isKnowledge(
  c: Construction,
  read: (f: Figure) => number | null,
  seeds: readonly number[] = [0, 1, 2],
): { known: true; value: number } | { known: false } {
  const vals: number[] = [];
  for (const s of seeds) {
    const v = read(evaluate(c, s));
    if (v === null || !Number.isFinite(v)) return { known: false };
    vals.push(v);
  }
  const scale = Math.max(1, ...vals.map(Math.abs));
  const spread = Math.max(...vals) - Math.min(...vals);
  return spread <= 1e-7 * scale ? { known: true, value: vals[0] } : { known: false };
}

/**
 * Is this curve's SHAPE knowledge — every coefficient invariant across the free DOFs — or is the
 * equation on screen one sample's accident?
 *
 * The point rows have been gated by {@link isKnowledge} since V0; the curve rows were not, and read
 * straight off seed 0. That was survivable only while every drawable curve was fully pinned. It
 * stopped being survivable with #1014: now that a parameter nobody declared is registered and
 * sampled, `y² = 2ax` draws — and an ungated panel printed it as `y² = 6.915870381x`, which is the
 * tool asserting a magnitude the question never gave
 * ([ADR-052](../../docs/06-decisions.md#adr-052)), on the very row
 * [ADR-AG-003](../../docs/06c-decisions-analytic.md#adr-ag-003) §2 says carries the whole honesty
 * boundary.
 *
 * Built ON `isKnowledge` rather than beside it — one coefficient at a time, through the one gate —
 * so there is no second definition of what "invariant" means.
 *
 * Returns the curve when every coefficient is knowledge, and `null` when any of them moves; the
 * caller shows an open row, exactly as it does for an unpinned coordinate.
 */
export function knownCurve(
  c: Construction,
  id: Id,
  seeds: readonly number[] = [0, 1, 2],
): NumCurve | null {
  const read = (f: Figure) => f.curves.find((q) => q.id === id)?.curve ?? null;
  const first = read(evaluate(c, seeds[0]));
  if (!first) return null;
  for (const field of Object.keys(first) as Array<keyof NumCurve>) {
    if (typeof first[field] !== 'number') continue; // `kind` — the discriminant, not a coefficient
    const k = isKnowledge(
      c,
      (f) => {
        const cur = read(f);
        // A curve that is a DIFFERENT family at another seed is not knowledge either: the shape
        // itself varies, which is 02c R13's third row and strictly worse than a moving coefficient.
        if (!cur || cur.kind !== first.kind) return null;
        const v = (cur as Record<string, unknown>)[field as string];
        return typeof v === 'number' ? v : null;
      },
      seeds,
    );
    if (!k.known) return null;
  }
  return first;
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const FALLBACK: Box = { minX: -10, minY: -10, maxX: 10, maxY: 10 };

/**
 * The world window to draw. Built from the points and the BOUNDED curves; an unbounded line or
 * parabola contributes nothing (it would otherwise decide the window by where it happens to be
 * sampled). Always includes the origin, because the axes are the subject here.
 */
export function viewBox(f: Figure, pad = 0.15): Box {
  const xs: number[] = [0];
  const ys: number[] = [0];
  for (const p of f.points) {
    xs.push(p.x);
    ys.push(p.y);
  }
  for (const c of f.curves) {
    const e = curveExtent(c.curve);
    if (e) {
      xs.push(e.minX, e.maxX);
      ys.push(e.minY, e.maxY);
    }
  }
  if (xs.length <= 1 && ys.length <= 1) return FALLBACK;
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  const span = Math.max(w, h, 1) * (1 + 2 * pad);
  // Isotropic: one unit is the same length on both axes, or every circle draws as an ellipse.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  minX = cx - span / 2;
  maxX = cx + span / 2;
  minY = cy - span / 2;
  maxY = cy + span / 2;
  return { minX, minY, maxX, maxY };
}
