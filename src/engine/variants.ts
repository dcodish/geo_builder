/**
 * Unified accessors for CYCLABLE VARIANT commands ([ADR-138](docs/06-decisions.md#adr-138) shape-variant,
 * [ADR-262](docs/06-decisions.md#adr-262) inscribe).
 *
 * A "variant command" carries a persisted, cyclable `variant` index — an unstated configuration choice
 * ([ADR-052](docs/06-decisions.md#adr-052)) that "show another configuration" steps through. `shape-variant`
 * (kite axis / isosceles apex / midsegment side) has a STATIC count per shape; `inscribe` (which container
 * side each vertex rides + the mirror) has a count computed from the shape/container structure. These
 * helpers let the store treat both uniformly, so the variant-cycling code never grows a per-type branch.
 */

import type { AnyCommand, Id } from './types';
import { VARIANT_COUNT } from './shapeVariants';
import { inscribeVariantCount } from './inscribe';

/** The number of distinct configurations a command cycles (1 for a non-variant command). */
export function variantCountOf(cmd: AnyCommand): number {
  if (cmd.type === 'shape-variant') return VARIANT_COUNT[cmd.shape];
  if (cmd.type === 'inscribe') return inscribeVariantCount(cmd);
  // The UNSTATED two-circle mutual position (#196 Am.): intersecting / disjoint / contained.
  if (cmd.type === 'set-circle-position') return cmd.relation === 'any' ? 3 : 1;
  // A common tangent's UNSTATED basin (#197 Am.): all 4 tangents; a stated kind keeps its 2.
  if (cmd.type === 'common-tangent') return cmd.kind ? 2 : 4;
  return 1;
}

/** Is this a variant command with more than one configuration (so "show another" can step it)? */
export function cyclableVariant(cmd: AnyCommand): boolean {
  return (
    (cmd.type === 'shape-variant' || cmd.type === 'inscribe' || cmd.type === 'set-circle-position' || cmd.type === 'common-tangent') &&
    variantCountOf(cmd) > 1
  );
}

/** A copy of `cmd` with its `variant` set to `v` (unchanged if not a variant command). */
export function withVariant<T extends AnyCommand>(cmd: T, v: number): T {
  if (cmd.type === 'shape-variant' || cmd.type === 'inscribe' || cmd.type === 'set-circle-position' || cmd.type === 'common-tangent')
    return { ...cmd, variant: v };
  return cmd;
}

/** The vertices a variant command draws (for highlighting a selected fact). */
export function variantVertices(cmd: AnyCommand): Id[] {
  if (cmd.type === 'shape-variant') return cmd.ids;
  if (cmd.type === 'inscribe') return [...cmd.container, ...cmd.ids];
  if (cmd.type === 'common-tangent') return [cmd.a, cmd.b];
  return [];
}
