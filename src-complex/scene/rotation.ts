/**
 * MULTIPLICATION IS A ROTATION — the one idea the Gauss plane exists to make obvious.
 *
 * `w = z·u` moves `z` by turning it through `arg u` and stretching it by `|u|`. Written as arithmetic
 * that is a formula to memorise; drawn as a swept arc from `z` to `w` with `×|u|` on it, it is a thing
 * the student watches happen — and it is the same picture as De Moivre (the corpus's most-used
 * formula), one step at a time.
 *
 * The engine decides WHICH multiplications exist and where their endpoints are
 * ({@link DerivedRotation}); this layer decides only where the ink goes: the arc is swept at the
 * radius of the number being turned, so it starts on the point it is about.
 */

import type { DerivedPoint, DerivedRotation } from '../replay/derive2';

export interface SceneRotationArc {
  readonly key: string;
  /** the radius the arc is swept at — the modulus of the number being turned */
  readonly radius: number;
  readonly fromDeg: number;
  readonly toDeg: number;
  /** `×2`, `×1` for a pure rotation — the stretch, stated beside the turn */
  readonly scaleLabel: string;
  readonly turnLabel: string;
  readonly known: boolean;
}

const round2 = (x: number): number => {
  const r = Math.round(x * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

export function rotationArcsOf(
  rotations: readonly DerivedRotation[],
  points: readonly DerivedPoint[],
): SceneRotationArc[] {
  const at = new Map(points.map((p) => [p.name, p]));
  const out: SceneRotationArc[] = [];
  for (const r of rotations) {
    const from = at.get(r.from);
    if (!from) continue;
    const radius = Math.hypot(from.z.re, from.z.im);
    if (radius < 1e-12) continue;
    out.push({
      key: r.key,
      radius,
      fromDeg: from.argumentDeg,
      toDeg: from.argumentDeg + r.byDeg,
      scaleLabel: `×${round2(r.scale)}`,
      turnLabel: `${round2(r.byDeg)}°`,
      known: r.known,
    });
  }
  return out;
}
