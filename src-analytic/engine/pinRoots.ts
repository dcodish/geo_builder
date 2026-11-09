/**
 * THE ROOTS OF A PARAMETER PIN ARE ENUMERATED, AND THE SEED CHOOSES ONE (#2380, ADR-AG-303).
 *
 * «a הוא פרמטר חיובי · M(a,0) · N(13,0) · MN = 9» holds at a = 4 AND at a = 22. The solve found a parameter a given
 * pins by DESCENT, from the sampler's default window (1..4 for a half-bounded domain, ±1..4 unbounded), and the walk
 * is first-convergence-wins: a root outside the window was unreachable at every seed, the knowledge pool saw one
 * value and printed it as KNOWN (02c R61), and when the domain excluded the near root («N(5,0)», a > 0: −4 excluded,
 * 14 far) no start converged admissibly and a satisfiable given was refused. More restarts in the same window would
 * not help: wider restarts are still first-wins, so they pick one root and can never ENUMERATE the others.
 *
 * So a 1-DOF pin is found structurally and its roots are found by SCAN — numeric only, no CAS (ADR-AG-001 D1):
 *
 * 1. **A pin.** A constraint whose residual reads exactly one in-scope register symbol not yet fixed, through the
 *    objects it names and everything they are built from (`carriers.ts` `symbolDeps` / `objectDeps`), and no free
 *    vertex or rider (`carrierOf`). Walked in application order and repeated, so the decomposition is triangular:
 *    once `a` is fixed, «המעגלים משיקים מבחוץ» (|MN| = r + 2r) pins `r`.
 * 2. **The scan.** That constraint's residual alone, as a function of the symbol: `GRID` points spaced uniformly in
 *    `asinh` over the symbol's domain (the one the sampler and `admissible` use) clipped to ±L, L = 64·S with S the
 *    largest numeric literal of the construction (at least 1) — dense near 0, still reaching L. A bracket is a sign
 *    change of any residual component (bisected), or a local minimum of the residual's size (a touching root,
 *    golden-section). A candidate is a root only if the WHOLE residual is within `ROOT_EPS` there; duplicates merge.
 *    A run of satisfying grid points is an identity, not a pin: nothing is returned and the symbol stays free.
 * 3. **The choice** is the caller's (`evaluate.ts`): seed 0 the root nearest its own sample (the one today's descent
 *    reaches, so the first drawing does not move), any other seed an independent stream.
 *
 * The roots SEED the solve (the #1071 lesson: seed the region, never filter it); the judge, the domains and the
 * selectors keep the last word. Sampled within ±L, never proven: a root beyond L is not found here, and the descent
 * still runs as before for anything the scan does not cover.
 */
import type { Constraint } from './solve';
import { inDomain, type Domain } from './types';
import type { Env } from './expr';

/** Grid size of one scan. */
export const GRID = 256;
/** A residual within this is a root — `evaluate.ts`'s `SATISFIED_EPS`, the bar the judge applies afterwards. */
export const ROOT_EPS = 1e-6;
/** Two roots closer than this (relative) are one. */
const SAME_ROOT = 1e-6;

/** The roots of `f` over `domain ∩ [−L, L]`, ascending — or `'identity'` when `f` holds on a run of the grid. */
export function scanRoots(f: (v: number) => number[] | null, domain: Domain, L: number): number[] | 'identity' {
  const lo = Math.max(domain.min ?? -L, -L);
  const hi = Math.min(domain.max ?? L, L);
  if (!(hi > lo)) return [];
  const size = (r: number[] | null) => (r === null || r.some((x) => !Number.isFinite(x)) ? Number.NaN : Math.max(0, ...r.map(Math.abs)));
  const at = (v: number) => {
    const r = f(v);
    return { v, r, n: size(r) };
  };
  const t0 = Math.asinh(lo);
  const t1 = Math.asinh(hi);
  const grid = Array.from({ length: GRID }, (_, i) => at(Math.sinh(t0 + ((t1 - t0) * i) / (GRID - 1))));
  for (let i = 1; i < GRID; i += 1) if (grid[i - 1].n <= ROOT_EPS && grid[i].n <= ROOT_EPS) return 'identity';

  const found: number[] = [];
  const accept = (v: number) => {
    if (!inDomain(domain, v)) return;
    if (!(size(f(v)) <= ROOT_EPS)) return;
    if (found.some((w) => Math.abs(w - v) <= SAME_ROOT * Math.max(1, Math.abs(v)))) return;
    found.push(v);
  };
  for (const g of grid) if (g.n <= ROOT_EPS) accept(g.v);
  // A sign change of any component: bisected on that component to the last bit.
  for (let i = 1; i < GRID; i += 1) {
    const [p, q] = [grid[i - 1], grid[i]];
    if (!p.r || !q.r || p.r.length !== q.r.length) continue;
    for (let j = 0; j < p.r.length; j += 1) {
      const [a0, b0] = [p.r[j], q.r[j]];
      if (!Number.isFinite(a0) || !Number.isFinite(b0) || a0 === 0 || b0 === 0 || Math.sign(a0) === Math.sign(b0)) continue;
      let [a, b, fa] = [p.v, q.v, a0];
      for (let it = 0; it < 200 && b - a > 1e-15 * Math.max(1, Math.abs(a)); it += 1) {
        const m = (a + b) / 2;
        const fm = f(m)?.[j];
        if (fm === undefined || !Number.isFinite(fm)) break;
        if (fm === 0) {
          a = b = m;
          break;
        }
        if (Math.sign(fm) === Math.sign(fa)) [a, fa] = [m, fm];
        else b = m;
      }
      accept((a + b) / 2);
    }
  }
  // A local minimum of the residual's size: a root the residual only touches (no sign change).
  for (let i = 1; i + 1 < GRID; i += 1) {
    const [p, g, q] = [grid[i - 1], grid[i], grid[i + 1]];
    if (!(g.n < p.n) || !(g.n <= q.n)) continue;
    let [a, b] = [p.v, q.v];
    const R = (Math.sqrt(5) - 1) / 2;
    let x1 = b - R * (b - a);
    let x2 = a + R * (b - a);
    let f1 = size(f(x1));
    let f2 = size(f(x2));
    for (let it = 0; it < 120 && b - a > 1e-15 * Math.max(1, Math.abs(a)); it += 1) {
      if (!(f1 <= f2)) {
        a = x1;
        x1 = x2;
        f1 = f2;
        x2 = a + R * (b - a);
        f2 = size(f(x2));
      } else {
        b = x2;
        x2 = x1;
        f2 = f1;
        x1 = b - R * (b - a);
        f1 = size(f(x1));
      }
    }
    accept((a + b) / 2);
  }
  return found.sort((x, y) => x - y);
}

/** One pin the walk found: the symbol, the constraint that pins it, its roots, and the root the seed took. */
export interface Pin {
  sym: string;
  constraint: Constraint;
  roots: number[];
  index: number;
}

export interface PinWalk {
  /** The constraints, resolved, in application order. */
  constraints: readonly Constraint[];
  /** The in-scope symbols (the panel's: no direction symbol) with the domain the sampler draws them in. */
  scope: ReadonlyMap<string, Domain>;
  /** What a constraint reads: its register symbols, and whether any free vertex or rider reaches it. */
  depsOf: (k: Constraint) => { syms: string[]; free: boolean };
  /** A constraint's residual at an environment (positions placed from it alone), or null if it cannot be judged. */
  residualAt: (k: Constraint, env: Env) => number[] | null;
  /** The scan's reach. */
  L: number;
  /** Which root this configuration takes, given the symbol's own sample. */
  choose: (sym: string, roots: readonly number[], sample: number) => number;
  /** The scans already run for this construction and assignment, keyed by the pin and the roots fixed before it. */
  cache?: Map<string, number[] | 'identity'>;
}

/**
 * THE TRIANGULAR WALK — every pin, in application order, each scanned with the roots chosen before it fixed. Returns
 * the environment seeded with the chosen roots and the pins found. A root another constraint the fix fully decides
 * contradicts is passed over while some root satisfies them all; a pin with no root in its domain seeds nothing (the
 * solve and the judge then answer as before).
 */
export function walkPins(w: PinWalk, env: Env): { env: Env; pins: Pin[] } {
  const fixed = new Set<string>();
  const used = new Set<Constraint>();
  const pins: Pin[] = [];
  let out: Env = env;
  const deps = new Map(w.constraints.map((k) => [k, w.depsOf(k)] as const));
  const open = (k: Constraint) => deps.get(k)!.syms.filter((s) => !fixed.has(s));
  for (let progress = true; progress; ) {
    progress = false;
    for (const k of w.constraints) {
      if (used.has(k)) continue;
      const d = deps.get(k)!;
      if (d.free) continue;
      const left = open(k);
      if (left.length !== 1 || !w.scope.has(left[0])) continue;
      const sym = left[0];
      used.add(k);
      const base = out;
      const key = `${w.constraints.indexOf(k)}|${sym}|${pins.map((p) => base[p.sym]).join(',')}`;
      const cached = w.cache?.get(key);
      const roots = cached ?? liveRoots(w, k, sym, base, open, deps);
      if (cached === undefined) w.cache?.set(key, roots);
      if (roots === 'identity' || roots.length === 0) continue;
      const index = w.choose(sym, roots, base[sym]);
      out = { ...out, [sym]: roots[index] };
      fixed.add(sym);
      pins.push({ sym, constraint: k, roots, index });
      progress = true;
    }
  }
  return { env: out, pins };
}

/**
 * One pin's roots — its constraint's scan, less any root that another constraint the fix fully decides (no open
 * symbol and no free vertex once `sym` is fixed) contradicts, while some root satisfies them all.
 */
function liveRoots(
  w: PinWalk,
  k: Constraint,
  sym: string,
  base: Env,
  open: (k: Constraint) => string[],
  deps: ReadonlyMap<Constraint, { syms: string[]; free: boolean }>,
): number[] | 'identity' {
  const scanned = scanRoots((v) => w.residualAt(k, { ...base, [sym]: v }), w.scope.get(sym)!, w.L);
  if (scanned === 'identity' || scanned.length === 0) return scanned;
  const decided = w.constraints.filter((q) => q !== k && !deps.get(q)!.free && open(q).length === 1 && open(q)[0] === sym);
  const live = scanned.filter((v) =>
    decided.every((q) => {
      const r = w.residualAt(q, { ...base, [sym]: v });
      return r === null || r.every((x) => Math.abs(x) <= ROOT_EPS);
    }),
  );
  return live.length > 0 ? live : scanned;
}

/**
 * THE FIGURE'S STATED SCALE — the construction's largest numeric literal, at least 1 (#2426, ADR-AG-324). Read off
 * what the student STATED (every number in the objects' and constraints' expressions), never off a position a
 * parameter moves, so it cannot grow with the value it scales. One function: the pin scan's reach and the free
 * parameter's sampling range ({@link pinReach}, `sampleParam`) and the free vertex's seeding box all read it.
 */
export function statedScale(...parts: unknown[]): number {
  let s = 1;
  const walk = (v: unknown): void => {
    if (typeof v === 'number') {
      if (Number.isFinite(v)) s = Math.max(s, Math.abs(v));
      return;
    }
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) v.forEach(walk);
    else Object.values(v as Record<string, unknown>).forEach(walk);
  };
  parts.forEach(walk);
  return s;
}

/** The scan's reach: 64 × the construction's largest numeric literal (at least 1). */
export function pinReach(...parts: unknown[]): number {
  return 64 * statedScale(...parts);
}

/**
 * THE ROOTS OF A DETERMINED BLOCK ARE LISTED, AND THE SEED CHOOSES ONE (#2731, [ADR-AG-451](../../docs/06c-decisions-analytic.md#adr-ag-451),
 * extending ADR-AG-303 from a pin to the block with a carrier).
 *
 * «y^2=4px · K על הפרבולה · y_K = 12 · KF = 20» holds at p = 2 AND at p = 18, and «KF = 20» reads K, a free point, so
 * p is no pin and the scan above never sees it. Every other root was left to descent from the sample, which the seed
 * barely moves (the basin boundary sits at p = 6, the window is [1, 4)): the pool held p = 2 at every seed and the
 * panel printed «2» as known. The same with four circles tangent to a line and both axes: (5, 5) at every seed.
 *
 * So a block the givens DETERMINE (converged at configuration 0, no freedom left) has its other roots found by
 * DEFLATED DESCENT on its own residuals — numeric only, no CAS (ADR-AG-001 D1). Every root found so far divides the
 * residuals by its distance: `r(x) · Π (1 + 1 / ‖x − root‖²)`, distances in the figure's own units, so each known root
 * stops being a solution and the descent is carried to another; every candidate is POLISHED on the real residuals and
 * listed with the caller's verdict on it (`admit`) — a root the judge rejects is deflated all the same, so a comparison
 * only a later root satisfies is still reached. `BLOCK_STARTS` fixed nudges of the anchor (no seed: the list
 * is a function of the input), repeated in rounds while a round still finds a new root, at most `cap` roots in all.
 * Sampled, never proven: a root no deflated start reaches is not listed, and the descent still runs as before.
 */
export const BLOCK_STARTS = 4;
export const BLOCK_ROUNDS = 5;
/** How far a start is nudged off the anchor, in the figure's units (a quarter of its span). */
const BLOCK_NUDGE = 0.25;

export interface BlockRootSearch {
  /** The root configuration 0 converged to — listed first, whether or not the judge admits it. */
  anchor: readonly number[];
  /** The block's residuals (every row, the solve's own). */
  residuals: (x: number[]) => number[];
  /** One solve from a start on a residual function — the figure solve's own descent. */
  solve: (x0: number[], f: (x: number[]) => number[]) => { values: number[]; ok: boolean };
  /** Is this root a configuration of the figure the student described (domains, selectors, rings)? */
  admit: (x: number[]) => boolean;
  /**
   * Each coordinate's difference, in units of the figure (a length over the span, an angle over its period, wrapped):
   * the one distance the deflation and the duplicate test read, so a direction θ and θ + π are one root.
   */
  delta: (a: readonly number[], b: readonly number[], i: number) => number;
  /** Two roots closer than this (in `delta` units) are one. */
  same: number;
  /** At most this many roots, the anchor included. */
  cap: number;
}

export interface BlockRoots {
  /** The roots, the anchor first, then in the order the rounds found them. */
  roots: number[][];
  /** Which of them the judge admits. */
  admitted: boolean[];
  /** How many solves the listing cost (the #1473 perf lock's counter). */
  solves: number;
}

/** A start direction per (start, coordinate): fixed, so the list depends on the input alone. */
const nudgeAt = (k: number, i: number): number => Math.sin(12.9898 * (i + 1) * (k + 1) + 78.233 * (k + 1));

export function enumerateBlockRoots(s: BlockRootSearch): BlockRoots {
  const n = s.anchor.length;
  const roots: number[][] = [[...s.anchor]];
  const admitted: boolean[] = [s.admit([...s.anchor])];
  let solves = 0;
  if (n === 0) return { roots, admitted, solves };
  const dist2 = (a: readonly number[], b: readonly number[]) => {
    let d = 0;
    for (let i = 0; i < n; i += 1) d += s.delta(a, b, i) ** 2;
    return d;
  };
  const known = (x: readonly number[]) => roots.some((q) => dist2(x, q) <= s.same * s.same);
  // A start in delta units, mapped back by the per-coordinate unit `delta` reads (one unit's difference at the anchor).
  const unit = Array.from({ length: n }, (_, i) => {
    const probe = [...s.anchor];
    probe[i] += 1;
    const d = Math.abs(s.delta(probe, s.anchor, i));
    return d > 0 ? 1 / d : 1;
  });
  for (let round = 0; round < BLOCK_ROUNDS && roots.length < s.cap; round += 1) {
    let found = false;
    for (let k = 0; k < BLOCK_STARTS && roots.length < s.cap; k += 1) {
      const dir = Array.from({ length: n }, (_, i) => nudgeAt(k, i));
      const norm = Math.hypot(...dir) || 1;
      const x0 = s.anchor.map((v, i) => v + (BLOCK_NUDGE * dir[i] * unit[i]) / norm);
      const fixedRoots = roots.map((q) => [...q]);
      const deflated = (x: number[]): number[] => {
        let m = 1;
        for (const q of fixedRoots) m *= 1 + 1 / Math.max(dist2(x, q), 1e-24);
        return s.residuals(x).map((r) => r * m);
      };
      const a = s.solve(x0, deflated);
      const b = s.solve(a.values, s.residuals);
      solves += 2;
      if (!b.ok || b.values.some((v) => !Number.isFinite(v)) || known(b.values)) continue;
      // A root the judge rejects is still a root: deflated too, so the next start is carried past it to the others.
      roots.push(b.values);
      admitted.push(s.admit(b.values));
      found = true;
    }
    if (!found) break;
  }
  return { roots, admitted, solves };
}
