/**
 * Command catalog (Phase 4/5) — the user-facing reference for what can be typed.
 *
 * One entry per construct the grammar understands, with a bilingual example and
 * a one-line description. The in-app help panel renders this so students can
 * always see what's available; `supported: false` entries are shown as
 * "coming soon" so the roadmap is visible, not a silent dead end.
 *
 * Keep this in step with the rules in `parse.ts` (and the engine vocabulary).
 */

export interface CommandDoc {
  /** Example utterance (English) and (Hebrew). */
  en: string;
  he: string;
  /** One-line description, English and Hebrew. */
  descEn: string;
  descHe: string;
  /** False = planned but not built yet (engine can't represent it). */
  supported: boolean;
}

export const COMMAND_CATALOG: CommandDoc[] = [
  { en: 'triangle ABC', he: 'משולש ABC', descEn: 'A triangle (3 free vertices).', descHe: 'משולש (3 קודקודים חופשיים).', supported: true },
  { en: 'square ABCD', he: 'ריבוע ABCD', descEn: 'A square.', descHe: 'ריבוע.', supported: true },
  { en: 'rectangle ABCD', he: 'מלבן ABCD', descEn: 'A rectangle.', descHe: 'מלבן.', supported: true },
  { en: 'rhombus ABCD', he: 'מעוין ABCD', descEn: 'A rhombus (4 equal sides).', descHe: 'מעוין (4 צלעות שוות).', supported: true },
  { en: 'parallelogram ABCD', he: 'מקבילית ABCD', descEn: 'A parallelogram.', descHe: 'מקבילית.', supported: true },
  { en: 'trapezoid ABCD', he: 'טרפז ABCD', descEn: 'A trapezoid (one pair of parallel sides).', descHe: 'טרפז (זוג צלעות מקבילות).', supported: true },
  { en: 'quadrilateral ABCD', he: 'מרובע ABCD', descEn: 'A general quadrilateral.', descHe: 'מרובע כללי.', supported: true },
  { en: 'segment AC', he: 'קטע AC', descEn: 'Connect two points (also: diagonal AC).', descHe: 'חיבור שתי נקודות (גם: אלכסון AC).', supported: true },
  { en: 'point E on AC at 40%', he: 'נקודה E על AC ב-40%', descEn: 'A point on a segment (ratio optional).', descHe: 'נקודה על קטע (יחס לא חובה).', supported: true },
  { en: 'point A at (0,0)', he: 'נקודה A ב-(0,0)', descEn: 'A free point at coordinates.', descHe: 'נקודה חופשית בקואורדינטות.', supported: true },
  { en: 'C is 5 from A and 5 from B', he: 'C במרחק 5 מ-A ו-5 מ-B', descEn: 'A point at given distances from two points.', descHe: 'נקודה במרחקים נתונים משתי נקודות.', supported: true },
  { en: 'M is the intersection of AC and BD', he: 'M חיתוך AC ו-BD', descEn: 'Where two lines cross.', descHe: 'נקודת חיתוך של שני ישרים.', supported: true },
  { en: 'angle GAB = 37', he: 'זווית GAB = 37', descEn: 'Set an angle (currently checked, not yet solved).', descHe: 'קביעת זווית (כרגע נבדקת, עדיין לא נפתרת).', supported: true },

  // Planned — engine support is on the way (Phase 5b/5c). Shown so the roadmap is visible.
  { en: 'BC parallel to AD', he: 'BC מקביל ל-AD', descEn: 'A line parallel to another.', descHe: 'ישר מקביל לישר אחר.', supported: false },
  { en: 'perpendicular from A to BC', he: 'אנך מ-A ל-BC', descEn: 'A perpendicular and its foot.', descHe: 'אנך והרגל שלו.', supported: false },
  { en: 'bisector of angle ABC', he: 'חוצה זווית ABC', descEn: 'An angle bisector.', descHe: 'חוצה זווית.', supported: false },
  { en: 'circle centered at O radius 5', he: 'מעגל סביב O רדיוס 5', descEn: 'A circle.', descHe: 'מעגל.', supported: false },
];
