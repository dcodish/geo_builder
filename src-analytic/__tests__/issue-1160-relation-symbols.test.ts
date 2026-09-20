/**
 * #1160 — THE RELATION'S SYMBOLS, WHICH ARE WHAT THE EXAM PRINTS.
 *
 * The parallel/perpendicular relation was fully built and well tested; only its NOTATION was
 * unreadable. Measured before the fix:
 *
 * ```
 * AB מקביל ל-DC   ✅        AB ∥ DC     ❌ not-handled
 * AB מקבילה ל-DC  ✅        AB || DC    ❌ not-handled
 * AB is parallel to DC ✅   AB ⊥ DC     ❌ not-handled
 *                           AB מקביל DC ❌ not-handled  (no connector)
 * ```
 *
 * So a student writing what the page prints was told the tool did not understand them, for a
 * capability it had. That is this tree's recurring one-spelling gate (#1081 counted five; #1128 and
 * #1151 are the same shape), and #1129 cannot offer a ∥ or ⊥ palette chip until the glyph parses.
 *
 * **The spellings themselves are locked by the CATALOG**, which the guard re-parses in both languages —
 * a row that stops parsing fails the suite rather than becoming documentation. What this file adds is
 * the part a catalog row cannot express: the counter-direction, and one deliberate exclusion.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';

/** What the line became: the relation it states, or how it was refused. */
function read(line: string): string {
  const r = parseLine(line);
  if (!r.ok) return `refused:${r.code}`;
  const k = r.facts.find((f) => f.t === 'constraint');
  return k && k.t === 'constraint' && k.k.t === 'relation' ? `relation:${k.k.rel}` : `facts:${r.facts.map((f) => f.t).join()}`;
}

describe('#1160 — the symbols parse, and nothing else changed', () => {
  it.each([
    ['AB ∥ DC', 'relation:parallel'],
    ['AB∥DC', 'relation:parallel'],
    ['AB || DC', 'relation:parallel'],
    ['AB||DC', 'relation:parallel'],
    ['AB ⊥ DC', 'relation:perpendicular'],
    ['AB⊥DC', 'relation:perpendicular'],
    // ⟂ (U+27C2) is indistinguishable from ⊥ (U+22A5) on screen, so both are admitted.
    ['AB ⟂ DC', 'relation:perpendicular'],
  ])('«%s» states %s', (line, expected) => {
    expect(read(line)).toBe(expected);
  });

  it('the CONNECTOR is optional — the same edit, in both languages', () => {
    // «AB מקביל DC» and «AB parallel DC» were `not-handled`; the verb alone identifies the sentence.
    expect(read('AB מקביל DC')).toBe('relation:parallel');
    expect(read('AB parallel DC')).toBe('relation:parallel');
    expect(read('AB perpendicular DC')).toBe('relation:perpendicular');
    // ...and the spellings that already worked still do.
    expect(read('AB מקביל ל-DC')).toBe('relation:parallel');
    expect(read('AB is parallel to DC')).toBe('relation:parallel');
    expect(read('הצלע AB מאונכת לצלע BC')).toBe('relation:perpendicular');
  });

  it('every operand kind still resolves through the one resolver', () => {
    expect(read('AB ∥ ציר ה-x')).toBe('relation:parallel');
    expect(read('AB ⊥ l1')).toBe('relation:perpendicular');
  });

  it('COUNTER-DIRECTION: the symbol rule claims no equation, point or shape', () => {
    /**
     * The real risk of adding symbols to a rule that runs BEFORE the equation parser. A line this rule
     * claimed wrongly would be refused as a bad operand rather than falling through to be read as the
     * equation it is — so the sentences the tool already understood are asserted unchanged.
     */
    expect(read('y=2x+1')).toBe('facts:curve');
    expect(read('y = 1/2')).toBe('facts:curve');
    expect(read('(x-3)^2+(y-4)^2=9')).toBe('facts:curve');
    expect(read('נתון הישר l1: y=x')).toBe('facts:curve');
    expect(read('A(3,4)')).toBe('facts:point');
    expect(read('משולש ABC')).toBe('facts:polygon,selector');
  });

  it('«//» is DELIBERATELY not a parallel symbol', () => {
    /**
     * It is the one candidate that collides with real mathematics. Admitting it would let this rule
     * claim a division and refuse it as a bad operand. The issue's own plan says a narrower symbol set
     * is fine and a mis-parsed equation is not — asserted here so the exclusion is a decision on the
     * record rather than an oversight someone "fixes" later.
     */
    expect(read('AB//DC')).toBe('refused:not-handled');
  });

  it('a symbol with an operand the figure cannot read is an OWNED refusal', () => {
    // The verb was understood; the operand was not. That is ADR-AG-017's owned refusal, not a
    // fall-through to «I did not understand you» — the same treatment the word spellings get.
    expect(read('AB ∥ QQ')).toBe('refused:bad-operand');
  });
});
