/**
 * #2075 ([ADR-AG-398](../../docs/06c-decisions-analytic.md#adr-ag-398)) — an indexed point name, in any of its spellings,
 * is the ONE name it is, drawn with its index lowered. Operator, 2026-10-13: *"X_1(2,3) or X1 should create a 1 in
 * subscript"*; 2026-10-14 (card d14-2075-glyph A): «X₁» is the same point; multi-digit indexes follow 2-D; 2026-11-01:
 * *"2075 re x1 - they are the same"*.
 *
 * Measured at ebacadd1 through `decideSubmit` → `derive`: «X_1» and «X_{1}» already folded to `X₁` (#2391, ADR-AG-315),
 * but «X1(2,3)» built a SEPARATE point `X1`, drawn flat, so «X₁(2,3)» · «X1(4,5)» drew two points; «X12», «X_{12}» and
 * «X₁₂» were `not-handled` (the name took one digit). The fold is now the suite's (`shell/indexedName.foldIndexedName`,
 * `'glyph'`) at `orthography`, and every copy of the name atom reads a digit run.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { buildScene } from '../render/scene';
import { parseRenameAnalytic } from '../parser/parseAnalytic';
import { normalizePointName } from '../app/rename';
import { foldIndexedName } from '../../shell/indexedName';

/** Type the lines as the panel does: each recorded line is held; the verdict of every line. */
function typed(lines: string[]): { held: string[]; kinds: string[] } {
  const held: string[] = [];
  const kinds: string[] = [];
  for (const l of lines) {
    const v = decideSubmit(l, held, 0);
    kinds.push(v.kind === 'refused' ? `refused:${v.error.key}` : v.kind);
    if (v.kind === 'record') held.push(l);
  }
  return { held, kinds };
}
const pointIds = (held: string[]) =>
  derive(held, 0).construction.objects.filter((o) => o.kind === 'point').map((o) => o.id);

describe('#2075 — every spelling of an indexed name is one point, X₁', () => {
  it.each(['X_1(2,3)', 'X1(2,3)', 'X_{1}(2,3)', 'X₁(2,3)'])('«%s» records the point X₁ at (2,3), labelled X₁', (line) => {
    const { held, kinds } = typed([line]);
    expect(kinds).toEqual(['record']);
    expect(pointIds(held)).toEqual(['X₁']);
    const d = derive(held, 0);
    const scene = buildScene(d.figure, d.box, 600, 600);
    const p = scene.points.find((q) => q.id === 'X₁')!;
    // the label is the subscript glyph every analytic surface prints (the tool letters P₁, M₁ too)
    expect(p.label).toBe('X₁');
    const pos = d.figure.points.find((q) => q.id === 'X₁')!;
    expect([pos.x, pos.y]).toEqual([2, 3]);
  });

  it.each([
    ['X₁(2,3)', 'X1(2,3)'],
    ['X1(2,3)', 'X_1(2,3)'],
    ['X_{1}(2,3)', 'X1(2,3)'],
  ])('«%s» · «%s» is one point stated twice, never two', (a, b) => {
    const { held, kinds } = typed([a, b]);
    expect(kinds[1]).toBe('record');
    expect(pointIds(held)).toEqual(['X₁']);
  });

  it('a second spelling with other coordinates is the same point restated, so it conflicts', () => {
    const { held, kinds } = typed(['X₁(2,3)', 'X1(4,5)']);
    expect(kinds[1]).toMatch(/^refused:/);
    expect(pointIds(held)).toEqual(['X₁']);
  });

  it.each(['X12(2,3)', 'X_{12}(2,3)', 'X_12(2,3)', 'X₁₂(2,3)'])('multi-digit: «%s» records the one point X₁₂', (line) => {
    const { held, kinds } = typed([line]);
    expect(kinds).toEqual(['record']);
    expect(pointIds(held)).toEqual(['X₁₂']);
  });

  it('«A₁(2,3)» · «B1(5,1)» · «הישר A1B1» runs the line through the stated A₁ — no phantom A1', () => {
    const { held, kinds } = typed(['A₁(2,3)', 'B1(5,1)', 'הישר A1B1']);
    expect(kinds).toEqual(['record', 'record', 'record']);
    expect(pointIds(held)).toEqual(['A₁', 'B₁']);
  });

  it('a polygon spelled each way names the same vertices', () => {
    const ids = (line: string) => {
      const { held, kinds } = typed(['A1(0,0)', 'B1(4,0)', 'C1(0,3)', line]);
      expect(kinds[3], line).toBe('record');
      return pointIds(held);
    };
    expect(ids('משולש A_1B_1C_1')).toEqual(['A₁', 'B₁', 'C₁']);
    expect(ids('משולש A1B1C1')).toEqual(['A₁', 'B₁', 'C₁']);
  });

  it('rename reads every spelling: «שנה שם A1 ל-K» renames A₁', () => {
    expect(parseRenameAnalytic('שנה שם A1 ל-K')).toEqual({ from: 'A₁', to: 'K' });
    expect(parseRenameAnalytic('שנה שם A_1 ל-K')).toEqual({ from: 'A₁', to: 'K' });
    expect(normalizePointName('K12')).toBe('K₁₂');
  });
});

describe('#2075 — what is not a point index is untouched', () => {
  it.each([
    ['x_A = 4', 'x_A = 4'],
    ['A_x < B_x', 'A_x < B_x'],
    ['S_{ABC} = 6', 'S_{ABC} = 6'],
    ['y = m_1x + 1', 'y = m_1x + 1'],
    ['הישר l1 הוא y = 2x', 'הישר l1 הוא y = 2x'],
    ['A(1.5, 2)', 'A(1.5, 2)'],
    ['A1.5', 'A1.5'],
    ['נתונה הנקודה A1.', 'נתונה הנקודה A₁.'],
  ])('fold «%s» → «%s»', (src, out) => {
    expect(foldIndexedName(src, 'glyph')).toBe(out);
  });

  it('2-D keeps its own canonical form, the glued ASCII (its fold moved to the shared atom unchanged)', () => {
    expect(foldIndexedName('נקודה A_1', 'glued')).toBe('נקודה A1');
    expect(foldIndexedName('α_{12}', 'glued')).toBe('α12');
    expect(foldIndexedName('נקודה A1', 'glued')).toBe('נקודה A1');
  });

  it('a student letter never meets the tool’s internal stand-ins: «Y1», «Z1» are ordinary points', () => {
    const { held, kinds } = typed(['Z1(0,0)', 'Y1(1,1)', 'משולש ABC']);
    expect(kinds).toEqual(['record', 'record', 'record']);
    expect(pointIds(held)).toEqual(expect.arrayContaining(['Z₁', 'Y₁']));
  });
});
