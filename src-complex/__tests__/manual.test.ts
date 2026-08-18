/**
 * A6 (#665) — the manual is CATALOG-BACKED and TOTAL: every catalog entry appears, every family
 * with entries carries a student-facing label in both languages, and every clickable example is a
 * sentence the real grammar reads (it will be SUBMITTED on click — a manual that teaches a
 * refused phrasing is worse than no manual).
 */
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../parser/catalog';
import { parseLineV2 } from '../parser/rules';
import { FAMILY_LABELS, manualSections } from '../ui/manual';

describe('the complex manual (A6)', () => {
  it('every family with catalog entries has a label, in BOTH languages', () => {
    const families = [...new Set(CATALOG.map((e) => e.family))];
    const missing = families.filter((f) => !FAMILY_LABELS[f]?.he || !FAMILY_LABELS[f]?.en);
    expect(missing, 'a family the parser reads is missing its manual label').toEqual([]);
  });

  it('the sections carry EVERY catalog entry — absence from the manual is absence from coverage', () => {
    for (const locale of ['he', 'en'] as const) {
      const shown = manualSections(locale).flatMap((s) => s.entries);
      expect(shown).toHaveLength(CATALOG.length);
    }
  });

  it('every example the manual offers PARSES — a click submits it for real', () => {
    const refused: string[] = [];
    for (const e of CATALOG) {
      for (const line of [e.he, e.en]) {
        if (!parseLineV2(line).ok) refused.push(line);
      }
    }
    expect(refused, 'the manual must never teach a phrasing the grammar refuses').toEqual([]);
  });
});
