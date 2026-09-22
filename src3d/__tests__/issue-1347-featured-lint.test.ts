/**
 * #1347 ([ADR-W-074](../../docs/06w-decisions-workspace.md#adr-w-074) Am. 1) — EVERY Csrc3d/App3.tsxED
 * GUIDE SECTION FEATURES ITS FULL SIX.
 *
 * #1275 built the mechanism; #1347 chose the rows (operator-approved, 2026-09-22). **This is the lint
 * that keeps the choice true.** Without it the flag rots exactly the way file order did: a new catalog
 * row lands in a full section, nobody marks it, and the section quietly reverts to showing whichever
 * six were written first — the defect both issues exist to remove.
 *
 * It was deliberately NOT added by #1275: no section had featured rows then, so it would have turned
 * all sixteen red and forced ~96 pedagogy decisions inside a bug fix. It lands with the decisions,
 * which is the only moment it can start green.
 *
 * The rule itself is `featuredShortfall` in the shared chrome; this file asks it about 3-D's own
 * catalog, because `shell/` may never import a product tree ([ADR-W-016](../../docs/06w-decisions-workspace.md#adr-w-016) rule 2).
 */
import { describe, expect, it } from 'vitest';
import { featuredShortfall, manualShown, type ManualEntry } from '../../shell/frame/ManualScreen';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';

/** The cap this product passes to `ManualScreen`; asserted below so it cannot drift from this lint. */
const CAP = 6;

type Row = { he: string; featured?: true };
const sections = new Map<string, Row[]>();
for (const r of COMMAND_CATALOG_3D as unknown as (Row & { category?: string })[]) {
  const k = r.category ?? '?';
  if (!sections.has(k)) sections.set(k, []);
  sections.get(k)!.push(r);
}
const capped = [...sections].filter(([, rows]) => rows.length > CAP);

describe('#1347 — 3-D: a capped section shows CHOSEN examples, not file order', () => {
  it('has capped sections at all — otherwise this file proves nothing', () => {
    expect(capped.length).toBeGreaterThan(0);
  });

  it.each(capped)('«%s» features its full six', (section, rows) => {
    const entries: ManualEntry[] = rows.map((r) => ({ example: r.he, ...(r.featured ? { featured: true as const } : {}) }));

    expect(
      featuredShortfall(entries, CAP),
      `3-D / ${section}: ${rows.length} rows, ${rows.filter((r) => r.featured).length} featured. A capped ` +
        `section must feature exactly ${CAP} — otherwise the guide falls back to whichever rows were written ` +
        `first and the next capability added here is invisible (#1275, #1347). Mark ${CAP} rows «featured: true».`,
    ).toBe(0);

    // …and what the screen SHOWS is those six — asserted through the real selection, never a re-slice.
    expect(manualShown(entries, CAP).map((e) => e.example)).toEqual(rows.filter((r) => r.featured).map((r) => r.he));
  });

  it('the cap this lint is written against is the one the app passes', async () => {
    const fs2 = await import('node:fs');
    const src = fs2.readFileSync(new URL('../../src3d/App3.tsx', import.meta.url), 'utf8');
    expect(src).toContain(`sectionCap={${CAP}}`);
  });
});
