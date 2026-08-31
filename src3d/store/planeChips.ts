/**
 * #842 (ADR-3D-192) — WHICH ROW OWNS A PLANE'S DISPLAY CHIP.
 *
 * Every fact row that so much as *mentions* a point-run plane used to grow a «הסתר מישור» button.
 * On the operator's figure that put the chip on two rows at once — «מישור ABCD», which drew the
 * plane, and «BE מוכל במישור ABCD», which only talks about it — and since "hide plane" was the
 * relation row's ONLY affordance, the containment read as *"this line just drew the plane again"*
 * (operator, 2026-08-31, playing #839). The plane toggle is a statement about who MADE the plane;
 * offering it from a row that did not make it is the UI asserting something false.
 *
 * The rule, and the whole of it:
 *
 *   1. If some fact DECLARES the plane («מישור ABCD», a free plane), the first such fact owns the
 *      chip. A relation stated about a plane the student already drew is not what put it on screen.
 *   2. Otherwise the first fact that names the plane at all owns it — a relation CAN be what
 *      materialised a plane (`materializePlaneRun`), and #383 requires a stated relation to leave a
 *      visible trace. Taking the chip away there would hide a plane the student can no longer reach.
 *
 * Provenance is derived from the FACT LIST, never from a list of "minting command types" — the #769
 * (ADR-3D-183) pattern, for the same reason it was chosen there: a list of kinds silently goes stale
 * every time a new command learns to name a plane, and nothing forces it to be updated.
 *
 * Applied uniformly to ∥, ⟂, ⊂, distances, claims and angles. Restricting it to containment would
 * special-case the one input the operator reported while leaving the identical defect on every other
 * relation — the patch that standing rule 1 forbids.
 */

import type { Command3 } from '../engine/types';

/** A fact as the store holds it — only the fields this derivation reads. */
interface FactLike {
  id: string;
  cmds: Command3[];
}

/**
 * Every point-run plane name this command MENTIONS, in the order it mentions them.
 *
 * This is the list that used to sit inline in the row's JSX. It is the coverage surface: a command
 * that learns to name a plane must be added here or its plane becomes unreachable when it is the
 * only mention.
 */
export function planesNamedBy(cmd: Command3): string[] {
  switch (cmd.type) {
    case 'plane-through':
      return [cmd.name];
    case 'free-plane':
      return [cmd.name]; // #487: the declaring row cycles its patch like any other plane-materialising fact
    case 'plane-rel':
    case 'mutual-rel':
    case 'distance-rel':
      return [cmd.a, cmd.b].flatMap((op) => (op.kind === 'plane-run' ? [op.ids.join('')] : []));
    case 'line-rel':
      return cmd.op.kind === 'plane-run' ? [cmd.op.ids.join('')] : [];
    case 'claim':
      return cmd.claim.type === 'plane-eq' || cmd.claim.type === 'coord-plane-rel' ? [cmd.claim.ids.join('')] : [];
    case 'coord-plane-rel':
      return cmd.ids.length > 0 ? [cmd.ids.join('')] : [];
    case 'line-plane-angle':
      return [cmd.plane.join('')];
    default:
      return [];
  }
}

/** The commands that MATERIALISE a plane by declaring it, as opposed to referring to one. */
export function planesDeclaredBy(cmd: Command3): string[] {
  return cmd.type === 'plane-through' || cmd.type === 'free-plane' ? [cmd.name] : [];
}

/**
 * The plane chips each fact row should render, keyed by fact id. A row absent from the map (or
 * mapping to an empty list) shows no plane toggle.
 *
 * Pure over the fact list, so it answers identically for a typed figure, a loaded one and an undone
 * one — the same property every notice in `engine/notices.ts` has, and for the same reason.
 */
export function planeChipsByFact(facts: readonly FactLike[]): Map<string, string[]> {
  const owner = new Map<string, string>();

  // Pass 1 — a declaring row always wins, wherever it sits in the list.
  for (const f of facts) {
    for (const cmd of f.cmds) {
      for (const name of planesDeclaredBy(cmd)) if (!owner.has(name)) owner.set(name, f.id);
    }
  }
  // Pass 2 — a plane nobody declared belongs to the first row that named it.
  for (const f of facts) {
    for (const cmd of f.cmds) {
      for (const name of planesNamedBy(cmd)) if (!owner.has(name)) owner.set(name, f.id);
    }
  }

  const out = new Map<string, string[]>();
  for (const f of facts) {
    const mine = [...new Set(f.cmds.flatMap(planesNamedBy))].filter((name) => owner.get(name) === f.id);
    out.set(f.id, mine);
  }
  return out;
}
