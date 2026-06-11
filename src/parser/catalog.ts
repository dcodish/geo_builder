/**
 * Command catalog (Phase 4/5) — the user-facing command reference *and* the
 * coverage map of the engine's vocabulary.
 *
 * One entry per construct, grouped by `category`, each marked `supported` (wired
 * now — clickable to try) or not (planned; `phase` says which sub-phase delivers
 * it). The in-app panel renders this grouped, with a ✓/○ badge, so both a
 * student and the author can see at a glance what works and what's coming.
 *
 * Single source of truth — keep it in step with the rules in `parse.ts` and the
 * engine vocabulary. Flip `supported` to true (and drop `phase`) when a construct
 * lands; the panel updates itself.
 */

export type Category = 'shapes' | 'points' | 'lines' | 'constraints' | 'circles';

export interface CommandDoc {
  /** Example utterance (English) and (Hebrew). */
  en: string;
  he: string;
  /** One-line description, English and Hebrew. */
  descEn: string;
  descHe: string;
  /** Which group it appears under. */
  category: Category;
  /** False = planned but not built yet (engine can't represent it). */
  supported: boolean;
  /** For unbuilt items: the sub-phase that delivers it (e.g. '5b'), shown as a tag. */
  phase?: string;
}

/** Display order + bilingual heading for each category. */
export const CATEGORY_ORDER: Category[] = ['shapes', 'points', 'lines', 'constraints', 'circles'];
export const CATEGORY_LABELS: Record<Category, { en: string; he: string }> = {
  shapes: { en: 'Shapes', he: 'צורות' },
  points: { en: 'Points', he: 'נקודות' },
  lines: { en: 'Lines & perpendiculars', he: 'ישרים ואנכים' },
  constraints: { en: 'Constraints', he: 'אילוצים' },
  circles: { en: 'Circles', he: 'מעגלים' },
};

export const COMMAND_CATALOG: CommandDoc[] = [
  // ── Shapes ──────────────────────────────────────────────────────────────
  { category: 'shapes', supported: true, en: 'triangle ABC', he: 'משולש ABC', descEn: 'A triangle (3 free vertices).', descHe: 'משולש (3 קודקודים חופשיים).' },
  { category: 'shapes', supported: true, en: 'right triangle ABC', he: 'משולש ישר-זווית ABC', descEn: 'A right triangle (right angle at the last vertex).', descHe: 'משולש ישר-זווית (הזווית הישרה בקודקוד האחרון).' },
  { category: 'shapes', supported: true, en: 'square ABCD', he: 'ריבוע ABCD', descEn: 'A square.', descHe: 'ריבוע.' },
  { category: 'shapes', supported: true, en: 'rectangle ABCD', he: 'מלבן ABCD', descEn: 'A rectangle.', descHe: 'מלבן.' },
  { category: 'shapes', supported: true, en: 'rhombus ABCD', he: 'מעוין ABCD', descEn: 'A rhombus (4 equal sides).', descHe: 'מעוין (4 צלעות שוות).' },
  { category: 'shapes', supported: true, en: 'parallelogram ABCD', he: 'מקבילית ABCD', descEn: 'A parallelogram.', descHe: 'מקבילית.' },
  { category: 'shapes', supported: true, en: 'trapezoid ABCD', he: 'טרפז ABCD', descEn: 'A trapezoid (one pair of parallel sides).', descHe: 'טרפז (זוג צלעות מקבילות).' },
  { category: 'shapes', supported: true, en: 'quadrilateral ABCD', he: 'מרובע ABCD', descEn: 'A general quadrilateral.', descHe: 'מרובע כללי.' },

  // ── Points ──────────────────────────────────────────────────────────────
  { category: 'points', supported: true, en: 'point A at (0,0)', he: 'נקודה A ב-(0,0)', descEn: 'A free point at coordinates.', descHe: 'נקודה חופשית בקואורדינטות.' },
  { category: 'points', supported: true, en: 'point E on AC at 40%', he: 'נקודה E על AC ב-40%', descEn: 'A point on a segment (ratio optional).', descHe: 'נקודה על קטע (יחס לא חובה).' },
  { category: 'points', supported: true, en: 'C is 5 from A and 5 from B', he: 'C במרחק 5 מ-A ו-5 מ-B', descEn: 'A point at given distances from two points.', descHe: 'נקודה במרחקים נתונים משתי נקודות.' },
  { category: 'points', supported: true, en: 'M is the intersection of AC and BD', he: 'M חיתוך AC ו-BD', descEn: 'Where two lines cross (or click the dot on a crossing).', descHe: 'נקודת חיתוך של שני ישרים (או לחיצה על הסימון בהצטלבות).' },
  { category: 'points', supported: true, en: 'M is the midpoint of AB', he: 'M אמצע AB', descEn: 'The midpoint of a segment.', descHe: 'אמצע הקטע.' },
  { category: 'points', supported: true, en: 'point F on the extension of AD', he: 'נקודה F על המשך AD', descEn: 'A point beyond a segment, on its ray.', descHe: 'נקודה על המשך הקטע (מעבר לקצה).' },

  // ── Lines & perpendiculars ──────────────────────────────────────────────
  { category: 'lines', supported: true, en: 'segment AC', he: 'קטע AC', descEn: 'Connect two points (also: diagonal AC).', descHe: 'חיבור שתי נקודות (גם: אלכסון AC).' },
  { category: 'lines', supported: false, phase: '5b', en: 'BC parallel to AD', he: 'BC מקביל ל-AD', descEn: 'A line parallel to another.', descHe: 'ישר מקביל לישר אחר.' },
  { category: 'lines', supported: true, en: 'F is the foot of the perpendicular from C to AD', he: 'F רגל האנך מ-C ל-AD', descEn: 'The foot of a perpendicular dropped onto a line.', descHe: 'רגל אנך המורד אל ישר.' },
  { category: 'lines', supported: true, en: 'E is where the bisectors of BAC and BCA meet', he: 'E חיתוך חוצי הזוויות BAC ו-BCA', descEn: 'The point where two angle bisectors cross.', descHe: 'הנקודה שבה נחתכים שני חוצי זווית.' },
  { category: 'lines', supported: false, phase: '5b', en: 'median from A in ABC', he: 'תיכון מ-A במשולש ABC', descEn: 'A median (to the opposite midpoint).', descHe: 'תיכון (לאמצע הצלע שממול).' },
  { category: 'lines', supported: false, phase: '5b', en: 'height from A in ABC', he: 'גובה מ-A במשולש ABC', descEn: 'An altitude and its foot.', descHe: 'גובה והרגל שלו.' },
  { category: 'lines', supported: false, phase: '5b', en: 'perpendicular bisector of AB', he: 'אנך אמצעי ל-AB', descEn: 'The perpendicular bisector of a segment.', descHe: 'האנך האמצעי של הקטע.' },

  // ── Constraints ─────────────────────────────────────────────────────────
  { category: 'constraints', supported: true, en: 'angle GBA = 37', he: 'זווית GBA = 37', descEn: 'Set an angle — a point that can slide moves to satisfy it; otherwise it is checked.', descHe: 'קביעת זווית — נקודה שיכולה לזוז תוזז כדי לקיימה; אחרת היא נבדקת.' },
  { category: 'constraints', supported: false, phase: '5d', en: 'AB = 6', he: 'AB = 6', descEn: 'Fix a segment length.', descHe: 'קביעת אורך קטע.' },
  { category: 'constraints', supported: false, phase: '5d', en: 'AB = CD', he: 'AB = CD', descEn: 'Make two segments equal.', descHe: 'השוואת אורכי שני קטעים.' },
  { category: 'constraints', supported: false, phase: '5d', en: 'AB perpendicular to CD', he: 'AB מאונך ל-CD', descEn: 'Force a right angle between two lines.', descHe: 'אילוץ זווית ישרה בין שני ישרים.' },

  // ── Circles ─────────────────────────────────────────────────────────────
  { category: 'circles', supported: false, phase: '5c', en: 'circle centered at O radius 5', he: 'מעגל סביב O רדיוס 5', descEn: 'A circle from a centre and radius.', descHe: 'מעגל לפי מרכז ורדיוס.' },
  { category: 'circles', supported: false, phase: '5c', en: 'A is on the circle', he: 'A על המעגל', descEn: 'A point on a circle / inscribed vertex.', descHe: 'נקודה על מעגל / קודקוד חסום.' },
  { category: 'circles', supported: false, phase: '5c', en: 'diameter AB', he: 'קוטר AB', descEn: 'A chord through the centre.', descHe: 'מיתר העובר במרכז.' },
  { category: 'circles', supported: false, phase: '5c', en: 'tangent at A', he: 'משיק ב-A', descEn: 'A tangent to a circle at a point.', descHe: 'משיק למעגל בנקודה.' },
];
