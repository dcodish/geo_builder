/**
 * #1912 ([ADR-3D-329](../../../docs/06b-decisions-3d.md#adr-3d-329)) — 2-D's half of the shared
 * look-alike glyph table (`shell/glyphFold`).
 *
 * 2-D's four inline folds (∡∢ → ∠, the guarded `<` → ∠, ⁰ → °, «שורש N» → √) moved into the shared table
 * so 3-D and analytic read them too. **This lock is that 2-D's reading did not change under them** — the
 * hoist is behaviour-identical — plus the ONE verdict the two rows new to 2-D do change, recorded on
 * purpose: an angle BOUND written with º/˚ is now read, where 2-D's equality lane already read it.
 */
import { describe, expect, it } from 'vitest';
import { normalizeUtterance, parse } from '@/parser';

/** Two spellings must lower to the same commands. */
const same = (a: string, b: string) => {
  const ra = parse(a);
  const rb = parse(b);
  expect(ra.ok, a).toBe(true);
  expect(rb.ok, b).toBe(true);
  if (ra.ok && rb.ok) expect(ra.commands, `${a} ≡ ${b}`).toEqual(rb.commands);
};

describe('#1912 — 2-D keeps reading every glyph it already read', () => {
  it('the angle twins and the keyboard `<`', () => {
    same('∡ABC = 40°', '∠ABC = 40°');
    same('∢ABC = 40°', '∠ABC = 40°');
    same('<ABC = 40°', '∠ABC = 40°');
    // the lone-vertex «∢C = 90°» needs a triangle in context — the parity row `cat-an-058` owns it
    expect(normalizeUtterance('∢C = 90°')).toBe(normalizeUtterance('∠C = 90°'));
  });

  it('the superscript degree and the root word', () => {
    same('∠ABC = 40⁰', '∠ABC = 40°');
    same('AB = שורש 8', 'AB = √8');
    same('אורך AB הוא שורש 2', 'אורך AB הוא √2');
  });

  it('the `<` guard still keeps every comparison a comparison', () => {
    for (const s of ['AB < CD', 'α<β', 'R<r', 'k < 0', '0 < t < 1', '60 < זווית SAB < 90', '∠ABC < A']) {
      expect(normalizeUtterance(s), s).toContain('<');
      expect((normalizeUtterance(s).match(/∠/g) ?? []).length, s).toBe((s.match(/∠/g) ?? []).length);
    }
  });

  it('the degree look-alikes keep the readings they already had, byte for byte', () => {
    for (const twin of ['∠ABC = 40º', '∠ABC = 40˚', 'זווית ABC שווה ל-40º', 'זווית ABC שווה ל-40˚', 'זווית ABC היא 40º', 'זווית ABC = 40º', 'angle ABC equals 40º']) {
      const r = parse(twin);
      expect(r.ok, twin).toBe(true);
      if (r.ok) expect(r.commands, twin).toEqual([
        { type: 'segment', a: 'B', b: 'A' },
        { type: 'segment', a: 'B', b: 'C' },
        { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 40 },
      ]);
    }
  });

  it('…and nothing that is not a degree becomes one', () => {
    for (const s of ['AB = 5º', 'שטח ABC = 12º', 'הקשת CD = 40º', '40º', 'nº 3', 'A˚B']) {
      expect(parse(s).ok, s).toBe(false);
    }
  });
});

describe('#1912 — the one 2-D verdict the new rows change', () => {
  it('an angle BOUND written with º/˚ is read, as the equality form already was', () => {
    // Before: `not-handled` — 2-D's bound grammar demands a °, where its equality grammar tolerated the
    // junk character. The glyph IS the degree sign (operator ruling, #1912), so the two lanes now agree.
    for (const s of ['זווית ABC גדולה מ-40º', 'זווית ABC גדולה מ-40˚']) {
      const r = parse(s);
      expect(r.ok, s).toBe(true);
      if (r.ok) expect(r.commands, s).toEqual(parse('זווית ABC גדולה מ-40°').ok ? (parse('זווית ABC גדולה מ-40°') as { ok: true; commands: unknown[] }).commands : []);
    }
  });
});
