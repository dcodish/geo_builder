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
  { category: 'lines', supported: true, en: 'BC parallel to AD', he: 'BC מקביל ל-AD', descEn: 'Make two segments parallel (drives a sliding point, else checks).', descHe: 'הקבלת שני קטעים (מזיז נקודה שיכולה לזוז, אחרת נבדק).' },
  { category: 'lines', supported: true, en: 'F is the foot of the perpendicular from C to AD', he: 'F רגל האנך מ-C ל-AD', descEn: 'The foot of a perpendicular dropped onto a line.', descHe: 'רגל אנך המורד אל ישר.' },
  { category: 'lines', supported: true, en: 'E is where the bisectors of BAC and BCA meet', he: 'E חיתוך חוצי הזוויות BAC ו-BCA', descEn: 'The point where two angle bisectors cross.', descHe: 'הנקודה שבה נחתכים שני חוצי זווית.' },
  { category: 'lines', supported: true, en: 'bisector of angle ABC', he: 'חוצה זווית ABC', descEn: 'Draw an angle bisector.', descHe: 'ציור חוצה זווית.' },
  { category: 'lines', supported: true, en: 'line through P perpendicular to AB', he: 'ישר דרך P מאונך ל-AB', descEn: 'A perpendicular line through a point.', descHe: 'ישר מאונך דרך נקודה.' },
  { category: 'lines', supported: true, en: 'line through P parallel to AB', he: 'ישר דרך P מקביל ל-AB', descEn: 'A parallel line through a point.', descHe: 'ישר מקביל דרך נקודה.' },
  { category: 'lines', supported: true, en: 'median from A in ABC', he: 'תיכון מ-A במשולש ABC', descEn: 'A median (to the opposite midpoint).', descHe: 'תיכון (לאמצע הצלע שממול).' },
  { category: 'lines', supported: true, en: 'AD median to BC', he: 'AD תיכון לצלע BC', descEn: 'A median you name (D = midpoint of BC).', descHe: 'תיכון בשם שתבחר (D = אמצע BC).' },
  { category: 'lines', supported: true, en: 'height from A in ABC', he: 'גובה מ-A במשולש ABC', descEn: 'An altitude and its foot.', descHe: 'גובה והרגל שלו.' },
  { category: 'lines', supported: true, en: 'perpendicular bisector of AB', he: 'אנך אמצעי ל-AB', descEn: 'The perpendicular bisector of a segment.', descHe: 'האנך האמצעי של הקטע.' },
  { category: 'lines', supported: true, en: 'AD bisects angle BAC', he: 'AD חוצה את הזווית BAC', descEn: 'An angle bisector that places a point on the opposite side.', descHe: 'חוצה זווית הממקם נקודה על הצלע שממול.' },

  // ── Constraints ─────────────────────────────────────────────────────────
  { category: 'constraints', supported: true, en: 'angle GBA = 37', he: 'זווית GBA = 37', descEn: 'Set an angle — a point that can slide moves to satisfy it; otherwise it is checked.', descHe: 'קביעת זווית — נקודה שיכולה לזוז תוזז כדי לקיימה; אחרת היא נבדקת.' },
  { category: 'constraints', supported: true, en: 'AB = 6', he: 'AB = 6', descEn: 'Fix a segment length (drives a sliding point, else checks).', descHe: 'קביעת אורך קטע (מזיז נקודה שיכולה לזוז, אחרת נבדק).' },
  { category: 'constraints', supported: true, en: 'AB = CD', he: 'AB = CD', descEn: 'Make two segments equal.', descHe: 'השוואת אורכי שני קטעים.' },
  { category: 'constraints', supported: true, en: 'AB = 2 AD', he: 'AB = 2 AD', descEn: 'A proportion between two lengths (|AB| = k·|CD|).', descHe: 'יחס בין שני אורכים (|AB| = k·|CD|).' },
  { category: 'constraints', supported: true, en: 'AB perpendicular to CD', he: 'AB מאונך ל-CD', descEn: 'Force a right angle between two segments.', descHe: 'אילוץ זווית ישרה בין שני קטעים.' },
  { category: 'constraints', supported: true, en: 'ABC ≅ DEF', he: 'ABC ≅ DEF', descEn: 'Congruent triangles (≅ button). Reshapes the second to match the first (equal sides).', descHe: 'משולשים חופפים (כפתור ≅). מעצב את השני כך שיהיה חופף לראשון (צלעות שוות).' },
  { category: 'constraints', supported: true, en: 'ABC ~ DEF', he: 'ABC ~ DEF', descEn: 'Similar triangles (~ button). Reshapes the second to the same angles as the first.', descHe: 'משולשים דומים (כפתור ~). מעצב את השני לאותן זוויות כמו הראשון.' },
  { category: 'constraints', supported: true, en: 'AB = 3x', he: 'AB = 3x', descEn: 'A length as a variable (lowercase). Share it (e.g. DF = x) to set a relation; give it a value with "x = 4".', descHe: 'אורך כמשתנה (אות קטנה). שיתוף המשתנה (למשל DF = x) קובע יחס; ערך נקבע ע״י "x = 4".' },
  { category: 'constraints', supported: true, en: 'AD = 12√x', he: 'AD = 12√x', descEn: 'A length with a square root (√ button, or \\sqrt{x}). Symbolic until x gets a value (x = 4 ⇒ 24); 12√2 is a concrete length.', descHe: 'אורך עם שורש (כפתור √, או \\sqrt{x}). סימבולי עד שנקבע ערך ל-x (x = 4 ⇒ 24); 12√2 הוא אורך מספרי.' },
  { category: 'constraints', supported: true, en: 'AB = x²', he: 'AB = x²', descEn: 'A length raised to a power (x² button, or x^3). Resolves when x gets a value.', descHe: 'אורך בחזקה (כפתור x², או x^3). מתורגם למספר כשנקבע ערך ל-x.' },
  { category: 'constraints', supported: true, en: 'angle ABC = 2α', he: 'זווית ABC = 2α', descEn: 'An angle as a Greek variable. Share it (e.g. ∠DEF = α) for a relation; value via "α = 30".', descHe: 'זווית כמשתנה יווני. שיתוף המשתנה (למשל ∠DEF = α) קובע יחס; ערך ע״י "α = 30".' },
  { category: 'constraints', supported: true, en: 'α < β', he: 'α < β', descEn: 'An ordering between two named measures (< button). Reshapes the figure so the relation holds visibly (e.g. the angle labelled α comes out smaller).', descHe: 'יחס סדר בין שני מדדים בעלי שם (כפתור <). מעצב מחדש את הצורה כך שהיחס יתקיים באופן נראה (למשל הזווית שסומנה α תֵצא קטנה יותר).' },

  // ── Circles ─────────────────────────────────────────────────────────────
  { category: 'circles', supported: true, en: 'circle centered at O radius 5', he: 'מעגל סביב O רדיוס 5', descEn: 'A circle from a centre and radius.', descHe: 'מעגל לפי מרכז ורדיוס.' },
  { category: 'circles', supported: true, en: 'A is on circle O', he: 'A על מעגל O', descEn: 'A point on a circle / inscribed vertex.', descHe: 'נקודה על מעגל / קודקוד חסום.' },
  { category: 'circles', supported: true, en: 'triangle ABC inscribed in circle O', he: 'משולש ABC חסום במעגל O', descEn: 'A triangle with all vertices on a circle.', descHe: 'משולש שכל קודקודיו על מעגל.' },
  { category: 'circles', supported: true, en: 'right triangle ABC inscribed in a circle', he: 'משולש ישר-זווית ABC חסום במעגל', descEn: 'A right triangle inscribed (hypotenuse is a diameter).', descHe: 'משולש ישר-זווית חסום (היתר הוא קוטר).' },
  { category: 'circles', supported: true, en: 'circle through A B C', he: 'מעגל חוסם את ABC', descEn: 'The circle through three points (circumscribed).', descHe: 'המעגל החוסם שלושה קודקודים.' },
  { category: 'circles', supported: true, en: 'circle inscribed in triangle ABC', he: 'מעגל חסום במשולש ABC', descEn: 'The incircle — tangent to the three sides (centred at the incenter).', descHe: 'המעגל החסום — משיק לשלוש הצלעות (מרכזו מפגש חוצי הזוויות).' },
  { category: 'circles', supported: true, en: 'trapezoid ABCD inscribed in a circle', he: 'טרפז ABCD חסום במעגל', descEn: 'A cyclic (isosceles) trapezoid — also square/rectangle/rhombus.', descHe: 'טרפז חסום (שווה-שוקיים) — וכן ריבוע/מלבן/מעוין.' },
  { category: 'circles', supported: true, en: 'cyclic quadrilateral ABCD', he: 'מרובע ABCD בר חסימה', descEn: 'A quadrilateral whose vertices are concyclic (opposite angles sum to 180°) — the circle is not drawn.', descHe: 'מרובע בר חסימה — קודקודיו על מעגל (סכום זוויות נגדיות 180°), והמעגל עצמו אינו מצויר.' },
  { category: 'circles', supported: true, en: 'semicircle with diameter AB', he: 'חצי מעגל שקוטרו AB', descEn: 'A half circle: a 180° arc on the diameter AB (the diameter is drawn).', descHe: 'חצי מעגל: קשת של 180° על הקוטר AB (הקוטר מצויר).' },
  { category: 'circles', supported: true, en: 'quarter circle', he: 'רבע מעגל', descEn: 'A 90° arc with its two bounding radii.', descHe: 'קשת של 90° עם שני הרדיוסים התוחמים אותה.' },
  { category: 'circles', supported: true, en: 'chord AB in circle O', he: 'מיתר AB במעגל O', descEn: 'A chord of a circle (both ends on it).', descHe: 'מיתר במעגל (שני קצותיו עליו).' },
  { category: 'circles', supported: true, en: 'diameter AB in circle O', he: 'קוטר AB במעגל O', descEn: 'A chord through the centre.', descHe: 'מיתר העובר במרכז.' },
  { category: 'circles', supported: true, en: 'M is the midpoint of arc BC in circle O', he: 'M אמצע הקשת BC במעגל O', descEn: 'The midpoint of an arc.', descHe: 'אמצע הקשת.' },
  { category: 'circles', supported: true, en: 'tangent to circle O at A', he: 'משיק למעגל O בנקודה A', descEn: 'Draw the tangent at a point on a circle.', descHe: 'ציור המשיק בנקודה על המעגל.' },
  { category: 'circles', supported: true, en: 'E is the intersection of the tangent to circle O at A and BC', he: 'E חיתוך המשיק למעגל O בנקודה A עם BC', descEn: 'Where a tangent at a point meets a line.', descHe: 'מפגש משיק בנקודה עם ישר.' },
  { category: 'circles', supported: true, en: 'G is the intersection of circle O and circle P', he: 'G חיתוך מעגל O ומעגל P', descEn: 'Where two circles cross.', descHe: 'נקודת חיתוך של שני מעגלים.' },
  { category: 'circles', supported: true, en: 'circle O and circle P are tangent at M', he: 'מעגל O ומעגל P משיקים זה לזה בנקודה M', descEn: 'Two circles touching externally at one point M (side by side; the centres move to touch).', descHe: 'שני מעגלים משיקים זה לזה מבחוץ בנקודה אחת M (זה ליד זה; המרכזים זזים כדי להשיק).' },
  { category: 'circles', supported: true, en: 'circle O and circle P are tangent internally at M', he: 'מעגל O ומעגל P משיקים מבפנים בנקודה M', descEn: 'One circle inside the other, touching at M (needs different radii).', descHe: 'מעגל אחד בתוך השני, משיקים בנקודה M (דרושים רדיוסים שונים).' },
];
