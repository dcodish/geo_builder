/**
 * Validation campaign — 300+ generated diagrams across the full construct
 * vocabulary, each built command-by-command and checked against its geometric
 * **invariants** (property-based, not exact coordinates — a valid drawing can sit
 * anywhere). Diagrams come from a deterministic seeded generator so this is a
 * stable regression suite. Shape diagrams are additionally re-checked under the
 * ADR-018 sampler (a square stays a square after its free vertices are perturbed).
 *
 * Methodology chosen with the operator (2026-06-12): invariants-only ground
 * truth + a committed seeded generator.
 */

import { describe, it, expect } from 'vitest';
import type { Command, Id } from '../types';
import { build } from '../step';
import { evaluate } from '../evaluate';
import { applySeed } from '../sample';
import { inv, type Inv } from './_invariants';
import { replay, type Fact } from '@/store/geoStore';

// ── deterministic PRNG (mulberry32) ─────────────────────────────────────────
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
const fp = (id: Id, x: number, y: number): Command => ({ type: 'free-point', id, x, y });
const hyp = (dx: number, dy: number) => Math.hypot(dx, dy);

interface Case {
  name: string;
  commands: Command[];
  check: (c: Inv) => void;
  /** Also re-check the invariants under these sampler seeds (shape stays valid). */
  seeds?: number[];
}

// ── reusable shape invariant checkers (order = polygon cycle) ────────────────
const squareInv = (c: Inv, [A, B, C, D]: Id[]) => {
  c.equalLen(A, B, B, C).equalLen(B, C, C, D).equalLen(C, D, D, A);
  c.rightAngle(B, A, C).rightAngle(C, B, D);
  c.equalLen(A, C, B, D); // equal diagonals
  c.parallel(A, B, D, C).distinct(A, B, C, D);
};
const rectInv = (c: Inv, [A, B, C, D]: Id[]) => {
  c.equalLen(A, B, C, D).equalLen(B, C, D, A); // opposite sides equal
  c.rightAngle(B, A, C).rightAngle(C, B, D).rightAngle(D, C, A);
  c.parallel(A, B, D, C).parallel(A, D, B, C).distinct(A, B, C, D);
};
const rhombusInv = (c: Inv, [A, B, C, D]: Id[]) => {
  c.equalLen(A, B, B, C).equalLen(B, C, C, D).equalLen(C, D, D, A); // 4 equal sides
  c.perp(A, C, B, D); // diagonals perpendicular
  c.parallel(A, B, D, C).distinct(A, B, C, D);
};
const trapInv = (c: Inv, [A, B, C, D]: Id[]) => {
  c.parallel(A, B, D, C).distinct(A, B, C, D); // AB ∥ DC
};
const parallelogramInv = (c: Inv, [A, B, C, D]: Id[]) => {
  c.parallel(A, B, D, C).parallel(A, D, B, C);
  c.equalLen(A, B, D, C).equalLen(A, D, B, C);
  // D = A + C − B  ⇔ diagonals AC and BD share a midpoint
  const A0 = c.get(A), B0 = c.get(B), C0 = c.get(C), D0 = c.get(D);
  expect(Math.abs((A0.x + C0.x) / 2 - (B0.x + D0.x) / 2)).toBeLessThan(1e-4);
  expect(Math.abs((A0.y + C0.y) / 2 - (B0.y + D0.y) / 2)).toBeLessThan(1e-4);
  c.distinct(A, B, C, D);
};

// ── families ────────────────────────────────────────────────────────────────
type Family = { tag: string; n: number; make: (r: () => number, i: number) => Case };

const families: Family[] = [
  {
    tag: 'square',
    n: 16,
    make: (r, i) => {
      const L = ri(r, 2, 12);
      const ax = ri(r, -12, 12), ay = ri(r, -12, 12);
      const ang = r() * Math.PI * 2;
      const bx = ax + L * Math.cos(ang), by = ay + L * Math.sin(ang);
      return {
        name: `square#${i} L=${L}`,
        commands: [fp('A', ax, ay), fp('B', bx, by), { type: 'square', ids: ['A', 'B', 'C', 'D'] }],
        check: (c) => squareInv(c.length('A', 'B', L), ['A', 'B', 'C', 'D']),
      };
    },
  },
  {
    tag: 'rectangle',
    n: 14,
    make: (r, i) => {
      const L = ri(r, 3, 12);
      const ax = ri(r, -10, 10), ay = ri(r, -10, 10);
      return {
        name: `rectangle#${i} w=${L}`,
        commands: [fp('A', ax, ay), fp('B', ax + L, ay), { type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }],
        check: (c) => rectInv(c.length('A', 'B', L).length('B', 'C', 4), ['A', 'B', 'C', 'D']),
      };
    },
  },
  {
    tag: 'rhombus',
    n: 14,
    make: (r, i) => {
      const L = ri(r, 3, 11);
      const ax = ri(r, -10, 10), ay = ri(r, -10, 10);
      return {
        name: `rhombus#${i} side=${L}`,
        commands: [fp('A', ax, ay), fp('B', ax + L, ay), { type: 'rhombus', ids: ['A', 'B', 'C', 'D'] }],
        check: (c) => rhombusInv(c.length('A', 'B', L), ['A', 'B', 'C', 'D']),
      };
    },
  },
  {
    tag: 'parallelogram',
    n: 16,
    make: (r, i) => {
      // horizontal base + C strictly above → never collinear, D = A+C−B always distinct
      const ax = ri(r, -10, 10), ay = ri(r, -10, 10);
      const bx = ax + ri(r, 4, 10);
      const cx = bx + ri(r, 1, 6), cy = ay + ri(r, 4, 9);
      return {
        name: `parallelogram#${i}`,
        commands: [fp('A', ax, ay), fp('B', bx, ay), fp('C', cx, cy), { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }],
        check: (c) => parallelogramInv(c, ['A', 'B', 'C', 'D']),
      };
    },
  },
  {
    tag: 'trapezoid',
    n: 14,
    make: (r, i) => {
      const ax = ri(r, -10, 8), ay = ri(r, -8, 8);
      const bx = ax + ri(r, 6, 12);
      const dx = ax + ri(r, 0, 4), dy = ay + ri(r, 3, 8);
      return {
        name: `trapezoid#${i}`,
        commands: [fp('A', ax, ay), fp('B', bx, ay), fp('D', dx, dy), { type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }],
        check: (c) => trapInv(c, ['A', 'B', 'C', 'D']),
      };
    },
  },
  {
    tag: 'triangle',
    n: 14,
    make: (r, i) => {
      // A left, B right, C strictly above both → always distinct & non-collinear
      const ax = ri(r, -12, -4), ay = ri(r, -8, 8);
      const bx = ri(r, 4, 12), by = ri(r, -8, 8);
      const cx = ri(r, -6, 6), cy = Math.max(ay, by) + ri(r, 4, 10);
      return {
        name: `triangle#${i}`,
        commands: [fp('A', ax, ay), fp('B', bx, by), fp('C', cx, cy), { type: 'triangle', ids: ['A', 'B', 'C'] }],
        check: (c) => c.distinct('A', 'B', 'C'),
      };
    },
  },
  {
    tag: 'right-triangle',
    n: 14,
    make: (r, i) => {
      const ax = ri(r, -10, 10), ay = ri(r, -10, 10);
      const cx = ax + ri(r, -2, 2), cy = ay + ri(r, 3, 9);
      return {
        name: `right-triangle#${i}`,
        commands: [fp('A', ax, ay), fp('C', cx, cy), { type: 'right-triangle', ids: ['A', 'B', 'C'] }],
        check: (c) => c.rightAngle('C', 'A', 'B').distinct('A', 'B', 'C'),
      };
    },
  },
  {
    tag: 'on-segment',
    n: 16,
    make: (r, i) => {
      const ax = ri(r, -10, 0), ay = ri(r, -10, 10);
      const bx = ri(r, 2, 12), by = ri(r, -10, 10);
      const t = 0.1 + 0.8 * r();
      const L = hyp(bx - ax, by - ay);
      return {
        name: `on-segment#${i} t=${t.toFixed(2)}`,
        commands: [fp('A', ax, ay), fp('B', bx, by), { type: 'point-on-segment', id: 'E', a: 'A', b: 'B', t }],
        check: (c) => c.between('A', 'E', 'B').length('A', 'E', t * L),
      };
    },
  },
  {
    tag: 'on-extension',
    n: 12,
    make: (r, i) => {
      const ax = ri(r, -10, 0), ay = ri(r, -8, 8);
      const bx = ri(r, 2, 10), by = ay + ri(r, -4, 4);
      const t = 1.2 + 0.8 * r();
      const L = hyp(bx - ax, by - ay);
      return {
        name: `on-extension#${i} t=${t.toFixed(2)}`,
        commands: [fp('A', ax, ay), fp('B', bx, by), { type: 'point-on-segment', id: 'F', a: 'A', b: 'B', t }],
        check: (c) => c.collinear('A', 'B', 'F').length('A', 'F', t * L),
      };
    },
  },
  {
    tag: 'by-distances',
    n: 16,
    make: (r, i) => {
      const ax = ri(r, -10, 0), ay = ri(r, -8, 8);
      const bx = ri(r, 2, 12), by = ay + ri(r, -4, 4);
      const L = hyp(bx - ax, by - ay);
      const d1 = L * (0.55 + 0.3 * r());
      const d2 = L * (0.55 + 0.3 * r());
      const branch = i % 2;
      return {
        name: `by-distances#${i} b=${branch}`,
        commands: [
          fp('A', ax, ay),
          fp('B', bx, by),
          { type: 'point-by-distances', id: 'P', from1: 'A', dist1: d1, from2: 'B', dist2: d2, branch },
        ],
        check: (c) => c.length('P', 'A', d1).length('P', 'B', d2),
      };
    },
  },
  {
    tag: 'line-line',
    n: 16,
    make: (r, i) => {
      const ax = ri(r, -12, -2), ay = ri(r, -8, 8);
      const L = ri(r, 6, 12);
      const bx = ax + L;
      const mx = ax + Math.floor(L / 2); // strictly inside AB (≠ A, ≠ B since L ≥ 6)
      const H = ri(r, 3, 8);
      return {
        name: `line-line#${i}`,
        commands: [
          fp('A', ax, ay),
          fp('B', bx, ay), // AB horizontal
          fp('C', mx, ay - H),
          fp('D', mx, ay + H), // CD vertical, crossing AB at (mx, ay) — between A and B
          { type: 'line-line-intersection', id: 'P', a: 'A', b: 'B', c: 'C', d: 'D' },
        ],
        check: (c) => c.between('A', 'P', 'B').collinear('C', 'D', 'P'),
      };
    },
  },
  {
    tag: 'midpoint',
    n: 14,
    make: (r, i) => {
      const ax = ri(r, -12, 12), ay = ri(r, -12, 12);
      const bx = ax + ri(r, 3, 12), by = ri(r, -12, 12); // bx > ax ⇒ A ≠ B
      return {
        name: `midpoint#${i}`,
        commands: [fp('A', ax, ay), fp('B', bx, by), { type: 'midpoint', id: 'M', a: 'A', b: 'B' }],
        check: (c) => c.midpoint('M', 'A', 'B').collinear('A', 'M', 'B'),
      };
    },
  },
  {
    tag: 'foot',
    n: 16,
    make: (r, i) => {
      const ax = ri(r, -10, 0), ay = ri(r, -8, 8);
      const bx = ri(r, 2, 12), by = ay + ri(r, -3, 3);
      // P = midpoint of AB offset along the perpendicular, so its foot lands near
      // the midpoint — guaranteed distinct from A and B.
      const len = hyp(bx - ax, by - ay);
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      const h = ri(r, 4, 9) * (i % 2 ? 1 : -1);
      const px = (ax + bx) / 2 + nx * h, py = (ay + by) / 2 + ny * h;
      return {
        name: `foot#${i}`,
        commands: [fp('A', ax, ay), fp('B', bx, by), fp('P', px, py), { type: 'foot', id: 'F', from: 'P', a: 'A', b: 'B' }],
        check: (c) => c.between('A', 'F', 'B').perp('P', 'F', 'A', 'B'),
      };
    },
  },
  {
    tag: 'incenter',
    n: 14,
    make: (r, i) => {
      // horizontal base AB + C above, strictly between the ends → every interior
      // angle is well under 180°, so both bisectors are well-defined.
      const ax = ri(r, -10, 0), ay = ri(r, -8, 8);
      const w = ri(r, 6, 12);
      const bx = ax + w, by = ay;
      const cx = ax + ri(r, 2, w - 2), cy = ay + ri(r, 4, 10);
      return {
        name: `incenter#${i}`,
        commands: [
          fp('A', ax, ay),
          fp('B', bx, by),
          fp('C', cx, cy),
          { type: 'bisector', id: 'bisA', vertex: 'A', p: 'B', q: 'C' },
          { type: 'bisector', id: 'bisB', vertex: 'B', p: 'A', q: 'C' },
          { type: 'line-intersection', id: 'I', line1: 'bisA', line2: 'bisB' },
        ],
        check: (c) => c.equalAngle('A', 'B', 'I', 'A', 'I', 'C').equalAngle('B', 'A', 'I', 'B', 'I', 'C'),
      };
    },
  },
  {
    tag: 'inscribed',
    n: 16,
    make: (r, i) => {
      const ox = ri(r, -8, 8), oy = ri(r, -8, 8);
      const rad = ri(r, 3, 10);
      return {
        name: `inscribed#${i} r=${rad}`,
        commands: [
          fp('O', ox, oy),
          { type: 'circle', id: 'circle-O', center: 'O', radius: rad },
          { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
          { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
          { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
          { type: 'triangle', ids: ['A', 'B', 'C'] },
        ],
        check: (c) => c.onCircle('O', rad, 'A').onCircle('O', rad, 'B').onCircle('O', rad, 'C').distinct('A', 'B', 'C'),
      };
    },
  },
  {
    tag: 'diameter',
    n: 14,
    make: (r, i) => {
      const ox = ri(r, -8, 8), oy = ri(r, -8, 8);
      const rad = ri(r, 3, 10);
      return {
        name: `diameter#${i} r=${rad}`,
        commands: [
          fp('O', ox, oy),
          { type: 'circle', id: 'circle-O', center: 'O', radius: rad },
          { type: 'diameter', id1: 'D', id2: 'E', circle: 'circle-O' },
        ],
        check: (c) => c.onCircle('O', rad, 'D').onCircle('O', rad, 'E').midpoint('O', 'D', 'E').length('D', 'E', 2 * rad),
      };
    },
  },
  {
    tag: 'arc-midpoint',
    n: 14,
    make: (r, i) => {
      const ox = ri(r, -8, 8), oy = ri(r, -8, 8);
      const rad = ri(r, 3, 10);
      const branch = i % 2;
      return {
        name: `arc-midpoint#${i} b=${branch}`,
        commands: [
          fp('O', ox, oy),
          { type: 'circle', id: 'circle-O', center: 'O', radius: rad },
          { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
          { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
          { type: 'arc-midpoint', id: 'M', circle: 'circle-O', from: 'B', to: 'C', branch },
        ],
        check: (c) => c.onCircle('O', rad, 'M').equalLen('M', 'B', 'M', 'C'),
      };
    },
  },
  {
    tag: 'circle-circle',
    n: 14,
    make: (r, i) => {
      const ox = ri(r, -8, 8), oy = ri(r, -8, 8);
      const rad = ri(r, 4, 9);
      const d = ri(r, 2, 2 * rad - 2); // 0 < d < 2·rad (equal radii) ⇒ the circles cross
      const branch = i % 2;
      return {
        name: `circle-circle#${i} b=${branch}`,
        commands: [
          fp('O', ox, oy),
          { type: 'circle', id: 'circle-O', center: 'O', radius: rad },
          fp('P', ox + d, oy),
          { type: 'circle', id: 'circle-P', center: 'P', radius: rad },
          { type: 'circle-circle-intersection', id: 'G', circle1: 'circle-O', circle2: 'circle-P', branch },
        ],
        check: (c) => c.onCircle('O', rad, 'G').onCircle('P', rad, 'G'),
      };
    },
  },
  {
    tag: 'tangent',
    n: 12,
    make: (r, i) => {
      const ox = ri(r, -6, 6), oy = ri(r, -6, 6);
      const rad = ri(r, 3, 9);
      // A is the default top-of-circle point (θ=π/2) → A = (ox, oy+rad); tangent is horizontal.
      const ay = oy + rad;
      const tx = ox + ri(r, 2, 6);
      return {
        name: `tangent#${i} r=${rad}`,
        commands: [
          fp('O', ox, oy),
          { type: 'circle', id: 'circle-O', center: 'O', radius: rad },
          { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
          { type: 'tangent', id: 'tanA', circle: 'circle-O', at: 'A' },
          fp('P', tx, ay - 5),
          fp('Q', tx, ay + 5),
          { type: 'line-through', id: 'pq', a: 'P', b: 'Q' },
          { type: 'line-intersection', id: 'R', line1: 'tanA', line2: 'pq' },
        ],
        check: (c) => c.perp('A', 'R', 'O', 'A').onCircle('O', rad, 'A'),
      };
    },
  },
  {
    tag: 'distance-drive',
    n: 14,
    make: (r, i) => {
      const ax = ri(r, -10, 0), ay = ri(r, -8, 8);
      const bx = ri(r, 2, 12), by = ay + ri(r, -3, 3);
      const L = hyp(bx - ax, by - ay);
      const val = L * (0.2 + 0.5 * r());
      return {
        name: `distance-drive#${i}`,
        commands: [
          fp('A', ax, ay),
          fp('B', bx, by),
          { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' },
          { type: 'set-distance', a: 'E', b: 'A', value: val },
        ],
        check: (c) => c.length('E', 'A', val).between('A', 'E', 'B'),
      };
    },
  },
  {
    tag: 'equal-drive',
    n: 12,
    make: (r, i) => {
      const ax = ri(r, -10, 0), ay = ri(r, -8, 8);
      const bx = ri(r, 2, 12), by = ay + ri(r, -3, 3);
      return {
        name: `equal-drive#${i}`,
        commands: [
          fp('A', ax, ay),
          fp('B', bx, by),
          { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' },
          { type: 'set-equal', a: 'E', b: 'A', c: 'E', d: 'B' },
        ],
        check: (c) => c.equalLen('E', 'A', 'E', 'B').midpoint('E', 'A', 'B'),
      };
    },
  },
  {
    tag: 'parallel-drive',
    n: 12,
    make: (r, i) => {
      const ax = ri(r, -8, 8), ay = ri(r, -8, 8);
      const L = ri(r, 4, 10);
      const off = -ri(r, 2, 6); // transversal left of A → solved E never lands on A or B
      return {
        name: `parallel-drive#${i}`,
        commands: [
          fp('A', ax, ay),
          fp('B', ax + L, ay), // AB horizontal
          fp('P', ax + off, ay - 4),
          fp('Q', ax + off, ay + 4), // vertical transversal crossing y=ay at x=ax+off
          { type: 'point-on-segment', id: 'E', a: 'P', b: 'Q' },
          { type: 'set-parallel', a: 'A', b: 'E', c: 'A', d: 'B' },
        ],
        check: (c) => c.parallel('A', 'E', 'A', 'B').distinct('A', 'E', 'B'),
      };
    },
  },
  {
    tag: 'perp-drive',
    n: 12,
    make: (r, i) => {
      const ax = ri(r, -8, 8), ay = ri(r, -8, 8);
      const L = ri(r, 4, 10);
      const h = ri(r, 3, 7) * (i % 2 ? 1 : -1);
      return {
        name: `perp-drive#${i}`,
        commands: [
          fp('A', ax, ay),
          fp('B', ax + L, ay), // AB horizontal
          fp('P', ax - 4, ay + h),
          fp('Q', ax + 4, ay + h), // horizontal transversal at y=ay+h crossing x=ax
          { type: 'point-on-segment', id: 'E', a: 'P', b: 'Q' },
          { type: 'set-perpendicular', a: 'A', b: 'E', c: 'A', d: 'B' },
        ],
        check: (c) => c.perp('A', 'E', 'A', 'B'),
      };
    },
  },
  {
    tag: 'composition',
    n: 12,
    make: (r, i) => {
      const ax = ri(r, -8, 4), ay = ri(r, -6, 6);
      const bx = ax + ri(r, 5, 9);
      const cx = bx + ri(r, 1, 5), cy = ay + ri(r, 4, 8); // horizontal base + C above → non-degenerate
      return {
        name: `composition#${i} (square on parallelogram edge)`,
        commands: [
          fp('A', ax, ay),
          fp('B', bx, ay),
          fp('C', cx, cy),
          { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] },
          { type: 'square', ids: ['A', 'D', 'F', 'G'] },
        ],
        check: (c) => {
          parallelogramInv(c, ['A', 'B', 'C', 'D']);
          squareInv(c, ['A', 'D', 'F', 'G']);
        },
      };
    },
  },
  {
    tag: 'resample',
    n: 18,
    make: (r, i) => {
      const kind = i % 6;
      const seeds = [1 + i, 100 + i, 999 - i];
      if (kind === 0) {
        const L = ri(r, 3, 9);
        return { name: `resample#${i} square`, commands: [{ type: 'square', ids: ['A', 'B', 'C', 'D'], side: L }], seeds, check: (c) => squareInv(c, ['A', 'B', 'C', 'D']) };
      }
      if (kind === 1) return { name: `resample#${i} rectangle`, commands: [{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }], seeds, check: (c) => rectInv(c, ['A', 'B', 'C', 'D']) };
      if (kind === 2) return { name: `resample#${i} rhombus`, commands: [{ type: 'rhombus', ids: ['A', 'B', 'C', 'D'] }], seeds, check: (c) => rhombusInv(c, ['A', 'B', 'C', 'D']) };
      if (kind === 3) return { name: `resample#${i} parallelogram`, commands: [{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }], seeds, check: (c) => parallelogramInv(c, ['A', 'B', 'C', 'D']) };
      if (kind === 4) return { name: `resample#${i} trapezoid`, commands: [{ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }], seeds, check: (c) => trapInv(c, ['A', 'B', 'C', 'D']) };
      return { name: `resample#${i} right-triangle`, commands: [{ type: 'right-triangle', ids: ['A', 'B', 'C'] }], seeds, check: (c) => c.rightAngle('C', 'A', 'B').distinct('A', 'B', 'C') };
    },
  },
];

// CAMPAIGN_MULT widens the sweep for ad-hoc bug-hunting (e.g. CAMPAIGN_MULT=50);
// the committed default of 1 gives 343 cases — the stable regression suite.
// (Read via globalThis so the file typechecks without @types/node.)
const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const MULT = Math.max(1, Number(ENV.CAMPAIGN_MULT ?? 1));

function generate(): Case[] {
  const out: Case[] = [];
  let s = 0x9e3779b1;
  let gi = 0;
  for (const fam of families) {
    for (let m = 0; m < MULT; m++) {
      for (let i = 0; i < fam.n; i++) {
        s = (s + 0x6d2b79f5) | 0;
        const c = fam.make(rng(s ^ (fam.tag.length << 16) ^ Math.imul(m, 2654435761)), i);
        gi += 1;
        out.push(MULT === 1 ? c : { ...c, name: `${c.name} [${gi}]` });
      }
    }
  }
  return out;
}

const CASES = generate();

describe('validation campaign — 300+ generated diagrams (invariants)', () => {
  it(`generates at least 300 diagrams (have ${CASES.length})`, () => {
    expect(CASES.length).toBeGreaterThanOrEqual(300);
  });

  for (const tc of CASES) {
    it(tc.name, () => {
      // build command-by-command (build folds applyStep) and require a finite figure
      const { construction, positions } = build(tc.commands);
      const e = evaluate(construction);
      expect(e.ok, e.ok ? '' : e.error).toBe(true);
      tc.check(inv(positions));
      // the figure must remain a valid drawing under the residual-freedom sampler
      for (const seed of tc.seeds ?? []) {
        const se = evaluate(applySeed(construction, seed));
        expect(se.ok, `seed ${seed}: ${se.ok ? '' : se.error}`).toBe(true);
        if (se.ok) tc.check(inv(se.positions));
      }
    });
  }
});

// ── Tier-A properties over the SAME generated corpus (ADR-047) ───────────────
// Universal invariants that must hold for EVERY generated figure — not per-figure scenarios.
// They catch whole CLASSES of bug the positive-only invariant checks above can't: a
// nondeterministic build, or a divergence between the engine's `build` and the store's `replay`
// (two independent folds — see ADR-047). (Distinctness is already guaranteed by `evaluate`'s
// coincidence check, so a figure that builds is distinct by construction; not re-asserted here.)
describe('campaign — Tier-A universal properties', () => {
  const okCases = CASES.filter((tc) => evaluate(build(tc.commands).construction).ok);

  it(`builds identically twice — determinism (${okCases.length} figures)`, () => {
    for (const tc of okCases) {
      expect(build(tc.commands).positions, tc.name).toEqual(build(tc.commands).positions);
    }
  });

  it(`build() and the store's replay() agree — event-sourced equivalence (${okCases.length} figures)`, () => {
    for (const tc of okCases) {
      const built = build(tc.commands).positions;
      const facts: Fact[] = tc.commands.map((cmd, i) => ({ id: `f${i}`, cmd, enabled: true }));
      const replayed = replay(facts).positions;
      expect(replayed.size, `${tc.name}: point count (build ${built.size} vs replay ${replayed.size})`).toBe(built.size);
      for (const [id, p] of built) {
        const q = replayed.get(id);
        expect(q, `${tc.name}: ${id} present under replay`).toBeDefined();
        if (q) expect(hyp(p.x - q.x, p.y - q.y), `${tc.name}: ${id} build vs replay position`).toBeLessThan(1e-6);
      }
    }
  });
});
