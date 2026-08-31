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
 *   Only a fact that DECLARES the plane («מישור ABCD», a free plane) owns the chip, and only while
 *   that fact is `ok`.
 *
 * #847 (ADR-3D-197) deleted the second clause this file used to carry — *"otherwise the first fact
 * that names the plane at all owns it"*. That clause was an inference, not the instruction, and the
 * operator rejected it on sight: **a relation is a statement ABOUT a plane, never a declaration of
 * one.** It also produced the inconsistency they hit — the same sentence gaining or losing a button
 * depending on what else had been typed.
 *
 * The reachability it was protecting (#821: *"the user has the option of disabling it through the
 * input panel"*) is answered instead by the data panel's PLANES section, which lists every plane the
 * figure draws with its toggle, whatever created it. Operator ruling, 2026-08-31.
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
export function planeChipsByFact(
  facts: readonly FactLike[],
  /**
   * #847 — is this fact currently satisfied? A row that FAILED cannot own a plane's affordance: it
   * materialised nothing. The operator's screenshot was exactly this — «BE מוכל במישור ABCD» amber
   * after «E אמצע AC» was deleted, still offering «הסתר מישור» for a plane it had not created.
   *
   * Optional so the pure derivation stays callable without a status map; absent means "assume ok",
   * which is the pre-#847 behaviour.
   */
  isOk: (factId: string) => boolean = () => true,
): Map<string, string[]> {
  const owner = new Map<string, string>();
  const eligible = facts.filter((f) => isOk(f.id));

  // ONLY a declaring row. There is no second pass: a plane nobody declared is reachable from the
  // panel's planes section, not from a sentence that merely mentions it.
  for (const f of eligible) {
    for (const cmd of f.cmds) {
      for (const name of planesDeclaredBy(cmd)) if (!owner.has(name)) owner.set(name, f.id);
    }
  }

  const out = new Map<string, string[]>();
  for (const f of facts) {
    const mine = [...new Set(f.cmds.flatMap(planesDeclaredBy))].filter((name) => owner.get(name) === f.id);
    out.set(f.id, mine);
  }
  return out;
}
