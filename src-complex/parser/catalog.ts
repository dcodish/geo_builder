/**
 * THE CATALOG — executable specimens, doing three jobs at once.
 *
 * Each entry is a real utterance the parser must read, in both languages, which is what lets one array
 * serve as (1) the in-app reference a student browses, (2) the vocabulary the LLM fallback is allowed
 * to emit, and (3) the COVERAGE MAP every guard test iterates. The 2-D tree's own lesson, recorded on
 * one of its entries: *"#347: the colon-ratio family had NO catalog entry, so the coverage guard never
 * exercised it and the `droppedGivenNumbers` false positive that made it unreachable in production went
 * unnoticed."*
 *
 * **Absence from this file is absence from coverage.** A construct is not done until it is here.
 */

import type { FamilyId } from './families';

export interface CatalogEntry {
  /** the family this specimen belongs to, from docs/27 §10 / §10b — the contract, not the phrasing */
  readonly family: FamilyId;
  readonly he: string;
  readonly en: string;
  readonly descHe: string;
  readonly descEn: string;
}

export const CATALOG: readonly CatalogEntry[] = [
  {
    family: 'F1',
    he: 'z1',
    en: 'z1',
    descHe: 'הצהרה על מספר מרוכב — z ו-w הם מרוכבים ללא הגדרה',
    descEn: 'declare a complex number — z and w names need no declaration',
  },
  {
    family: 'F2',
    he: 'z1 = 3+4i',
    en: 'z1 = 3+4i',
    descHe: 'הגדרה בצורה קרטזית',
    descEn: 'a cartesian definition',
  },
  {
    family: 'F2',
    he: 'z2 = 2cis150',
    en: 'z2 = 2cis150',
    descHe: 'הגדרה בצורה קוטבית',
    descEn: 'a polar definition',
  },
  {
    family: 'F2',
    he: 'w = z1*z2',
    en: 'w = z1*z2',
    descHe: 'מספר נגזר — זז עם הגורמים שלו',
    descEn: 'a derived number — it moves with its inputs',
  },
  {
    family: 'F2',
    he: 'w = conj(z3)',
    en: 'w = conj(z3)',
    descHe: 'הצמוד',
    descEn: 'the conjugate',
  },
  {
    family: 'F3',
    he: '|z1| = 9r',
    en: '|z1| = 9r',
    descHe: 'ערך מוחלט באמצעות פרמטר — r נשאר חופשי',
    descEn: 'a modulus in a parameter — r stays free',
  },
  {
    family: 'F3',
    he: '|z1| = 2|z2|',
    en: '|z1| = 2|z2|',
    descHe: 'יחס בין ערכים מוחלטים',
    descEn: 'a ratio between two moduli',
  },
  {
    family: 'F4',
    he: 'arg z1 - arg z2 = 90',
    en: 'arg z1 - arg z2 = 90',
    descHe: 'הפרש ארגומנטים',
    descEn: 'a difference of arguments',
  },
  {
    family: 'F4',
    he: 'arg z1 = 45',
    en: 'arg z1 = 45',
    descHe: 'ארגומנט נתון',
    descEn: 'a stated argument',
  },
  {
    family: 'F5',
    he: 'z1 ברביע הראשון',
    en: 'z1 in the first quadrant',
    descHe: 'רביע — בורר תצורה, לא נתון שמניע',
    descEn: 'a quadrant — it selects a configuration, it does not drive',
  },
  {
    family: 'F8',
    he: 'z^3 = 8',
    en: 'z^3 = 8',
    descHe: 'משוואה — כל הפתרונות מצוירים',
    descEn: 'an equation — every solution is plotted',
  },
  {
    family: 'F8',
    he: 'z1^3 = z3',
    en: 'z1^3 = z3',
    descHe: 'משוואה בין שני מספרים',
    descEn: 'an equation between two numbers',
  },
  {
    family: 'F8',
    he: '-2z1 = conj(z3)',
    en: '-2z1 = conj(z3)',
    descHe: 'משוואה כללית — נפתרת באלימינציה, לא באיטרציה',
    descEn: 'a general equation — solved by elimination, not iteration',
  },
  {
    family: 'F6',
    he: 'המרובע Oz1z2z3',
    en: 'quadrilateral Oz1z2z3',
    descHe: 'מצולע — ראשית הצירים O זמינה תמיד; אין כאן טענה על הצורה',
    descEn: 'a polygon — the origin O is always available; it claims nothing about the shape',
  },
  {
    family: 'F6',
    he: 'הקטע z1z2',
    en: 'segment z1z2',
    descHe: 'קטע בין שני מספרים',
    descEn: 'a segment between two numbers',
  },
  {
    family: 'F6',
    he: 'המעגל החוסם את המשולש z1z2z3',
    en: 'circumscribed circle of triangle z1z2z3',
    descHe: 'המעגל החוסם — עובר בשלוש הנקודות',
    descEn: 'the circumscribed circle — through the three points',
  },
  {
    family: 'F6',
    he: 'המעגל שמרכזו O ורדיוסו r',
    en: 'the circle with centre O and radius r',
    descHe: 'מעגל לפי מרכז ורדיוס — r נדגם, ומשתנה עם "אפשרות נוספת"',
    descEn: 'a circle by centre and radius — r is sampled, and moves on "another configuration"',
  },
  {
    family: 'F9',
    he: 'z1, z2, z3 סדרה הנדסית',
    en: 'z1, z2, z3 are a geometric sequence',
    descHe: 'סדרה הנדסית — האיברים ברשימה הם איברים עוקבים',
    descEn: 'a geometric sequence — the listed names are consecutive terms',
  },
  {
    family: 'F9',
    he: 'z1 ו-z2 הם שני האיברים הראשונים בסדרה הנדסית שבה האיבר השלישי הוא z4',
    en: 'z1 and z2 are the first two terms of a geometric sequence in which the third term is z4',
    descHe: 'איבר במקום נתון — המנה נקבעת, וכל האפשרויות שלה הן התצורות',
    descEn: 'a term at a stated position — the ratio follows, and its alternatives are the configurations',
  },
  {
    family: 'F9',
    he: 'z1, z2, z3 סדרה חשבונית',
    en: 'z1, z2, z3 are an arithmetic sequence',
    descHe: 'סדרה חשבונית — חיבורית, ולכן נפתרת בשכבה הנומרית',
    descEn: 'an arithmetic sequence — additive, so the numeric tier solves it',
  },
];

/** Group for the in-app panel; the family table is the ordering, not the insertion order. */
export const byFamily = (): Map<FamilyId, CatalogEntry[]> => {
  const out = new Map<FamilyId, CatalogEntry[]>();
  for (const e of CATALOG) {
    const list = out.get(e.family) ?? [];
    list.push(e);
    out.set(e.family, list);
  }
  return out;
};

/** Which families have at least one working specimen — the measured coverage, never the aspired one. */
export const coveredFamilies = (): FamilyId[] => [...new Set(CATALOG.map((e) => e.family))].sort();
