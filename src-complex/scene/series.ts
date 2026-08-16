/**
 * HOW A SERIES BEHAVES — the operator's headline requirement, drawn.
 *
 * *"Students should see the polar coordinates … and see how a series behaves."* A geometric sequence
 * over ℂ is the cleanest thing in the topic to look at and the hardest to picture from a formula:
 * every term is the previous one turned by `arg q` and stretched by `|q|`, so the terms lie on a
 * **logarithmic spiral** — and the two degenerate cases are exactly the two the exam asks about.
 *
 *   - `|q| = 1` — nothing stretches, so the spiral closes into a **circle**: the terms are a rotation
 *     orbit. This is the picture behind «z^(6n) takes only two values» and every roots-of-unity ask.
 *   - `arg q = 0` — nothing turns, so it collapses to a **ray** out of the origin: a real geometric
 *     sequence, the one case that looks like the sequences the student already knows.
 *
 * And the **partial sums**, head to tail: `S₁ = t₁`, `S₂ = S₁ + t₂`, … Each term is drawn as a vector
 * laid on the end of the previous one, which is the picture that makes «the sum of the terms is zero»
 * (the closed polygon) and the convergence of `|q| < 1` (the chain crawling into its limit point)
 * *visible* rather than algebraic.
 *
 * Pure, and no React: the same rule as the rest of `scene/`.
 */

import type { Cx } from '../value/value';
import type { DerivedSequence } from '../replay/derive2';

/** How a sequence's terms are laid out — the degenerate cases are named, not left to be inferred. */
export type SpiralShape = 'spiral' | 'circle' | 'ray' | 'line';

export interface SceneSpiral {
  readonly key: string;
  readonly shape: SpiralShape;
  /** the smooth path through the STATED terms, sampled for drawing */
  readonly path: readonly Cx[];
  /** the terms themselves, so the renderer can mark them without recomputing anything */
  readonly marks: readonly { readonly name: string; readonly z: Cx }[];
  /** `q = 2·cis30°` — the step, when the stated terms are adjacent and it is therefore determined */
  readonly stepLabel: string | null;
  readonly known: boolean;
}

export interface SceneChain {
  /** the origin, then every partial sum — a polyline the renderer draws head to tail */
  readonly key: string;
  readonly vertices: readonly Cx[];
  /** where the infinite sum lands, when `|q| < 1` and the terms start at the first one */
  readonly limit: Cx | null;
  /** the partial sums returned to the origin — the sum of the stated terms is zero */
  readonly closes: boolean;
  readonly known: boolean;
}

/** Enough segments that a half-turn of spiral reads as a curve rather than as a chord. */
const SAMPLES_PER_STEP = 24;

const argOf = (z: Cx): number => Math.atan2(z.im, z.re);
const absOf = (z: Cx): number => Math.hypot(z.re, z.im);

/** The signed angle from `a` to `b`, the short way — (−π, π]. */
const sweep = (a: number, b: number): number => {
  const d = (((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return d - Math.PI === -Math.PI ? Math.PI : d - Math.PI;
};

/**
 * The path through one pair of consecutive stated terms.
 *
 * **The short way round, deliberately.** Between terms Δ positions apart the true path could wind any
 * number of extra turns, and which one is right depends on intermediate terms the student never named.
 * The minimal winding is the only choice that adds no information; the terms themselves — which ARE
 * stated — are where the path is pinned, and it passes through every one of them.
 */
function arcBetween(from: Cx, to: Cx, geometric: boolean): Cx[] {
  const out: Cx[] = [];
  if (!geometric) {
    // an arithmetic sequence adds a constant, so its terms are COLLINEAR — the path is the segment
    for (let i = 1; i <= SAMPLES_PER_STEP; i++) {
      const s = i / SAMPLES_PER_STEP;
      out.push({ re: from.re + (to.re - from.re) * s, im: from.im + (to.im - from.im) * s });
    }
    return out;
  }
  const r0 = absOf(from);
  const r1 = absOf(to);
  if (r0 < 1e-12 || r1 < 1e-12) return [to];
  const a0 = argOf(from);
  const da = sweep(a0, argOf(to));
  for (let i = 1; i <= SAMPLES_PER_STEP; i++) {
    const s = i / SAMPLES_PER_STEP;
    // r(s) = r₀·(r₁/r₀)^s — the log-linear interpolation, which is what makes the curve a spiral
    const r = r0 * (r1 / r0) ** s;
    const a = a0 + da * s;
    out.push({ re: r * Math.cos(a), im: r * Math.sin(a) });
  }
  return out;
}

const shapeOf = (s: DerivedSequence): SpiralShape => {
  if (s.kind === 'arithmetic') return 'line';
  if (!s.step) return 'spiral';
  const mod = absOf(s.step);
  const turn = Math.abs(sweep(0, argOf(s.step)));
  if (turn < 1e-9) return 'ray';
  if (Math.abs(mod - 1) < 1e-9) return 'circle';
  return 'spiral';
};

const round2 = (x: number): number => {
  const r = Math.round(x * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

/** `1+i`, `2`, `3−4i` — the difference of an arithmetic sequence reads as a number, not as a pair. */
const cartesian = (z: Cx): string => {
  const re = round2(z.re);
  const im = round2(z.im);
  if (im === 0) return `${re}`;
  const mag = Math.abs(im) === 1 ? '' : `${Math.abs(im)}`;
  if (re === 0) return `${im < 0 ? '−' : ''}${mag}i`;
  return `${re}${im < 0 ? '−' : '+'}${mag}i`;
};

/** The step's reading, for the label beside the curve: polar for a ratio, cartesian for a difference. */
const stepLabel = (s: DerivedSequence): string | null => {
  if (!s.step) return null;
  if (s.kind === 'arithmetic') return `d = ${cartesian(s.step)}`;
  return `q = ${round2(absOf(s.step))}·cis${round2((argOf(s.step) * 180) / Math.PI)}°`;
};

export function spiralsOf(sequences: readonly DerivedSequence[]): SceneSpiral[] {
  return sequences
    .filter((s) => s.terms.length >= 2)
    .map((s, i) => {
      const path: Cx[] = [s.terms[0].z];
      for (let k = 1; k < s.terms.length; k++) {
        path.push(...arcBetween(s.terms[k - 1].z, s.terms[k].z, s.kind === 'geometric'));
      }
      return {
        key: `spiral-${i}`,
        shape: shapeOf(s),
        path,
        marks: s.terms.map((t) => ({ name: t.name, z: t.z })),
        stepLabel: stepLabel(s),
        known: s.known,
      };
    });
}

/**
 * The partial-sum chain over the STATED terms, in order.
 *
 * Only the stated terms: a chain that filled in the gap of «the first two terms … and the fifth» would
 * be drawing three numbers the student never wrote, at positions the givens do not force. The limit
 * point is published on the same principle — only when the terms run consecutively from the first, so
 * that `t₁/(1−q)` really is the sum of the sequence the student stated.
 */
export function chainsOf(sequences: readonly DerivedSequence[]): SceneChain[] {
  return sequences
    .filter((s) => s.terms.length >= 2)
    .map((s, i) => {
      const vertices: Cx[] = [{ re: 0, im: 0 }];
      let acc: Cx = { re: 0, im: 0 };
      for (const t of s.terms) {
        acc = { re: acc.re + t.z.re, im: acc.im + t.z.im };
        vertices.push(acc);
      }
      const consecutive =
        s.terms[0].position === 1 && s.terms.every((t, k) => t.position === k + 1);
      const q = s.kind === 'geometric' && consecutive ? s.step : null;
      const limit = q && absOf(q) < 1 - 1e-9 ? sumToInfinity(s.terms[0].z, q) : null;
      const scale = Math.max(...s.terms.map((t) => absOf(t.z)), 1e-12);
      return {
        key: `chain-${i}`,
        vertices,
        limit,
        closes: absOf(acc) <= 1e-9 * scale,
        known: s.known,
      };
    });
}

/** `t₁ / (1 − q)` — the sum of the whole geometric series, which is where the chain is heading. */
function sumToInfinity(t1: Cx, q: Cx): Cx {
  const dr = 1 - q.re;
  const di = -q.im;
  const d = dr * dr + di * di;
  return { re: (t1.re * dr + t1.im * di) / d, im: (t1.im * dr - t1.re * di) / d };
}
