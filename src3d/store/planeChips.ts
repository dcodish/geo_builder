/**
 * #842 (ADR-3D-192) → #847 (ADR-3D-197) → #1550 (ADR-3D-281) — WHICH ROW OWNS A PLANE'S DISPLAY CHIP.
 *
 * The rule, and the whole of it (operator ruling 2026-09-29 on #1550, *"the first place where a plane is
 * mentioned"*):
 *
 *   The FIRST fact row whose sentence names a plane carries that plane's chip — whether the sentence
 *   declares it («מישור ABCD») or relates it («מישור ABCD מקביל לציר z»). Later rows that mention the
 *   same plane carry none: one chip per plane. Remove that row and the chip moves to the next row that
 *   mentions the plane.
 *
 * Two qualifications, both carried over because they are about the FIGURE rather than the sentence:
 *  - a row that is not `ok` owns nothing (#847): it materialised nothing, so the next mentioning row
 *    that IS ok takes the chip;
 *  - a chip toggles a DRAWN plane, so a plane the figure does not draw has no chip anywhere (a sentence
 *    may name a plane it only measures against, e.g. «CA' מאונך למישור BC'D»).
 *
 * History, so the next reader does not re-litigate it. #842 moved the chip off every mentioning row onto
 * the declaring row, with a fallback to the first mention; #847 deleted the fallback (*"it doesn't own the
 * plane"*) and made the data panel's «מישורים» section the only toggle for an undeclared plane. #1550's
 * ruling amends #847: the chip lives on the first mention. #842's core property survives unchanged —
 * a plane is never offered by two rows at once, which was the defect the operator actually hit.
 *
 * ONE chokepoint: {@link planesNamedBy} answers "which planes does this sentence NAME", once, for every
 * command kind; ownership is simply the first row it answers for.
 */

import type { Command3 } from '../engine/types';

/** A fact as the store holds it — only the fields this derivation reads. */
interface FactLike {
  id: string;
  cmds: Command3[];
}

/** Command/claim kinds whose bare `ids` field IS a point-run plane (everywhere else `ids` is a polygon,
 *  a solid or a ring the sentence does not call a plane). */
const IDS_ARE_A_PLANE = new Set(['plane-through', 'coord-plane-rel', 'plane-line-perp', 'plane-eq']);

/**
 * Every plane this command NAMES, in the order it names them — a point-run plane by its run
 * (`ids.join('')`), a named plane (π) by its name.
 *
 * STRUCTURAL, not a switch over command kinds (the #769 / ADR-3D-183 rule: a list of kinds silently goes
 * stale the day a new command learns to name a plane). It reads the three shapes a plane takes in the
 * command vocabulary: an OPERAND (`{kind:'plane-run'}` / `{kind:'plane-named'}`, at any depth), a field
 * named `plane` (a run when an id list, a name when a string), and a declaration's `name`
 * (`plane-through`, `free-plane`, `plane3`). The one enumeration left is {@link IDS_ARE_A_PLANE}, locked by
 * `issue-1550.test.ts` against the apply reducer's own record of which runs a statement drew.
 */
export function planesNamedBy(cmd: Command3): string[] {
  const out: string[] = [];
  const add = (name: string) => {
    if (name && !out.includes(name)) out.push(name);
  };
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.kind === 'plane-run' && Array.isArray(o.ids)) add((o.ids as string[]).join(''));
    if (o.kind === 'plane-named' && typeof o.name === 'string') add(o.name);
    if ((o.type === 'plane-through' || o.type === 'free-plane' || o.type === 'plane3') && typeof o.name === 'string') add(o.name);
    else if (typeof o.type === 'string' && IDS_ARE_A_PLANE.has(o.type) && Array.isArray(o.ids) && o.ids.length >= 3) add((o.ids as string[]).join(''));
    if (Array.isArray(o.plane) && o.plane.length >= 3 && o.plane.every((x) => typeof x === 'string')) add((o.plane as string[]).join(''));
    else if (typeof o.plane === 'string') add(o.plane);
    for (const [k, val] of Object.entries(o)) {
      if (k === 'ids' || k === 'name') continue; // read above, as a run / a declaration — never as operands
      if (k === 'plane' && (typeof val === 'string' || Array.isArray(val))) continue;
      walk(val);
    }
  };
  walk(cmd);
  return out;
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
  /** #847 — is this fact currently satisfied? A row that FAILED materialised nothing and owns nothing.
   *  Absent means "assume ok". */
  isOk: (factId: string) => boolean = () => true,
  /** #1550 — does the figure DRAW this plane? A chip toggles a drawn plane; a name the figure does not
   *  draw gets no chip. Absent means "assume drawn". */
  isDrawn: (plane: string) => boolean = () => true,
): Map<string, string[]> {
  const owner = new Map<string, string>();
  for (const f of facts) {
    if (!isOk(f.id)) continue;
    for (const cmd of f.cmds) {
      for (const name of planesNamedBy(cmd)) if (!owner.has(name) && isDrawn(name)) owner.set(name, f.id);
    }
  }
  const out = new Map<string, string[]>();
  for (const f of facts) {
    const mine = [...new Set(f.cmds.flatMap(planesNamedBy))].filter((name) => owner.get(name) === f.id);
    out.set(f.id, mine);
  }
  return out;
}
