/**
 * THE MANUAL'S SECTION MAP (A6 #665) — the student-facing names of the grammar families, in both
 * languages. The manual itself is CATALOG-BACKED: `manualSections` folds `CATALOG` (the coverage
 * map) into `shell/ManualScreen` sections, so a construct absent from the manual is a construct
 * absent from coverage — one list, three jobs (reference, LLM vocabulary, coverage), now four.
 *
 * A family with catalog entries MUST have a label here — the totality lock in
 * `__tests__/manual.test.ts` fails the build otherwise, so the manual can never silently skip a
 * family the parser already reads.
 */
import { CATALOG, type CatalogEntry } from '../parser/catalog';
import type { FamilyId } from '../parser/families';

export const FAMILY_LABELS: Partial<Record<FamilyId, { he: string; en: string }>> = {
  F1: { he: 'הצהרות ותחומי פרמטרים', en: 'Declarations and parameter domains' },
  F2: { he: 'הגדרת מספרים (שם = ביטוי)', en: 'Defining numbers (name = expression)' },
  F3: { he: 'ערך מוחלט', en: 'Modulus relations' },
  F4: { he: 'ארגומנט (זווית)', en: 'Argument relations' },
  F5: { he: 'מיקום במישור (רביע, ישר, מעגל, תחום)', en: 'Location (quadrant, line, circle, region)' },
  F6: { he: 'צורות (קטע, מצולע, מעגל)', en: 'Objects (segment, polygon, circle)' },
  F7: { he: 'מדידות (אורך, היקף, שטח)', en: 'Measures (length, perimeter, area)' },
  F8: { he: 'משוואות וקבוצות פתרונות', en: 'Equations and solution sets' },
  F9: { he: 'סדרות וטורים', en: 'Sequences and series' },
  F10: { he: 'טענות סוג (ממשי, מדומה טהור, צמוד)', en: 'Number-type claims (real, pure imaginary, conjugate)' },
  F11: { he: 'טענות סיווג (משולש, מרובע, מצולע משוכלל)', en: 'Classification claims (triangle, quadrilateral, regular n-gon)' },
  F12: { he: 'טענות עם כמתים (לכל n, n מינימלי, ספירה)', en: 'Quantified claims (for all n, minimal n, counting)' },
  F13: { he: 'מקומות גאומטריים', en: 'Loci' },
  G1: { he: 'משוואות פולינומיות', en: 'Polynomial equations' },
  G2: { he: 'קבוצות נקודות', en: 'Point-set asks' },
  G3: { he: 'חיתוך כבנייה', en: 'Intersection as a constructor' },
  G4: { he: 'העתקות על קבוצת נקודות', en: 'Transforms over a point set' },
  G5: { he: 'חילה על מצולע משוכלל', en: 'Incidence on a regular n-gon' },
  G6: { he: 'סינתזת משוואות', en: 'Equation synthesis' },
  G7: { he: 'סכומים על קבוצה', en: 'Sums over a set' },
  G8: { he: 'אלגברה של פרמטר ממשי', en: 'Real-parameter algebra' },
  G9: { he: 'מקומות גאומטריים לא-לינאריים', en: 'Non-linear loci' },
};

export interface ManualSectionData {
  family: FamilyId;
  title: string;
  entries: readonly CatalogEntry[];
}

/** CATALOG folded into ordered manual sections for the given locale — empty families absent. */
export function manualSections(locale: 'he' | 'en'): ManualSectionData[] {
  const byFamily = new Map<FamilyId, CatalogEntry[]>();
  for (const e of CATALOG) {
    const list = byFamily.get(e.family) ?? [];
    list.push(e);
    byFamily.set(e.family, list);
  }
  return [...byFamily.entries()].map(([family, entries]) => ({
    family,
    title: FAMILY_LABELS[family]?.[locale] ?? family,
    entries,
  }));
}
