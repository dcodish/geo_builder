/**
 * Unified accessors for CYCLABLE VARIANT commands ([ADR-138](docs/06-decisions.md#adr-138) shape-variant,
 * [ADR-262](docs/06-decisions.md#adr-262) inscribe).
 *
 * A "variant command" carries a persisted, cyclable `variant` index — an unstated configuration choice
 * ([ADR-052](docs/06-decisions.md#adr-052)) that "show another configuration" steps through. `shape-variant`
 * (kite axis / isosceles apex / midsegment side) has a STATIC count per shape; `inscribe` (which container
 * side each vertex rides + the mirror) has a count computed from the shape/container structure. These
 * helpers let the store treat both uniformly, so the variant-cycling code never grows a per-type branch.
 *
 * A `measure-angle` whose stated value fits several angles (`expr.roots` — a sine's θ and 180° − θ, #1711,
 * [ADR-573](docs/06-decisions.md#adr-573)) is a variant command too: the variant picks the root, and
 * {@link withVariant} rewrites `expr.value` to it, so every reader of the value (the lowering, the label,
 * the verifier) sees the drawn angle without knowing a choice exists.
 */

import type { AnyCommand, Id } from './types';
import { VARIANT_COUNT } from './shapeVariants';
import { inscribeVariantCount } from './inscribe';

/** The stated roots of a multi-root angle given (#1711), or null. */
const angleRoots = (cmd: AnyCommand): number[] | null =>
  cmd.type === 'measure-angle' && 'value' in cmd.expr && cmd.expr.roots && cmd.expr.roots.length > 1 ? cmd.expr.roots : null;

/** The number of distinct configurations a command cycles (1 for a non-variant command). */
export function variantCountOf(cmd: AnyCommand): number {
  if (cmd.type === 'shape-variant') return VARIANT_COUNT[cmd.shape];
  if (cmd.type === 'inscribe') return inscribeVariantCount(cmd);
  // The UNSTATED two-circle mutual position (#196 Am.): intersecting / disjoint / contained.
  if (cmd.type === 'set-circle-position') return cmd.relation === 'any' ? 3 : 1;
  // A common tangent's UNSTATED basin (#197 Am.): all 4 tangents; a stated kind keeps its 2.
  if (cmd.type === 'common-tangent') return cmd.kind ? 2 : 4;
  // A stated angle value that fits several angles — the acute and obtuse root of a sine (#1711).
  const roots = angleRoots(cmd);
  if (roots) return roots.length;
  return 1;
}

/** Is this a variant command with more than one configuration (so "show another" can step it)? */
export function cyclableVariant(cmd: AnyCommand): boolean {
  return (
    (cmd.type === 'shape-variant' || cmd.type === 'inscribe' || cmd.type === 'set-circle-position' || cmd.type === 'common-tangent' || angleRoots(cmd) !== null) &&
    variantCountOf(cmd) > 1
  );
}

/** A copy of `cmd` with its `variant` set to `v` (unchanged if not a variant command). */
export function withVariant<T extends AnyCommand>(cmd: T, v: number): T {
  if (cmd.type === 'shape-variant' || cmd.type === 'inscribe' || cmd.type === 'set-circle-position' || cmd.type === 'common-tangent')
    return { ...cmd, variant: v };
  const roots = angleRoots(cmd);
  if (roots && cmd.type === 'measure-angle') {
    const k = ((v % roots.length) + roots.length) % roots.length;
    return { ...cmd, variant: k, expr: { ...cmd.expr, value: roots[k] } };
  }
  return cmd;
}

/** The vertices a variant command draws (for highlighting a selected fact). */
export function variantVertices(cmd: AnyCommand): Id[] {
  if (cmd.type === 'shape-variant') return cmd.ids;
  if (cmd.type === 'inscribe') return [...cmd.container, ...cmd.ids];
  if (cmd.type === 'common-tangent') return [cmd.a, cmd.b];
  if (angleRoots(cmd) && cmd.type === 'measure-angle') return [cmd.ray1, cmd.vertex, cmd.ray2];
  return [];
}
