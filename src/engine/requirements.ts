/**
 * STATED SIDES AS REQUIREMENT RECORDS (#1470, [ADR-549](../../docs/06-decisions.md#adr-549)).
 *
 * The ONE definition of which commands state a side and what they record. `applyCommand` calls it for
 * the probe the stage-0 provers read, and `applyStep`/`applyCoupledStep` stamp the committed figure with
 * it — so a record survives every ladder path (M1 conversions, recruiter rebuilds, ownership passes)
 * without each of them having to remember to carry a field they know nothing about.
 */
import type { Command, SideRequirement } from './types';

/** The record a command states, or null when it states no side. */
export function sideRequirementOf(cmd: Command): SideRequirement | null {
  if (cmd.type === 'point-circle-side') return { kind: 'circle-side', id: cmd.id, circle: cmd.circle, side: cmd.side };
  if (cmd.type === 'point-polygon-side') return { kind: 'polygon-side', id: cmd.id, poly: [...cmd.poly], side: cmd.side };
  if (cmd.type === 'points-line-side') return { kind: 'line-side', a: cmd.a, b: cmd.b, subjects: [...cmd.subjects], rel: cmd.rel };
  return null;
}

const same = (a: SideRequirement, b: SideRequirement): boolean => JSON.stringify(a) === JSON.stringify(b);

/** `prior` plus whatever `cmds` state — a re-statement of an identical side is recorded once. */
export function recordRequirement(prior: readonly SideRequirement[] | undefined, ...cmds: Command[]): SideRequirement[] {
  const out = [...(prior ?? [])];
  for (const cmd of cmds) {
    const r = sideRequirementOf(cmd);
    if (r && !out.some((x) => same(x, r))) out.push(r);
  }
  return out;
}

/** The `requirements` field to spread into a construction — omitted when empty, so a figure without a stated side is byte-identical to before. */
export const requirementsField = (reqs: SideRequirement[]): { requirements?: SideRequirement[] } => (reqs.length ? { requirements: reqs } : {});
