/**
 * Equation → curve: the exact conic fit, and the canonicity gate.
 *
 * Everything the corpus writes as an equation is at most degree 2 in x and y, so its residual is
 *
 *     f(x, y) = A·x² + B·xy + C·y² + D·x + E·y + F
 *
 * and those six coefficients can be read off EXACTLY by evaluating `f` at seven lattice points —
 * no fitting error, no least squares, no symbolic algebra. That is why the model can carry a raw
 * equation instead of a hand-matched pattern per spelling: `(x−3)²+(y−4)²=9`, `x²+y²−2ax−2x=0` and
 * `x²−6x+y²+t=0` are three spellings of one circle, and this reads all three the same way.
 *
 * The classifier is also **the canonicity gate** (docs/19 §2a): a rotated conic (`B ≠ 0`), a
 * translated parabola or ellipse, and a hyperbola are all REFUSED by name. Twenty exams contain
 * none of them; a student who types one deserves to be told, not to be mis-drawn.
 */
import { evalExpr, type Env, type Expr } from './expr';
import type { NumCurve } from './types';

export interface Conic {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  F: number;
}

/** Read the six coefficients exactly. `env` supplies the parameters; x and y are probed here. */
export function fitConic(eq: Expr, env: Env): Conic | null {
  const at = (x: number, y: number) => evalExpr(eq, { ...env, x, y });
  const f00 = at(0, 0);
  const fp0 = at(1, 0);
  const fm0 = at(-1, 0);
  const f0p = at(0, 1);
  const f0m = at(0, -1);
  const fpp = at(1, 1);
  if (![f00, fp0, fm0, f0p, f0m, fpp].every(Number.isFinite)) return null;

  const F = f00;
  const A = (fp0 + fm0) / 2 - F;
  const D = (fp0 - fm0) / 2;
  const C = (f0p + f0m) / 2 - F;
  const E = (f0p - f0m) / 2;
  const B = fpp - (A + C + D + E + F);
  return { A, B, C, D, E, F };
}

/** Relative zero test — a coefficient is zero when it is negligible against the equation's scale. */
function isZero(v: number, scale: number): boolean {
  return Math.abs(v) <= 1e-9 * Math.max(1, scale);
}

export type ClassifyResult =
  | { ok: true; curve: NumCurve }
  /** Structurally not a curve at this parameter value (empty set, degenerate). Not an error. */
  | { ok: false; reason: 'vacant' }
  /** Outside the product's declared scope — the student is told which. */
  | { ok: false; reason: 'rotated' | 'translated-conic' | 'hyperbola' | 'not-a-curve' };

/**
 * Classify the six coefficients into the canonical family.
 *
 * `expect` is the kind decided at PARSE time. Passing it in is what makes a refusal specific: the
 * student who wrote «אליפסה» and typed a hyperbola's equation is told about the hyperbola, rather
 * than being handed a generic "cannot read that".
 */
export function classify(k: Conic, expect?: NumCurve['kind']): ClassifyResult {
  const scale = Math.max(Math.abs(k.A), Math.abs(k.B), Math.abs(k.C), Math.abs(k.D), Math.abs(k.E), Math.abs(k.F));
  if (scale === 0) return { ok: false, reason: 'not-a-curve' }; // 0 = 0, the whole plane

  const A = isZero(k.A, scale) ? 0 : k.A;
  const B = isZero(k.B, scale) ? 0 : k.B;
  const C = isZero(k.C, scale) ? 0 : k.C;
  const D = isZero(k.D, scale) ? 0 : k.D;
  const E = isZero(k.E, scale) ? 0 : k.E;
  const F = isZero(k.F, scale) ? 0 : k.F;

  if (B !== 0) return { ok: false, reason: 'rotated' };

  // --- degree 1: a line ---
  if (A === 0 && C === 0) {
    if (D === 0 && E === 0) return { ok: false, reason: 'not-a-curve' };
    return { ok: true, curve: { kind: 'line', a: D, b: E, c: F } };
  }

  // --- circle: equal square coefficients ---
  if (A !== 0 && C !== 0 && Math.abs(A - C) <= 1e-9 * Math.max(1, Math.abs(A))) {
    const cx = -D / (2 * A);
    const cy = -E / (2 * A);
    const r2 = cx * cx + cy * cy - F / A;
    if (r2 <= 0) return { ok: false, reason: 'vacant' }; // an imaginary or point circle
    return { ok: true, curve: { kind: 'circle', cx, cy, r: Math.sqrt(r2) } };
  }

  // --- parabola: exactly one square term ---
  if (A === 0 && C !== 0) {
    // C·y² + D·x + E·y + F = 0. Canonical needs E = F = 0 and D ≠ 0.
    if (E !== 0 || F !== 0) return { ok: false, reason: 'translated-conic' };
    if (D === 0) return { ok: false, reason: 'not-a-curve' };
    return { ok: true, curve: { kind: 'parabola', p: -D / (2 * C) } };
  }
  if (C === 0 && A !== 0) {
    // A parabola on the Y-axis (`x² = 2py`) is not in the corpus and not in the type.
    return { ok: false, reason: 'translated-conic' };
  }

  // --- two unequal square terms ---
  if (A * C < 0) return { ok: false, reason: 'hyperbola' };
  // Ellipse. Canonical needs no linear terms (centred at the origin) and F on the other side.
  if (D !== 0 || E !== 0) return { ok: false, reason: 'translated-conic' };
  const a2 = -F / A;
  const b2 = -F / C;
  if (a2 <= 0 || b2 <= 0) return { ok: false, reason: 'vacant' };
  if (expect === 'circle') return { ok: false, reason: 'not-a-curve' };
  return { ok: true, curve: { kind: 'ellipse', a: Math.sqrt(a2), b: Math.sqrt(b2) } };
}

/** The two steps together, for the common case. */
export function curveFromEquation(eq: Expr, env: Env, expect?: NumCurve['kind']): ClassifyResult {
  const k = fitConic(eq, env);
  if (!k) return { ok: false, reason: 'vacant' };
  return classify(k, expect);
}
