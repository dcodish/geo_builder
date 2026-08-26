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
    descHe: 'מעגל לפי מרכז ורדיוס — r נדגם, ומשתנה עם "הציגו תצורה אחרת"',
    descEn: 'a circle by centre and radius — r is sampled, and moves on "another configuration"',
  },
  {
    family: 'F7',
    he: 'אורך z1z2 = 15r',
    en: 'length z1z2 = 15r',
    descHe: 'אורך — נתון אם יש דרגת חופש, ואחרת טענה שנבדקת',
    descEn: 'a length — a given when a degree of freedom is free, otherwise a claim that is checked',
  },
  {
    family: 'F7',
    he: 'שטח Oz1z2z3 הוא 150r^2',
    en: 'area Oz1z2z3 is 150r^2',
    descHe: 'שטח — מכוון את הזווית החופשית (המהלך של §2b)',
    descEn: 'an area — it drives the free direction (the §2b move)',
  },
  {
    family: 'F7',
    he: 'שטח Oz1z2z3',
    en: 'area Oz1z2z3',
    descHe: 'שאלה, לא נתון — הערך מוצג רק אם הנתונים קובעים אותו',
    descEn: 'a question, not a given — the value is shown only if the givens force it',
  },
  {
    family: 'F7',
    he: 'היקף המרובע Oz1z2z3 = 60r',
    en: 'perimeter of quadrilateral Oz1z2z3 = 60r',
    descHe: 'היקף — נמדד על הצורה שכבר נבנתה',
    descEn: 'a perimeter — measured on the figure the givens already built',
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
  {
    family: 'F12',
    he: 'לכל n טבעי, w^(4n) ממשי',
    en: 'for every natural n, w^(4n) is real',
    descHe: 'טענה על כל החזקות — נקבעת בחשבון שאריות, לא בדגימה',
    descEn: 'a claim about every power at once — decided by congruence, never sampled',
  },
  {
    family: 'F12',
    he: 'ה-n המינימלי שעבורו w^n מדומה טהור הוא 2',
    en: 'the minimal n for which w^n is pure imaginary is 2',
    descHe: 'ה-n המינימלי — התלמיד עונה, הכלי בודק',
    descEn: 'the minimal n — the student answers, the tool checks',
  },
  {
    family: 'G7',
    he: 'z1*conj(z1) + z2*conj(z2) = 25',
    en: 'z1*conj(z1) + z2*conj(z2) = 25',
    descHe: 'סכום מעל קבוצה — נתון אם יש דרגת חופש, ואחרת טענה שנבדקת',
    descEn: 'a sum over a set — a given when something is free, otherwise a claim that is checked',
  },
  {
    family: 'G8',
    he: 'היחס בין שטח Oz1z2 לשטח Oz1z3',
    en: 'the ratio of area Oz1z2 to area Oz1z3',
    descHe: 'יחס בין מידות — ידוע גם כשאף אחת מהן אינה מספר, כי היחידה מצטמצמת',
    descEn: 'a ratio of measures — knowable even when neither half is a number, because the unit cancels',
  },
  {
    family: 'F4',
    he: 'arg z2 < 45',
    en: 'arg z2 < 45',
    descHe: 'אי-שוויון בארגומנט — בורר תצורה, וגם תוחם את הדגימה',
    descEn: 'an argument inequality — it selects a configuration, and bounds the sampling too',
  },
  {
    family: 'F2',
    he: 'z1 = 2cis(θ)',
    en: 'z1 = 2cis(θ)',
    descHe: 'גודל נתון בכיוון חופשי — מה שנאמר נשמר, מה שלא נאמר נשאר חופשי',
    descEn: 'a stated magnitude at a free direction — nothing stated is dropped, nothing unstated invented',
  },
  {
    family: 'F7',
    he: '|z1-z2|',
    en: '|z1-z2|',
    descHe: 'ביטוי בשורה משלו — שאלה, שנענית רק אם הנתונים קובעים את הערך',
    descEn: 'a bare expression — a question, answered only when the givens force the value',
  },
  // #791 (ADR-CX-033) — the point-label register: capitals are points, case-sensitively
  {
    family: 'F2',
    he: 'A = 5+i',
    en: 'A = 5+i',
    descHe: 'אות גדולה היא נקודה — A מרוכב; a (קטנה) נשארת פרמטר ממשי',
    descEn: 'a capital letter is a point — A is complex; lowercase a stays a real parameter',
  },
  {
    family: 'F2',
    he: 'z1 = A',
    en: 'z1 = A',
    descHe: 'שיוך אות לנקודה קיימת — נקודה אחת, מוצגת כ-A (z₁)',
    descEn: 'bind a letter to an existing number — one point, shown as A (z₁)',
  },
  {
    family: 'F7',
    he: 'אורך AB',
    en: 'length AB',
    descHe: 'מרחק בין נקודות באותיות — AB הוא מרחק, לא מכפלה (למכפלה: A*B)',
    descEn: 'the distance between lettered points — AB is a distance, never a product (A*B multiplies)',
  },
  {
    family: 'F7',
    he: 'd_{z1z2}',
    en: 'd_{AB}',
    descHe: 'צורת המרחק מהספר — שני שמות צמודים בתוך הסוגריים',
    descEn: "the textbook's distance form — two glued point names inside the braces",
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
