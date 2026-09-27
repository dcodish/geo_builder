/**
 * #1476 (ADR-3D-265) — THE «הצג בניה» CHIP: which rows own one, and the state it toggles.
 *
 * The operator asked to *"see the exact formation of the angle"* between two planes — the foot on the
 * seam and the two perpendiculars — through a chip on the input panel, like the plane chip. Rulings
 * (2026-09-27): the chip is on the angle's OWN fact row; it draws even while «ארגון נתונים» is closed.
 *
 * ## Which rows
 *
 * A row owns the chip iff one of its commands states an angle between two PLANES — a `plane-rel` with
 * `rel: 'angle'` (a value or a letter) or `rel: 'perp'`, both operands planar (a point run, a named
 * plane, a coordinate plane), or the legacy `plane-angle` a pre-#1439 file carries. Derived from the
 * FACT LIST (the #769 / #842 pattern), and only while the row is `ok`: a refuted statement's angle does
 * not hold on the figure, so there is nothing true to construct.
 *
 * ## The state
 *
 * `fact id → true`, absent = off (the default). The `displayMode` shape (#937, shell/displayMode): a
 * DISPLAY choice keyed by the stating fact, so it survives a reseed and a branch cycle; undoable; pruned
 * to the live facts on every toggle and load; and stored in the file by the fact's INDEX, because a load
 * re-parses the utterances into fresh ids.
 */

import type { Command3, Operand3 } from '../engine/types';

/** One angle between two planes a row states — what the canvas constructs when the chip is on. */
export interface DihedralPair3 {
  a: Operand3;
  b: Operand3;
  rel: 'angle' | 'perp';
  deg?: number;
  label?: string;
}

interface FactLike {
  id: string;
  cmds: Command3[];
}

const planar = (op: Operand3): boolean => op.kind === 'plane-run' || op.kind === 'plane-named' || op.kind === 'plane-coord';

/** The plane × plane angles one command states (empty for everything else). */
export function dihedralsStatedBy(cmd: Command3): DihedralPair3[] {
  if (cmd.type === 'plane-rel' && (cmd.rel === 'angle' || cmd.rel === 'perp') && planar(cmd.a) && planar(cmd.b)) {
    return [
      {
        a: cmd.a,
        b: cmd.b,
        rel: cmd.rel,
        ...(cmd.deg !== undefined ? { deg: cmd.deg } : {}),
        ...(cmd.label !== undefined ? { label: cmd.label } : {}),
      },
    ];
  }
  if (cmd.type === 'plane-angle') {
    return [{ a: { kind: 'plane-named', name: cmd.p1 }, b: { kind: 'plane-named', name: cmd.p2 }, rel: 'angle', deg: cmd.deg }];
  }
  return [];
}

/** fact id → the plane angles that row states. A row absent from the map shows no chip. */
export function dihedralChipsByFact(facts: readonly FactLike[], isOk: (factId: string) => boolean = () => true): Map<string, DihedralPair3[]> {
  const out = new Map<string, DihedralPair3[]>();
  for (const f of facts) {
    if (!isOk(f.id)) continue;
    const pairs = f.cmds.flatMap(dihedralsStatedBy);
    if (pairs.length) out.set(f.id, pairs);
  }
  return out;
}

/** The pairs the canvas constructs: every chip row that is switched on. */
export function shownDihedrals(chips: ReadonlyMap<string, DihedralPair3[]>, shown: DihedralShownMap): DihedralPair3[] {
  return [...chips].flatMap(([id, pairs]) => (shown[id] ? pairs : []));
}

/** fact id → on. Absent = off, the default — so only switched-on rows are ever stored. */
export type DihedralShownMap = Record<string, true>;

export function toggleDihedralShown(map: DihedralShownMap, factId: string): DihedralShownMap {
  const next = { ...map };
  if (next[factId]) delete next[factId];
  else next[factId] = true;
  return next;
}

/** Drop entries whose fact is gone — so a recycled id can never inherit a choice nobody made. */
export function pruneDihedralShown(map: DihedralShownMap, liveFactIds: Iterable<string>): DihedralShownMap {
  const live = new Set(liveFactIds);
  const out: DihedralShownMap = {};
  for (const id of Object.keys(map)) if (live.has(id) && map[id]) out[id] = true;
  return out;
}

/** To the file: the INDICES of the switched-on facts (ids do not survive a load — shell/displayMode). */
export function dihedralShownToIndexed(map: DihedralShownMap, factIds: readonly string[]): number[] {
  return factIds.flatMap((id, i) => (map[id] ? [i] : []));
}

/** From the file, against the freshly parsed facts. Anything malformed or out of range is dropped. */
export function dihedralShownFromIndexed(raw: unknown, factIds: readonly string[]): DihedralShownMap {
  if (!Array.isArray(raw)) return {};
  const out: DihedralShownMap = {};
  for (const i of raw) if (Number.isInteger(i) && i >= 0 && i < factIds.length) out[factIds[i]] = true;
  return out;
}
