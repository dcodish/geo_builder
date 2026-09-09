/**
 * #948 ([ADR-W-047](../../docs/06w-decisions-workspace.md#adr-w-047), the 2-D adoption) — WHICH ROW OWNS
 * A PARAMETER'S DISPLAY CHIP, and WHICH parameters have one at all.
 *
 * The operator's ruling puts the chip on *"the input line that defined the parameter - i.e. on the line
 * with p=3"*: the row that VALUED the letter, not the rows that used it. «AB = 3x» and «AC = x» keep
 * their letter; «x = 4» owns the toggle.
 *
 * The 3-D half (`src3d/store/paramChips.ts`, ADR-3D-233) is the pattern this COPIES rather than imports
 * — product trees never import each other (docs/20 §12). Two things genuinely differ here and neither is
 * cosmetic:
 *
 *  1. **The valuing command is `set-var`**, 2-D's own shape («x = 4», «α = 70»), not 3-D's
 *     `symbol-value`.
 *  2. **Two label kinds compete, not one.** 3-D had only the canvas arc; in 2-D a stated LENGTH and a
 *     stated ANGLE both print a measure label (ADR-031), and an AREA does too. Rather than enumerate
 *     them — the enumeration this ruling exists to avoid — {@link competingSymbols} asks the label
 *     builder what it actually produced: a label carries a `letter` exactly when its two forms differ,
 *     so a fourth label kind starts offering the chip with no change here.
 */
import type { MeasureLabels } from '@/replay/core';
import type { AnyCommand } from '@/engine';

/** A fact as the store holds it — only the fields this derivation reads. */
interface FactLike {
  id: string;
  cmd: AnyCommand;
  enabled: boolean;
}

/** The symbol a command VALUES, or null. One recognisable shape, never a list of look-alike rows. */
export function symbolValuedBy(cmd: AnyCommand): { sym: string; value: number } | null {
  return cmd.type === 'set-var' ? { sym: cmd.name, value: cmd.value } : null;
}

/**
 * The parameters whose two forms actually COMPETE on the figure — derived from the labels the builder
 * produced, never from a list of kinds. A symbol the student valued but nothing draws symbolically
 * (or one that stays symbolic anyway, like a radius letter — ADR-034) competes nowhere and gets no
 * chip: the chrome never offers an affordance that would change nothing.
 */
export function competingSymbols(labels: MeasureLabels): Set<string> {
  const out = new Set<string>();
  for (const group of [labels.lengths, labels.angles, labels.areas, labels.arcs]) {
    for (const l of group ?? []) if (l.letter !== undefined && l.sym !== undefined) out.add(l.sym);
  }
  return out;
}

/** What a chip needs to render: the letter the student wrote and the value they gave it. */
export interface ParamChip {
  sym: string;
  value: number;
}

/**
 * fact id → the chip that row owns, for every ENABLED fact that values a symbol whose two forms compete.
 *
 * A muted row is not in effect, so its choice would change nothing on the figure and the chip would be
 * an affordance that does nothing. When two rows value the same symbol (a restatement), the FIRST keeps
 * the chip, matching the first-binding-wins discipline the symbol table already uses.
 */
export function paramChipsByFact(facts: readonly FactLike[], competing: ReadonlySet<string>): Map<string, ParamChip> {
  const out = new Map<string, ParamChip>();
  const claimed = new Set<string>();
  for (const f of facts) {
    if (!f.enabled) continue;
    const valued = symbolValuedBy(f.cmd);
    if (!valued || !competing.has(valued.sym) || claimed.has(valued.sym)) continue;
    claimed.add(valued.sym);
    out.set(f.id, valued);
  }
  return out;
}

/**
 * Swap each label to the form the student chose. Pure and total: a label with no `letter` is returned
 * untouched, so a figure with no valued parameter is bit-identical to before this shipped.
 *
 * Applied at the RENDER seam rather than inside the fold, which is what keeps the toggle instant and
 * keeps `displayMode` out of the replay memo's key.
 */
export function applyDisplayMode(labels: MeasureLabels, showLetter: (sym: string) => boolean): MeasureLabels {
  const pick = <T extends { text: string; letter?: string; sym?: string }>(l: T): T =>
    l.letter !== undefined && l.sym !== undefined && showLetter(l.sym) ? { ...l, text: l.letter } : l;
  return {
    lengths: labels.lengths.map(pick),
    angles: labels.angles.map(pick),
    areas: (labels.areas ?? []).map(pick),
    arcs: (labels.arcs ?? []).map(pick),
  };
}
