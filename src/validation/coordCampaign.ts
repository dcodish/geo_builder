/**
 * Coordinate-validation campaign ([docs/06-decisions.md] ADR-109) — the *differential* sibling
 * of the invariants campaign (`engine/__tests__/campaign.test.ts`). Where that one checks each
 * figure against geometric INVARIANTS (relations a valid drawing must satisfy, true anywhere),
 * this one checks EXACT COORDINATES against an independent closed-form oracle (`coordOracle.ts`).
 *
 * Method (chosen with the operator, 2026-06-24): every recipe PINS its base points at known
 * coordinates with `free-point` (so the figure has no free similarity gauge — the engine's frame
 * equals the oracle's frame), then derives the rest with a real construct. The oracle computes the
 * derived points' true coordinates by hand. Because the frame is pinned, the engine MUST reproduce
 * those coordinates exactly — no Procrustes alignment needed. A branchy construct (circle∩circle,
 * by-distances, a square's chirality) has SEVERAL valid configurations; the engine passes iff it
 * matches one WHOLE configuration within tolerance.
 *
 * Scope (v1): only constructs whose coordinates are independently computable in closed form AND
 * fully determined by the pinned bases — midpoint, foot, line∩line, on-segment(t), by-distances,
 * circle∩circle, distance/equal-driven on-segment (the numeric solver), square, parallelogram.
 * Shapes with unstated default DOFs (rectangle/rhombus/trapezoid height/angle) are OUT — their
 * coordinates depend on engine defaults, so they belong to the invariants campaign, not here.
 *
 * Pure module: importable from a test (the regression gate) or any runner. No side effects.
 */

import type { Command, Id, Vec } from '@/engine';
import { build, evaluate } from '@/engine';
import {
  type Pt,
  dist,
  midpoint,
  footOnLine,
  lineLineIntersect,
  alongSegment,
  byDistances,
  circleIntersect,
  squareCorners,
  parallelogramD,
} from './coordOracle';

// ── deterministic PRNG (mulberry32 — same family as the invariants campaign) ──
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const fp = (id: Id, p: Pt): Command => ({ type: 'free-point', id, x: p.x, y: p.y });

/** A generated case: commands to build + the SET of valid full coordinate configurations. */
export interface CoordCase {
  name: string;
  commands: Command[];
  /** Each entry is a complete valid assignment {id → position}. Engine passes iff it matches one. */
  configs: Record<Id, Pt>[];
}

type Family = { tag: string; n: number; make: (r: () => number, i: number) => CoordCase };

const families: Family[] = [
  {
    tag: 'midpoint',
    n: 18,
    make: (r, i) => {
      const A = { x: ri(r, -12, 12), y: ri(r, -12, 12) };
      const B = { x: A.x + ri(r, 4, 12), y: A.y + ri(r, -12, 12) };
      const M = midpoint(A, B);
      return {
        name: `midpoint#${i}`,
        commands: [fp('A', A), fp('B', B), { type: 'midpoint', id: 'M', a: 'A', b: 'B' }],
        configs: [{ A, B, M }],
      };
    },
  },
  {
    tag: 'foot',
    n: 18,
    make: (r, i) => {
      const A = { x: ri(r, -10, 0), y: ri(r, -8, 8) };
      const B = { x: ri(r, 2, 12), y: A.y + ri(r, -3, 3) };
      // P offset off the midpoint along the perpendicular ⇒ foot lands strictly inside AB.
      const ab = { x: B.x - A.x, y: B.y - A.y };
      const L = Math.hypot(ab.x, ab.y);
      const h = ri(r, 4, 9) * (i % 2 ? 1 : -1);
      const P = { x: (A.x + B.x) / 2 - (ab.y / L) * h, y: (A.y + B.y) / 2 + (ab.x / L) * h };
      const F = footOnLine(P, A, B);
      return {
        name: `foot#${i}`,
        commands: [fp('A', A), fp('B', B), fp('P', P), { type: 'foot', id: 'F', from: 'P', a: 'A', b: 'B' }],
        configs: [{ A, B, P, F }],
      };
    },
  },
  {
    tag: 'line-line',
    n: 18,
    make: (r, i) => {
      const A = { x: ri(r, -12, -2), y: ri(r, -8, 8) };
      const L = ri(r, 6, 12);
      const B = { x: A.x + L, y: A.y }; // AB horizontal
      const mx = A.x + Math.floor(L / 2); // strictly inside AB
      const H = ri(r, 3, 8);
      const C = { x: mx, y: A.y - H };
      const D = { x: mx, y: A.y + H }; // CD vertical
      const P = lineLineIntersect(A, B, C, D)!;
      return {
        name: `line-line#${i}`,
        commands: [fp('A', A), fp('B', B), fp('C', C), fp('D', D), { type: 'line-line-intersection', id: 'P', a: 'A', b: 'B', c: 'C', d: 'D' }],
        configs: [{ A, B, C, D, P }],
      };
    },
  },
  {
    tag: 'on-segment-t',
    n: 18,
    make: (r, i) => {
      const A = { x: ri(r, -10, 0), y: ri(r, -10, 10) };
      const B = { x: ri(r, 2, 12), y: ri(r, -10, 10) };
      const t = 0.1 + 0.8 * r();
      const E = alongSegment(A, B, t);
      return {
        name: `on-segment-t#${i} t=${t.toFixed(3)}`,
        commands: [fp('A', A), fp('B', B), { type: 'point-on-segment', id: 'E', a: 'A', b: 'B', t }],
        configs: [{ A, B, E }],
      };
    },
  },
  {
    tag: 'by-distances',
    n: 18,
    make: (r, i) => {
      const A = { x: ri(r, -10, 0), y: ri(r, -8, 8) };
      const B = { x: ri(r, 2, 12), y: A.y + ri(r, -4, 4) };
      // a target T strictly above AB ⇒ the two distance-circles genuinely cross.
      const T = { x: (A.x + B.x) / 2 + ri(r, -3, 3), y: Math.max(A.y, B.y) + ri(r, 4, 9) };
      const d1 = dist(T, A);
      const d2 = dist(T, B);
      const branch = i % 2;
      const pts = byDistances(A, d1, B, d2);
      return {
        name: `by-distances#${i} b=${branch}`,
        commands: [fp('A', A), fp('B', B), { type: 'point-by-distances', id: 'E', from1: 'A', dist1: d1, from2: 'B', dist2: d2, branch }],
        configs: pts.map((E) => ({ A, B, E })),
      };
    },
  },
  {
    tag: 'circle-circle',
    n: 18,
    make: (r, i) => {
      const O = { x: ri(r, -8, 2), y: ri(r, -8, 8) };
      const P = { x: O.x + ri(r, 5, 11), y: O.y + ri(r, -3, 3) };
      // a target G above OP ⇒ both circles pass through it ⇒ they intersect.
      const G0 = { x: (O.x + P.x) / 2 + ri(r, -2, 2), y: Math.max(O.y, P.y) + ri(r, 4, 9) };
      const rO = dist(G0, O);
      const rP = dist(G0, P);
      const branch = i % 2;
      const pts = circleIntersect(O, rO, P, rP);
      return {
        name: `circle-circle#${i} b=${branch}`,
        commands: [
          fp('O', O),
          { type: 'circle', id: 'circle-O', center: 'O', radius: rO },
          fp('P', P),
          { type: 'circle', id: 'circle-P', center: 'P', radius: rP },
          { type: 'circle-circle-intersection', id: 'G', circle1: 'circle-O', circle2: 'circle-P', branch },
        ],
        configs: pts.map((G) => ({ O, P, G })),
      };
    },
  },
  {
    tag: 'distance-drive',
    n: 18,
    make: (r, i) => {
      const A = { x: ri(r, -10, 0), y: ri(r, -8, 8) };
      const B = { x: ri(r, 2, 12), y: A.y + ri(r, -3, 3) };
      const L = dist(A, B);
      const val = L * (0.2 + 0.5 * r()); // strictly inside ⇒ the solver lands between A,B
      const E = alongSegment(A, B, val / L);
      return {
        name: `distance-drive#${i}`,
        commands: [fp('A', A), fp('B', B), { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' }, { type: 'set-distance', a: 'E', b: 'A', value: val }],
        configs: [{ A, B, E }],
      };
    },
  },
  {
    tag: 'equal-drive',
    n: 14,
    make: (r, i) => {
      const A = { x: ri(r, -10, 0), y: ri(r, -8, 8) };
      const B = { x: ri(r, 2, 12), y: A.y + ri(r, -3, 3) };
      const E = midpoint(A, B); // |EA| = |EB| ⇔ E is the midpoint
      return {
        name: `equal-drive#${i}`,
        commands: [fp('A', A), fp('B', B), { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' }, { type: 'set-equal', a: 'E', b: 'A', c: 'E', d: 'B' }],
        configs: [{ A, B, E }],
      };
    },
  },
  {
    tag: 'square',
    n: 16,
    make: (r, i) => {
      const A = { x: ri(r, -10, 6), y: ri(r, -10, 6) };
      const ang = r() * Math.PI * 2;
      const Lr = ri(r, 3, 11);
      const B = { x: A.x + Lr * Math.cos(ang), y: A.y + Lr * Math.sin(ang) };
      const corners = squareCorners(A, B);
      return {
        name: `square#${i}`,
        commands: [fp('A', A), fp('B', B), { type: 'square', ids: ['A', 'B', 'C', 'D'] }],
        configs: corners.map(({ C, D }) => ({ A, B, C, D })),
      };
    },
  },
  {
    tag: 'parallelogram',
    n: 16,
    make: (r, i) => {
      const A = { x: ri(r, -10, 0), y: ri(r, -6, 6) };
      const B = { x: A.x + ri(r, 4, 10), y: A.y };
      const C = { x: B.x + ri(r, 1, 6), y: A.y + ri(r, 4, 9) }; // above ⇒ non-degenerate
      const D = parallelogramD(A, B, C);
      return {
        name: `parallelogram#${i}`,
        commands: [fp('A', A), fp('B', B), fp('C', C), { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }],
        configs: [{ A, B, C, D }],
      };
    },
  },
];

// COORD_MULT widens the sweep for ad-hoc bug-hunting (e.g. COORD_MULT=50); the committed
// default of 1 gives the stable regression corpus.
const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export function generateCases(mult = 1): CoordCase[] {
  const out: CoordCase[] = [];
  let s = 0x1a2b3c4d;
  let gi = 0;
  for (const fam of families) {
    for (let m = 0; m < mult; m++) {
      for (let i = 0; i < fam.n; i++) {
        s = (s + 0x6d2b79f5) | 0;
        const c = fam.make(rng(s ^ (fam.tag.length << 16) ^ Math.imul(m, 2654435761)), i);
        gi += 1;
        out.push(mult === 1 ? c : { ...c, name: `${c.name} [${gi}]` });
      }
    }
  }
  return out;
}

// ── differential comparison ──────────────────────────────────────────────────

/** Residual of the engine output against ONE configuration: the worst per-id distance. */
function residualForConfig(engine: Map<Id, Vec>, config: Record<Id, Pt>): { max: number; worstId: Id } {
  let max = -1;
  let worstId = '';
  for (const id of Object.keys(config)) {
    const e = engine.get(id);
    if (!e) return { max: Infinity, worstId: id }; // engine never produced this point
    const d = dist(e, config[id]);
    if (d > max) {
      max = d;
      worstId = id;
    }
  }
  return { max, worstId };
}

/** Best (minimum-residual) configuration match — the engine is correct iff this is within tol. */
export function compareToConfigs(
  engine: Map<Id, Vec>,
  configs: Record<Id, Pt>[],
): { residual: number; worstId: Id; configIndex: number } {
  let best = { residual: Infinity, worstId: '', configIndex: -1 };
  configs.forEach((cfg, idx) => {
    const { max, worstId } = residualForConfig(engine, cfg);
    if (max < best.residual) best = { residual: max, worstId, configIndex: idx };
  });
  return best;
}

export interface CampaignFailure {
  name: string;
  reason: 'build-error' | 'coordinate-mismatch';
  residual: number;
  worstId: Id;
  expected?: Pt;
  got?: Pt | null;
  error?: string;
  commands: Command[];
}

export interface CampaignReport {
  total: number;
  passed: number;
  failed: number;
  tol: number;
  worstResidual: number;
  failures: CampaignFailure[];
}

/** Run the campaign over the generated corpus and return a structured report (no assertions). */
export function runCoordCampaign(opts: { mult?: number; tol?: number } = {}): CampaignReport {
  const mult = opts.mult ?? Math.max(1, Number(ENV.COORD_MULT ?? 1));
  const tol = opts.tol ?? 1e-4;
  const cases = generateCases(mult);
  const failures: CampaignFailure[] = [];
  let worstResidual = 0;

  for (const tc of cases) {
    let positions: Map<Id, Vec>;
    try {
      const built = build(tc.commands);
      const e = evaluate(built.construction);
      if (!e.ok) {
        failures.push({ name: tc.name, reason: 'build-error', residual: Infinity, worstId: '', error: e.error, commands: tc.commands });
        continue;
      }
      positions = e.positions;
    } catch (err) {
      failures.push({ name: tc.name, reason: 'build-error', residual: Infinity, worstId: '', error: String(err), commands: tc.commands });
      continue;
    }
    const cmp = compareToConfigs(positions, tc.configs);
    if (Number.isFinite(cmp.residual)) worstResidual = Math.max(worstResidual, cmp.residual);
    if (cmp.residual > tol) {
      const cfg = tc.configs[cmp.configIndex] ?? tc.configs[0];
      failures.push({
        name: tc.name,
        reason: 'coordinate-mismatch',
        residual: cmp.residual,
        worstId: cmp.worstId,
        expected: cfg[cmp.worstId],
        got: positions.get(cmp.worstId) ?? null,
        commands: tc.commands,
      });
    }
  }

  return {
    total: cases.length,
    passed: cases.length - failures.length,
    failed: failures.length,
    tol,
    worstResidual,
    failures,
  };
}
