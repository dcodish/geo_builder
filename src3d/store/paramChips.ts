/**
 * #937 (ADR-3D-233 / ADR-W-047) — WHICH ROW OWNS A PARAMETER'S DISPLAY CHIP.
 *
 * The operator's ruling puts it on *"the input line that defined the parameter - i.e. on the line with
 * p=3"*: the row that VALUED the letter, not the row that used it. That is the same ownership he
 * settled for #925 on 2026-09-07 — «α = 70» owns the chip, «∠SAB = α» does not — and it is the row
 * whose statement the choice is *about*.
 *
 * Two conditions, and both are load-bearing:
 *
 *  1. **The fact VALUES a parameter** — it carries a `symbol-value` command («α = 70», «p = 3»,
 *     «t = ½»). One recognisable shape, so this is a predicate over the command, never a list of the
 *     rows that happen to look like valuations today.
 *  2. **The two forms actually COMPETE on some display surface.** The operator's second answer was
 *     *"only when displays compete"*, and *compete* is a property of a **surface**: an angle's letter
 *     and value compete on the canvas arc, a coordinate's compete in the data panel, and a symbol
 *     nothing renders competes nowhere and gets no chip. The competing set is supplied by the caller,
 *     derived from the display builders themselves (`competingArcSymbols` over the wedge collection
 *     for the arc lane), so a surface that learns to hold both forms starts offering the chip with no
 *     change here. A per-KIND list would be the enumeration this ruling exists to avoid.
 *
 * Provenance is derived from the FACT LIST, the #769/#842 pattern, for the reason those chose it: a
 * list of "minting command types" goes stale the moment a new command learns to value a symbol, and
 * nothing forces it to be updated.
 */
import type { Command3 } from '../engine/types';

/** A fact as the store holds it — only the fields this derivation reads. */
interface FactLike {
  id: string;
  cmds: Command3[];
  enabled: boolean;
}

/** The symbol a command VALUES, or null. */
export function symbolValuedBy(cmd: Command3): { sym: string; value: number } | null {
  return cmd.type === 'symbol-value' ? { sym: cmd.symbol, value: cmd.value } : null;
}

/** What a chip needs to render: the letter the student wrote and the value they gave it. */
export interface ParamChip {
  sym: string;
  value: number;
}

/**
 * fact id → the chip that row owns, for every ENABLED fact that values a symbol whose two forms
 * compete somewhere.
 *
 * A muted row is not in effect, so its choice would change nothing on the figure and the chip would be
 * an affordance that does nothing — the chrome never fakes one. When two rows value the same symbol
 * (a restatement), the FIRST keeps the chip, matching the first-binding-wins discipline the symbol
 * lanes already use.
 */
export function paramChipsByFact(facts: readonly FactLike[], competing: ReadonlySet<string>): Map<string, ParamChip> {
  const out = new Map<string, ParamChip>();
  const claimed = new Set<string>();
  for (const f of facts) {
    if (!f.enabled) continue;
    for (const cmd of f.cmds) {
      const valued = symbolValuedBy(cmd);
      if (!valued || !competing.has(valued.sym) || claimed.has(valued.sym)) continue;
      claimed.add(valued.sym);
      out.set(f.id, valued);
    }
  }
  return out;
}
